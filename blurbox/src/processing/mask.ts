import { brushDistance, distSqToSegment } from '../model/geometry';
import type { Shape } from '../model/types';
import type { IntRect } from './raster';

/**
 * Hard-edged coverage of a shape over `rect` (absolute image pixels). A pixel is inside when its
 * centre is inside the shape, so every pixel is either fully hidden or untouched.
 * `dist` (optional) is the distance in pixels from the pixel centre inward to the shape's edge.
 */
export interface Mask {
  rect: IntRect;
  inside: Uint8Array;
  dist: Float32Array | null;
}

export function rasterizeShape(shape: Shape, rect: IntRect, withDistance = false): Mask {
  const { x: rx, y: ry, w, h } = rect;
  const inside = new Uint8Array(w * h);
  const dist = withDistance ? new Float32Array(w * h) : null;
  if (w <= 0 || h <= 0) return { rect, inside, dist };

  if (shape.kind === 'rect') {
    const x0 = shape.x;
    const y0 = shape.y;
    const x1 = shape.x + shape.w;
    const y1 = shape.y + shape.h;
    for (let j = 0; j < h; j++) {
      const cy = ry + j + 0.5;
      if (cy < y0 || cy >= y1) continue;
      for (let i = 0; i < w; i++) {
        const cx = rx + i + 0.5;
        if (cx < x0 || cx >= x1) continue;
        const k = j * w + i;
        inside[k] = 1;
        if (dist) dist[k] = Math.min(cx - x0, x1 - cx, cy - y0, y1 - cy);
      }
    }
  } else if (shape.kind === 'ellipse') {
    const a = shape.w / 2;
    const b = shape.h / 2;
    if (a > 0 && b > 0) {
      const ecx = shape.x + a;
      const ecy = shape.y + b;
      const minR = Math.min(a, b);
      for (let j = 0; j < h; j++) {
        const ny = (ry + j + 0.5 - ecy) / b;
        const ny2 = ny * ny;
        if (ny2 > 1) continue;
        for (let i = 0; i < w; i++) {
          const nx = (rx + i + 0.5 - ecx) / a;
          const q = nx * nx + ny2;
          if (q > 1) continue;
          const k = j * w + i;
          inside[k] = 1;
          if (dist) dist[k] = (1 - Math.sqrt(q)) * minR;
        }
      }
    }
  } else {
    // Brush: union of round-capped segments. Track the nearest distance to the stroke centre-line.
    const r = shape.size / 2;
    const p = shape.points;
    const best = new Float32Array(w * h).fill(Infinity);
    const stamp = (ax: number, ay: number, bx: number, by: number) => {
      const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - r) - rx);
      const i1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + r) - rx);
      const j0 = Math.max(0, Math.floor(Math.min(ay, by) - r) - ry);
      const j1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + r) - ry);
      for (let j = j0; j <= j1; j++) {
        const cy = ry + j + 0.5;
        for (let i = i0; i <= i1; i++) {
          const d = distSqToSegment(rx + i + 0.5, cy, ax, ay, bx, by);
          const k = j * w + i;
          if (d < best[k]) best[k] = d;
        }
      }
    };
    if (p.length === 2) stamp(p[0], p[1], p[0], p[1]);
    for (let s = 0; s + 3 < p.length; s += 2) stamp(p[s], p[s + 1], p[s + 2], p[s + 3]);
    const r2 = r * r;
    for (let k = 0; k < best.length; k++) {
      if (best[k] <= r2) {
        inside[k] = 1;
        if (dist) dist[k] = r - Math.sqrt(best[k]);
      }
    }
  }
  return { rect, inside, dist };
}

/** Convenience used by tests: is the pixel at (x, y) covered by the shape? */
export function pixelInside(shape: Shape, x: number, y: number): boolean {
  const cx = x + 0.5;
  const cy = y + 0.5;
  if (shape.kind === 'rect') return cx >= shape.x && cx < shape.x + shape.w && cy >= shape.y && cy < shape.y + shape.h;
  if (shape.kind === 'ellipse') {
    const a = shape.w / 2;
    const b = shape.h / 2;
    if (a <= 0 || b <= 0) return false;
    const nx = (cx - shape.x - a) / a;
    const ny = (cy - shape.y - b) / b;
    return nx * nx + ny * ny <= 1;
  }
  return brushDistance(shape, cx, cy) <= shape.size / 2;
}
