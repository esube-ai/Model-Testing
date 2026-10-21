import { describe, expect, it } from 'vitest';
import {
  applyRegion, applyRegions, changedArea, regionReadRect, renderArea, renderFull, renderVisible, rimSigma, scaleRegion,
} from '../../src/processing/composite';
import { blurReach, boxSizesForGauss, gaussianBlur } from '../../src/processing/gaussian';
import { pixelInside, rasterizeShape } from '../../src/processing/mask';
import { cropRaster, createRaster, type Raster } from '../../src/processing/raster';
import { makeRegion, defaultSettings } from '../../src/model/defaults';
import type { HideMethod, Region, Shape } from '../../src/model/types';
import { cloneRaster, noiseRaster, pixel } from '../helpers/fakeImages';

const W = 96;
const H = 72;
const base = defaultSettings(W, H);

function region(shape: Shape, method: HideMethod, extra: Partial<Region> = {}): Region {
  return makeRegion('t', shape, { ...base, method, blurSigma: 4, pixelBlock: 6, fillColor: '#ff8800', ...extra });
}

const SHAPES: Record<string, Shape> = {
  rect: { kind: 'rect', x: 20.3, y: 15.7, w: 40, h: 30 },
  ellipse: { kind: 'ellipse', x: 30, y: 10, w: 44, h: 36 },
  brush: { kind: 'brush', points: [10, 60, 30, 40, 60, 55, 85, 20], size: 9 },
};
const METHODS: HideMethod[] = ['blur', 'pixelate', 'fill'];

/** Counts pixels inside/outside the shape that changed between `a` and `b` (RGB compared). */
function diff(a: Raster, b: Raster, shape: Shape) {
  let insideTotal = 0;
  let insideChanged = 0;
  let outsideChanged = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const p = pixel(a, x, y);
      const q = pixel(b, x, y);
      const changed = p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2] || p[3] !== q[3];
      if (pixelInside(shape, x, y)) {
        insideTotal++;
        if (changed) insideChanged++;
      } else if (changed) outsideChanged++;
    }
  }
  return { insideTotal, insideChanged, outsideChanged };
}

describe('hide methods change every pixel inside a region and none outside', () => {
  for (const [name, shape] of Object.entries(SHAPES)) {
    for (const method of METHODS) {
      it(`${method} × ${name}`, () => {
        const src = noiseRaster(W, H, 7);
        const out = cloneRaster(src);
        applyRegion(out, region(shape, method));
        const d = diff(src, out, shape);
        expect(d.insideTotal).toBeGreaterThan(100);
        expect(d.insideChanged).toBe(d.insideTotal);
        expect(d.outsideChanged).toBe(0);
      });
    }
    it(`feathered blur × ${name}`, () => {
      const src = noiseRaster(W, H, 8);
      const out = cloneRaster(src);
      applyRegion(out, region(shape, 'blur', { edge: 'feather', featherWidth: 6 }));
      const d = diff(src, out, shape);
      expect(d.insideChanged).toBe(d.insideTotal);
      expect(d.outsideChanged).toBe(0);
    });
  }
});

describe('solid fill destroys pixels', () => {
  it('sets every pixel in the region to exactly the fill colour', () => {
    const src = noiseRaster(W, H, 3);
    const shape = SHAPES.ellipse;
    applyRegion(src, region(shape, 'fill', { fillColor: '#123456' }));
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!pixelInside(shape, x, y)) continue;
      expect(pixel(src, x, y)).toEqual([0x12, 0x34, 0x56, 255]);
      n++;
    }
    expect(n).toBeGreaterThan(500);
  });

  it('defaults to black', () => {
    expect(defaultSettings(10, 10).fillColor).toBe('#000000');
  });
});

describe('blur and pixelate', () => {
  it('pixelate makes each grid cell a single colour inside the region', () => {
    const src = noiseRaster(W, H, 4);
    const shape: Shape = { kind: 'rect', x: 12, y: 12, w: 36, h: 24 };
    applyRegion(src, region(shape, 'pixelate', { pixelBlock: 6 }));
    for (let cy = 12; cy < 36; cy += 6) for (let cx = 12; cx < 48; cx += 6) {
      const ref = pixel(src, cx, cy);
      for (let y = cy; y < cy + 6; y++) for (let x = cx; x < cx + 6; x++) expect(pixel(src, x, y)).toEqual(ref);
    }
  });

  it('blur samples only a bounded neighbourhood', () => {
    const shape: Shape = { kind: 'rect', x: 40, y: 30, w: 10, h: 10 };
    const r = region(shape, 'blur', { blurSigma: 3 });
    const reach = Math.ceil(blurReach(3));
    const a = noiseRaster(W, H, 9);
    const b = cloneRaster(a);
    // Change a pixel just beyond the blur's reach: the result must not depend on it.
    const far = 50 + reach;
    b.data[(35 * W + far) * 4] ^= 0xff;
    applyRegion(a, r);
    applyRegion(b, r);
    for (let y = 30; y < 40; y++) for (let x = 40; x < 50; x++) expect(pixel(a, x, y)).toEqual(pixel(b, x, y));
    expect(regionReadRect(r, W, H)).toEqual({ x: 40 - reach, y: 30 - reach, w: 10 + 2 * reach, h: 10 + 2 * reach });
  });

  it('box sizes approximate the requested sigma', () => {
    for (const sigma of [1, 2.5, 6, 20, 80]) {
      const sizes = boxSizesForGauss(sigma);
      const variance = sizes.reduce((v, w) => v + (w * w - 1) / 12, 0);
      expect(Math.sqrt(variance)).toBeCloseTo(sigma, 0);
    }
  });

  it('rim blur for feathering is weaker but never zero', () => {
    expect(rimSigma(40)).toBe(10);
    expect(rimSigma(2)).toBe(1.5);
  });
});

describe('edge-of-image regions', () => {
  it('clips regions that extend past the image instead of failing', () => {
    for (const method of METHODS) {
      const src = noiseRaster(W, H, 5);
      const out = cloneRaster(src);
      const shape: Shape = { kind: 'rect', x: -30, y: -20, w: 60, h: 50 };
      expect(() => applyRegion(out, region(shape, method))).not.toThrow();
      const d = diff(src, out, shape);
      expect(d.insideChanged).toBe(d.insideTotal);
      expect(d.outsideChanged).toBe(0);
    }
  });

  it('ignores regions entirely outside the image', () => {
    const src = noiseRaster(W, H, 5);
    const out = cloneRaster(src);
    applyRegion(out, region({ kind: 'rect', x: W + 10, y: 0, w: 20, h: 20 }, 'blur'));
    expect(out.data).toEqual(src.data);
  });

  it('blur at the image border has no dark or transparent halo', () => {
    const img = createRaster(W, H);
    for (let i = 0; i < img.data.length; i += 4) img.data.set([200, 120, 40, 255], i);
    applyRegion(img, region({ kind: 'rect', x: -5, y: -5, w: W + 10, h: H + 10 }, 'blur', { blurSigma: 12 }));
    for (let i = 0; i < img.data.length; i += 4) {
      expect([img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]).toEqual([200, 120, 40, 255]);
    }
  });

  it('blur does not bleed dark colour from transparent pixels', () => {
    // Left half opaque red, right half fully transparent black.
    const img = noiseRaster(40, 10, 1, (x) => (x < 20 ? 255 : 0));
    for (let y = 0; y < 10; y++) for (let x = 0; x < 40; x++) {
      const i = (y * 40 + x) * 4;
      img.data.set(x < 20 ? [255, 0, 0, 255] : [0, 0, 0, 0], i);
    }
    gaussianBlur(img, 3);
    for (let x = 14; x < 26; x++) {
      const [r, g, b, a] = pixel(img, x, 5);
      if (a > 8) {
        expect(r).toBeGreaterThan(240); // stays red, not darkened toward black
        expect(g + b).toBeLessThan(10);
      }
    }
  });
});

describe('rendering', () => {
  const regions: Region[] = [
    { ...region(SHAPES.rect, 'blur'), id: 'a' },
    { ...region(SHAPES.ellipse, 'pixelate'), id: 'b' },
    { ...region(SHAPES.brush, 'fill'), id: 'c' },
  ];

  it('renderArea matches a full render cropped to the same area', () => {
    const src = noiseRaster(W, H, 11);
    const full = renderFull(src, regions);
    const area = { x: 35, y: 25, w: 12, h: 9 };
    const { rect, raster } = renderArea(src, regions, area);
    expect(rect.x).toBeLessThanOrEqual(area.x);
    expect(raster.data).toEqual(cropRaster(full, rect).data);
  });

  it('applies overlapping regions in order', () => {
    const src = noiseRaster(W, H, 12);
    const a = cloneRaster(src);
    applyRegions(a, [{ ...region(SHAPES.rect, 'fill', { fillColor: '#ffffff' }), id: 'x' }, { ...region(SHAPES.rect, 'fill', { fillColor: '#000000' }), id: 'y' }]);
    expect(pixel(a, 30, 25)).toEqual([0, 0, 0, 255]);
  });

  it('keeps the original dimensions', () => {
    const src = noiseRaster(W, H, 13);
    const out = renderFull(src, regions);
    expect([out.width, out.height]).toEqual([W, H]);
    expect(out.data.length).toBe(W * H * 4);
    expect(src.data).not.toEqual(out.data); // and the source is untouched copy-wise
  });

  it('detects only the area that changed between edits', () => {
    const next = [regions[0], { ...regions[1], blurSigma: 9 }, regions[2]]; // unchanged visually but different object
    const moved = [regions[0], regions[1], { ...regions[2], fillColor: '#fff' }];
    expect(changedArea(regions, regions, W, H).w).toBe(0);
    expect(changedArea(regions, next, W, H).w).toBeGreaterThan(0);
    expect(changedArea(regions, moved, W, H)).toEqual(regionReadRect(regions[2], W, H));
  });

  it('scales a region for the preview', () => {
    const s = scaleRegion({ ...region(SHAPES.rect, 'pixelate', { pixelBlock: 10 }), id: 'z' }, 0.5);
    expect(s.shape).toMatchObject({ x: 10.15, w: 20 });
    expect(s.pixelBlock).toBe(5);
  });

  it('masks are hard-edged: values are only 0 or 1', () => {
    const m = rasterizeShape(SHAPES.ellipse, { x: 0, y: 0, w: W, h: H });
    expect(new Set(m.inside)).toEqual(new Set([0, 1]));
  });
});

describe('zoomed-in detail rendering', () => {
  it('renderVisible is pixel-identical to a full render for any area', () => {
    const src = noiseRaster(W, H, 21);
    const regions: Region[] = [
      { ...region(SHAPES.rect, 'blur', { blurSigma: 5 }), id: 'a' },
      { ...region(SHAPES.ellipse, 'pixelate', { pixelBlock: 7 }), id: 'b' },
      { ...region(SHAPES.brush, 'blur', { edge: 'feather', featherWidth: 3 }), id: 'c' },
      { ...region({ kind: 'rect', x: 50, y: 30, w: 30, h: 30 }, 'fill'), id: 'd' },
    ];
    const full = renderFull(src, regions);
    for (const area of [{ x: 0, y: 0, w: W, h: H }, { x: 33, y: 21, w: 17, h: 13 }, { x: 80, y: 0, w: 16, h: 40 }, { x: 5, y: 50, w: 9, h: 22 }]) {
      const { rect, raster } = renderVisible(src, regions, area);
      expect(rect).toEqual(area);
      expect(raster.data).toEqual(cropRaster(full, area).data);
    }
  });
});
