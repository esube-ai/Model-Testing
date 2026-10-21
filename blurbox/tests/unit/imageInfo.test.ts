import { describe, expect, it } from 'vitest';
import { findMetadata, readImageInfo, readTiffOrientation, sniffFormat } from '../../src/processing/imageInfo';
import { buildExifTiff, insertJpegExif } from '../../src/processing/exifWriter';
import { fakeJpeg } from '../helpers/fakeImages';

describe('readImageInfo', () => {
  it('reads JPEG size and defaults orientation to 1', () => {
    expect(readImageInfo(fakeJpeg(640, 480))).toEqual({ format: 'jpeg', width: 640, height: 480, orientation: 1 });
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('reads EXIF orientation %i from APP1', (o) => {
    const jpeg = insertJpegExif(fakeJpeg(40, 30), { orientation: o, make: 'Phone', model: 'X' });
    expect(readImageInfo(jpeg)).toEqual({ format: 'jpeg', width: 40, height: 30, orientation: o });
  });

  it('reads little-endian TIFF orientation', () => {
    const le = new Uint8Array([0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
    expect(readTiffOrientation(le)).toBe(6);
  });

  it('ignores invalid orientation values', () => {
    expect(readTiffOrientation(buildExifTiff({ orientation: 9 }))).toBeNull();
  });

  it('reads PNG IHDR size', () => {
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    png.set([0, 0, 0x1f, 0x40, 0, 0, 0x0f, 0xa0], 16); // 8000 x 4000
    expect(readImageInfo(png)).toEqual({ format: 'png', width: 8000, height: 4000, orientation: 1 });
  });

  it('reads WebP VP8X canvas size', () => {
    const w = new Uint8Array(30);
    w.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    w.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
    w.set([0x1f, 0x03, 0x00], 24); // 800 - 1
    w.set([0x57, 0x02, 0x00], 27); // 600 - 1
    expect(readImageInfo(w)).toEqual({ format: 'webp', width: 800, height: 600, orientation: 1 });
  });

  it('rejects unsupported files', () => {
    expect(sniffFormat(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(readImageInfo(new TextEncoder().encode('not an image'))).toBeNull();
  });
});

describe('findMetadata', () => {
  it('finds EXIF (with GPS) in a JPEG and nothing in a clean one', () => {
    const clean = fakeJpeg(10, 10);
    expect(findMetadata(clean)).toEqual([]);
    const tagged = insertJpegExif(clean, { make: 'Cam', gps: { latitude: 51.5, longitude: -0.12 } });
    expect(findMetadata(tagged)).toContain('jpeg:exif');
    // The GPS IFD pointer tag (0x8825) is present in the tagged file.
    const hasGpsPointer = tagged.some((v, i) => v === 0x88 && tagged[i + 1] === 0x25);
    expect(hasGpsPointer).toBe(true);
  });
});
