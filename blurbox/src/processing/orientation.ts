import { createRaster, type Raster } from './raster';

/** EXIF orientation values 1–8. 1 means "already upright". */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function isOrientation(n: number): n is Orientation {
  return Number.isInteger(n) && n >= 1 && n <= 8;
}

/** Orientations 5–8 swap width and height. */
export function swapsDimensions(o: Orientation): boolean {
  return o >= 5;
}

export function orientedSize(o: Orientation, width: number, height: number): { width: number; height: number } {
  return swapsDimensions(o) ? { width: height, height: width } : { width, height };
}

/**
 * Canvas transform (a, b, c, d, e, f) that draws a raw `width`×`height` image upright
 * onto a canvas of `orientedSize(o, width, height)`. Maps (x, y) to (a·x + c·y + e, b·x + d·y + f).
 */
export function orientationMatrix(
  o: Orientation,
  width: number,
  height: number,
): [number, number, number, number, number, number] {
  switch (o) {
    case 1: return [1, 0, 0, 1, 0, 0];
    case 2: return [-1, 0, 0, 1, width, 0]; // mirror horizontally
    case 3: return [-1, 0, 0, -1, width, height]; // rotate 180°
    case 4: return [1, 0, 0, -1, 0, height]; // mirror vertically
    case 5: return [0, 1, 1, 0, 0, 0]; // transpose
    case 6: return [0, 1, -1, 0, height, 0]; // rotate 90° clockwise
    case 7: return [0, -1, -1, 0, height, width]; // transverse
    case 8: return [0, -1, 1, 0, 0, width]; // rotate 90° counter-clockwise
  }
}

/** Pure-JS equivalent of drawing with `orientationMatrix`; used by tests and as a reference. */
export function orientRaster(src: Raster, o: Orientation): Raster {
  const { width, height } = orientedSize(o, src.width, src.height);
  const [a, b, c, d, e, f] = orientationMatrix(o, src.width, src.height);
  const out = createRaster(width, height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const dx = Math.floor(a * cx + c * cy + e);
      const dy = Math.floor(b * cx + d * cy + f);
      const si = (y * src.width + x) * 4;
      const di = (dy * width + dx) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}
