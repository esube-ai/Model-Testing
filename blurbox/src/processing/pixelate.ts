import type { Raster } from './raster';

/**
 * Replaces every `block`×`block` cell with its average colour, in place. The grid starts at
 * (originX, originY) in raster coordinates (may be negative); cells are clipped to the raster.
 * Colour is alpha-weighted so transparent pixels don't darken the average.
 */
export function pixelate(img: Raster, block: number, originX: number, originY: number): void {
  const b = Math.max(1, Math.round(block));
  if (b <= 1) return;
  const { data: d, width: w, height: h } = img;
  const startX = originX - Math.ceil(originX / b) * b; // first cell edge at or left of 0
  const startY = originY - Math.ceil(originY / b) * b;
  for (let cy = startY; cy < h; cy += b) {
    const y0 = Math.max(0, cy);
    const y1 = Math.min(h, cy + b);
    if (y1 <= y0) continue;
    for (let cx = startX; cx < w; cx += b) {
      const x0 = Math.max(0, cx);
      const x1 = Math.min(w, cx + b);
      if (x1 <= x0) continue;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0, i = (y * w + x0) * 4; x < x1; x++, i += 4) {
          const a = d[i + 3];
          sr += d[i] * a;
          sg += d[i + 1] * a;
          sb += d[i + 2] * a;
          sa += a;
        }
      }
      const n = (x1 - x0) * (y1 - y0);
      const r = sa ? sr / sa : 0;
      const g = sa ? sg / sa : 0;
      const bl = sa ? sb / sa : 0;
      const a = sa / n;
      for (let y = y0; y < y1; y++) {
        for (let x = x0, i = (y * w + x0) * 4; x < x1; x++, i += 4) {
          d[i] = r;
          d[i + 1] = g;
          d[i + 2] = bl;
          d[i + 3] = a;
        }
      }
    }
  }
}
