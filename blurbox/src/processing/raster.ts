/** An RGBA pixel buffer. `ImageData` satisfies this, but plain objects work too (tests, workers). */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface IntRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function isEmptyRect(r: IntRect): boolean {
  return r.w <= 0 || r.h <= 0;
}

export function intersectRect(a: IntRect, b: IntRect): IntRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : { x, y, w: 0, h: 0 };
}

export function unionRect(a: IntRect, b: IntRect): IntRect {
  if (isEmptyRect(a)) return b;
  if (isEmptyRect(b)) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function containsRect(outer: IntRect, inner: IntRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function expandRect(r: IntRect, by: number): IntRect {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}

/** Smallest integer rect covering a fractional box. */
export function toIntRect(x: number, y: number, w: number, h: number): IntRect {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  return { x: x0, y: y0, w: Math.ceil(x + w) - x0, h: Math.ceil(y + h) - y0 };
}

export function cropRaster(src: Raster, rect: IntRect): Raster {
  const out = createRaster(rect.w, rect.h);
  const rowBytes = rect.w * 4;
  for (let y = 0; y < rect.h; y++) {
    const from = ((rect.y + y) * src.width + rect.x) * 4;
    out.data.set(src.data.subarray(from, from + rowBytes), y * rowBytes);
  }
  return out;
}

/** Copies `src` into `dst` with its top-left corner at (x, y). `src` must fit inside `dst`. */
export function blitRaster(dst: Raster, src: Raster, x: number, y: number): void {
  const rowBytes = src.width * 4;
  for (let row = 0; row < src.height; row++) {
    const to = ((y + row) * dst.width + x) * 4;
    dst.data.set(src.data.subarray(row * rowBytes, row * rowBytes + rowBytes), to);
  }
}

export function hasTransparency(r: Raster): boolean {
  const d = r.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return true;
  return false;
}
