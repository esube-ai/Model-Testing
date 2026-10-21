import { hasTransparency, type Raster } from './raster';

/** Widths of `n` box blurs whose succession approximates a Gaussian of `sigma` (W. Jarosz / I. Kutskir). */
export function boxSizesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu));
}

/** How far (in pixels) the blur reads from: the sum of the box radii. */
export function blurReach(sigma: number): number {
  return boxSizesForGauss(sigma).reduce((sum, w) => sum + (w - 1) / 2, 0);
}

/** Horizontal box blur of radius r, in place. Edges repeat the border pixel (no dark halo). */
function boxBlurH(d: Uint8ClampedArray, w: number, h: number, r: number): void {
  if (r <= 0 || w <= 1) return;
  const inv = 1 / (2 * r + 1);
  const row = new Uint8ClampedArray(w * 4);
  const last = (w - 1) * 4;
  for (let y = 0; y < h; y++) {
    const off = y * w * 4;
    row.set(d.subarray(off, off + w * 4));
    let s0 = (r + 1) * row[0];
    let s1 = (r + 1) * row[1];
    let s2 = (r + 1) * row[2];
    let s3 = (r + 1) * row[3];
    for (let i = 1; i <= r; i++) {
      const p = Math.min(i * 4, last);
      s0 += row[p];
      s1 += row[p + 1];
      s2 += row[p + 2];
      s3 += row[p + 3];
    }
    for (let x = 0; x < w; x++) {
      const o = off + x * 4;
      d[o] = s0 * inv;
      d[o + 1] = s1 * inv;
      d[o + 2] = s2 * inv;
      d[o + 3] = s3 * inv;
      const a = Math.min((x + r + 1) * 4, last);
      const b = Math.max((x - r) * 4, 0);
      s0 += row[a] - row[b];
      s1 += row[a + 1] - row[b + 1];
      s2 += row[a + 2] - row[b + 2];
      s3 += row[a + 3] - row[b + 3];
    }
  }
}

/**
 * Vertical box blur of radius r, in place, row by row (cache friendly). Keeps a ring of the last
 * r+1 original rows because the sliding window subtracts rows that were already overwritten.
 */
function boxBlurV(d: Uint8ClampedArray, w: number, h: number, r: number): void {
  if (r <= 0 || h <= 1) return;
  const stride = w * 4;
  const inv = 1 / (2 * r + 1);
  const sums = new Float64Array(stride);
  const top = d.slice(0, stride);
  const ringRows = r + 1;
  const ring = new Uint8ClampedArray(ringRows * stride);
  for (let c = 0; c < stride; c++) {
    let s = (r + 1) * d[c];
    for (let i = 1; i <= r; i++) s += d[Math.min(i, h - 1) * stride + c];
    sums[c] = s;
  }
  for (let y = 0; y < h; y++) {
    const off = y * stride;
    ring.set(d.subarray(off, off + stride), (y % ringRows) * stride);
    for (let c = 0; c < stride; c++) d[off + c] = sums[c] * inv;
    if (y === h - 1) break;
    const addOff = Math.min(y + r + 1, h - 1) * stride;
    const subRow = y - r;
    const sub = subRow <= 0 ? top : ring.subarray((subRow % ringRows) * stride, (subRow % ringRows) * stride + stride);
    for (let c = 0; c < stride; c++) sums[c] += d[addOff + c] - sub[c];
  }
}

/**
 * Gaussian blur (three box passes per axis) in place. Transparent pixels are handled with
 * premultiplied alpha so colour doesn't bleed from invisible pixels and edges don't darken.
 */
export function gaussianBlur(img: Raster, sigma: number): void {
  if (sigma <= 0) return;
  const { data: d, width: w, height: h } = img;
  const alpha = hasTransparency(img);
  if (alpha) {
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      d[i] *= a;
      d[i + 1] *= a;
      d[i + 2] *= a;
    }
  }
  for (const size of boxSizesForGauss(sigma)) {
    const r = (size - 1) / 2;
    boxBlurH(d, w, h, r);
    boxBlurV(d, w, h, r);
  }
  if (alpha) {
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a === 0) {
        d[i] = d[i + 1] = d[i + 2] = 0;
      } else {
        const k = 255 / a;
        d[i] *= k;
        d[i + 1] *= k;
        d[i + 2] *= k;
      }
    }
  }
}
