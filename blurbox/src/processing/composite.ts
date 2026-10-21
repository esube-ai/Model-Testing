import { moveShape, shapeBounds } from '../model/geometry';
import type { Region, Shape } from '../model/types';
import { parseHexColor } from './color';
import { blurReach, gaussianBlur } from './gaussian';
import { rasterizeShape } from './mask';
import { pixelate } from './pixelate';
import {
  blitRaster, containsRect, cropRaster, expandRect, intersectRect, isEmptyRect, toIntRect, unionRect,
  type IntRect, type Raster,
} from './raster';

/** Sigma of the lighter blur used at the rim of a feathered region. Never zero, so every pixel changes. */
export function rimSigma(sigma: number): number {
  return Math.max(1.5, sigma / 4);
}

/** Pixels the region may change: its bounds, clipped to the image (regions past the edge are clipped). */
export function regionWriteRect(r: Region, width: number, height: number): IntRect {
  const b = shapeBounds(r.shape);
  return intersectRect(toIntRect(b.x, b.y, b.w, b.h), { x: 0, y: 0, w: width, h: height });
}

/** Grid origin for pixelation: the top-left of the region's bounds, so blocks line up with the region. */
function pixelGridOrigin(shape: Shape): { x: number; y: number } {
  const b = shapeBounds(shape);
  return { x: Math.floor(b.x), y: Math.floor(b.y) };
}

/**
 * Pixels the region reads to compute its result (always contains the write rect). Blur reads a
 * bounded neighbourhood; pixelation reads whole grid cells.
 */
export function regionReadRect(r: Region, width: number, height: number): IntRect {
  const write = regionWriteRect(r, width, height);
  if (isEmptyRect(write)) return write;
  const image = { x: 0, y: 0, w: width, h: height };
  if (r.method === 'blur') return intersectRect(expandRect(write, Math.ceil(blurReach(r.blurSigma))), image);
  if (r.method === 'pixelate') {
    const b = Math.max(1, Math.round(r.pixelBlock));
    const o = pixelGridOrigin(r.shape);
    const x0 = o.x + Math.floor((write.x - o.x) / b) * b;
    const y0 = o.y + Math.floor((write.y - o.y) / b) * b;
    const x1 = o.x + Math.ceil((write.x + write.w - o.x) / b) * b;
    const y1 = o.y + Math.ceil((write.y + write.h - o.y) / b) * b;
    return intersectRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, image);
  }
  return write;
}

/**
 * Applies one region to `target` in place, using `target`'s current pixels as input (so overlapping
 * regions stack in order). Only pixels inside the shape are written.
 */
export function applyRegion(target: Raster, r: Region): void {
  const { width, height, data } = target;
  const write = regionWriteRect(r, width, height);
  if (isEmptyRect(write)) return;
  const feather = r.method === 'blur' && r.edge === 'feather' && r.featherWidth > 0;
  const mask = rasterizeShape(r.shape, write, feather);

  if (r.method === 'fill') {
    const [cr, cg, cb] = parseHexColor(r.fillColor);
    for (let j = 0; j < write.h; j++) {
      for (let i = 0; i < write.w; i++) {
        if (!mask.inside[j * write.w + i]) continue;
        const o = ((write.y + j) * width + write.x + i) * 4;
        data[o] = cr;
        data[o + 1] = cg;
        data[o + 2] = cb;
        data[o + 3] = 255;
      }
    }
    return;
  }

  const read = regionReadRect(r, width, height);
  const effect = cropRaster(target, read);
  let rim: Raster | null = null;
  if (r.method === 'blur') {
    if (feather) {
      rim = cropRaster(target, read);
      gaussianBlur(rim, rimSigma(r.blurSigma));
    }
    gaussianBlur(effect, r.blurSigma);
  } else {
    const o = pixelGridOrigin(r.shape);
    pixelate(effect, r.pixelBlock, o.x - read.x, o.y - read.y);
  }

  const e = effect.data;
  for (let j = 0; j < write.h; j++) {
    for (let i = 0; i < write.w; i++) {
      const k = j * write.w + i;
      if (!mask.inside[k]) continue;
      const o = ((write.y + j) * width + write.x + i) * 4;
      const s = ((write.y + j - read.y) * read.w + write.x + i - read.x) * 4;
      if (rim && mask.dist) {
        // Full blur in the middle, fading to the (lighter, still destructive) rim blur at the edge.
        const t = Math.min(1, mask.dist[k] / r.featherWidth);
        const rd = rim.data;
        data[o] = rd[s] + (e[s] - rd[s]) * t;
        data[o + 1] = rd[s + 1] + (e[s + 1] - rd[s + 1]) * t;
        data[o + 2] = rd[s + 2] + (e[s + 2] - rd[s + 2]) * t;
        data[o + 3] = rd[s + 3] + (e[s + 3] - rd[s + 3]) * t;
      } else {
        data[o] = e[s];
        data[o + 1] = e[s + 1];
        data[o + 2] = e[s + 2];
        data[o + 3] = e[s + 3];
      }
    }
  }
}

export function applyRegions(target: Raster, regions: readonly Region[]): void {
  for (const r of regions) applyRegion(target, r);
}

/** A region in a raster scaled by `s` (used to render the downscaled preview). */
export function scaleRegion(r: Region, s: number): Region {
  if (s === 1) return r;
  const shape: Shape =
    r.shape.kind === 'brush'
      ? { ...r.shape, points: r.shape.points.map((v) => v * s), size: r.shape.size * s }
      : { ...r.shape, x: r.shape.x * s, y: r.shape.y * s, w: r.shape.w * s, h: r.shape.h * s };
  return {
    ...r,
    shape,
    blurSigma: r.blurSigma * s,
    pixelBlock: Math.max(1, Math.round(r.pixelBlock * s)),
    featherWidth: r.featherWidth * s,
  };
}

function translateRegion(r: Region, dx: number, dy: number): Region {
  return { ...r, shape: moveShape(r.shape, dx, dy) };
}

/**
 * Renders the processed image for an area without processing the whole image. Grows `area` until
 * every region that touches it lies entirely inside (so blur context and pixel cells are complete),
 * then applies those regions to a crop of `source`. The result is pixel-identical to processing
 * the full image and cropping.
 */
export function renderArea(source: Raster, regions: readonly Region[], area: IntRect): { rect: IntRect; raster: Raster } {
  const image = { x: 0, y: 0, w: source.width, h: source.height };
  let rect = intersectRect(area, image);
  if (isEmptyRect(rect)) return { rect, raster: { width: 0, height: 0, data: new Uint8ClampedArray(0) } };
  const reads = regions.map((r) => regionReadRect(r, source.width, source.height));
  for (let changed = true; changed; ) {
    changed = false;
    for (const read of reads) {
      if (isEmptyRect(read) || isEmptyRect(intersectRect(read, rect)) || containsRect(rect, read)) continue;
      rect = unionRect(rect, read);
      changed = true;
    }
  }
  const raster = cropRaster(source, rect);
  const local = regions
    .filter((_, i) => !isEmptyRect(reads[i]) && !isEmptyRect(intersectRect(reads[i], rect)))
    .map((r) => translateRegion(r, -rect.x, -rect.y));
  applyRegions(raster, local);
  return { rect, raster };
}

/** How far outside its write area a region's result depends on input pixels. */
function regionMargin(r: Region): number {
  if (r.method === 'blur') return Math.ceil(blurReach(r.blurSigma));
  if (r.method === 'pixelate') return Math.max(1, Math.round(r.pixelBlock));
  return 0;
}

/**
 * Renders exactly `area` without processing whole regions: crops `area` plus enough margin for
 * every region that can influence it (blur reach, pixel cells, stacked overlaps), applies the
 * regions to the crop, and returns the `area` part. Pixel-identical to a full render, but its cost
 * scales with the visible area rather than with region size (used for zoomed-in detail views).
 */
export function renderVisible(source: Raster, regions: readonly Region[], area: IntRect): { rect: IntRect; raster: Raster } {
  const image = { x: 0, y: 0, w: source.width, h: source.height };
  const rect = intersectRect(area, image);
  if (isEmptyRect(rect)) return { rect, raster: { width: 0, height: 0, data: new Uint8ClampedArray(0) } };
  const allMargins = regions.reduce((m, r) => m + regionMargin(r), 0);
  const reach = expandRect(rect, allMargins);
  const relevant = regions.filter((r) => {
    const read = regionReadRect(r, source.width, source.height);
    return !isEmptyRect(read) && !isEmptyRect(intersectRect(read, reach));
  });
  const margin = relevant.reduce((m, r) => m + regionMargin(r), 0);
  const crop = intersectRect(expandRect(rect, margin), image);
  const work = cropRaster(source, crop);
  applyRegions(work, relevant.map((r) => translateRegion(r, -crop.x, -crop.y)));
  return { rect, raster: cropRaster(work, { x: rect.x - crop.x, y: rect.y - crop.y, w: rect.w, h: rect.h }) };
}

/** Full-image render: a fresh copy of `source` with every region applied. */
export function renderFull(source: Raster, regions: readonly Region[]): Raster {
  const out: Raster = { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data) };
  applyRegions(out, regions);
  return out;
}

/** Union of the areas that differ between two region lists (used for incremental preview updates). */
export function changedArea(prev: readonly Region[], next: readonly Region[], width: number, height: number): IntRect {
  let dirty: IntRect = { x: 0, y: 0, w: 0, h: 0 };
  const n = Math.max(prev.length, next.length);
  for (let i = 0; i < n; i++) {
    const a = prev[i];
    const b = next[i];
    if (a && b && (a === b || JSON.stringify(a) === JSON.stringify(b))) continue;
    if (a) dirty = unionRect(dirty, regionReadRect(a, width, height));
    if (b) dirty = unionRect(dirty, regionReadRect(b, width, height));
  }
  return dirty;
}

export { blitRaster };
