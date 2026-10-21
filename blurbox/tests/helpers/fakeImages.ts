import { createRaster, type Raster } from '../../src/processing/raster';

/** Minimal JPEG-shaped byte stream: SOI, APP0 (JFIF), SOF0 with the given size, SOS, EOI. */
export function fakeJpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34,
    0xff, 0xd9,
  ]);
}

/** Deterministic pseudo-random noise image (mulberry32). Opaque unless `alpha` is set. */
export function noiseRaster(width: number, height: number, seed = 1, alpha?: (x: number, y: number) => number): Raster {
  const r = createRaster(width, height);
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      r.data[i] = Math.floor(rand() * 256);
      r.data[i + 1] = Math.floor(rand() * 256);
      r.data[i + 2] = Math.floor(rand() * 256);
      r.data[i + 3] = alpha ? alpha(x, y) : 255;
    }
  }
  return r;
}

export function pixel(r: Raster, x: number, y: number): [number, number, number, number] {
  const i = (y * r.width + x) * 4;
  return [r.data[i], r.data[i + 1], r.data[i + 2], r.data[i + 3]];
}

export function cloneRaster(r: Raster): Raster {
  return { width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) };
}
