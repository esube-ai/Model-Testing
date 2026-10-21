import { describe, expect, it } from 'vitest';
import { insertJpegExif } from '../../src/processing/exifWriter';
import { findMetadata, readImageInfo } from '../../src/processing/imageInfo';
import { stripMetadata } from '../../src/processing/stripMetadata';
import { fakeJpeg } from '../helpers/fakeImages';

function chunk(type: string, data: number[], le = false): number[] {
  const len = data.length;
  const lenBytes = le ? [len & 255, (len >> 8) & 255, 0, 0] : [0, 0, (len >> 8) & 255, len & 255];
  const t = [...type].map((c) => c.charCodeAt(0));
  return le ? [...t, ...lenBytes, ...data, ...(len & 1 ? [0] : [])] : [...lenBytes, ...t, ...data, 0, 0, 0, 0];
}

describe('stripMetadata', () => {
  it('removes EXIF (with GPS), XMP and comments from JPEG, keeping the image data', () => {
    let jpeg = insertJpegExif(fakeJpeg(64, 48), { make: 'Cam', model: 'Pro', gps: { latitude: 48.85, longitude: 2.35 } });
    // Add an XMP APP1 and a comment segment after the EXIF.
    const xmp = [...'http://ns.adobe.com/xap/1.0/\0<x/>'].map((c) => c.charCodeAt(0));
    const com = [...'secret note'].map((c) => c.charCodeAt(0));
    const extra = [0xff, 0xe1, 0, xmp.length + 2, ...xmp, 0xff, 0xfe, 0, com.length + 2, ...com];
    jpeg = new Uint8Array([...jpeg.subarray(0, 2), ...extra, ...jpeg.subarray(2)]);
    expect(findMetadata(jpeg)).toEqual(expect.arrayContaining(['jpeg:exif', 'jpeg:xmp', 'jpeg:comment']));
    const clean = stripMetadata(jpeg);
    expect(findMetadata(clean)).toEqual([]);
    expect(readImageInfo(clean)).toMatchObject({ width: 64, height: 48 });
    // The entropy-coded tail is untouched.
    expect([...clean.slice(-8)]).toEqual([...jpeg.slice(-8)]);
  });

  it('removes text, eXIf and tIME chunks from PNG', () => {
    const ihdr = chunk('IHDR', [0, 0, 0, 10, 0, 0, 0, 5, 8, 6, 0, 0, 0]);
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...ihdr, ...chunk('tEXt', [65, 0, 66]), ...chunk('eXIf', [0x4d, 0x4d, 0, 42]), ...chunk('tIME', [7, 0xe8, 1, 1, 0, 0, 0]),
      ...chunk('IDAT', [1, 2, 3]), ...chunk('IEND', []),
    ]);
    expect(findMetadata(png).length).toBeGreaterThanOrEqual(3);
    const clean = stripMetadata(png);
    expect(findMetadata(clean)).toEqual([]);
    expect(readImageInfo(clean)).toMatchObject({ width: 10, height: 5 });
  });

  it('removes EXIF and XMP chunks from WebP and fixes the header', () => {
    const vp8x = chunk('VP8X', [0x0c, 0, 0, 0, 9, 0, 0, 4, 0, 0], true);
    const body = [...[...'WEBP'].map((c) => c.charCodeAt(0)), ...vp8x, ...chunk('VP8L', [0x2f, 0, 0, 0, 0], true), ...chunk('EXIF', [1, 2, 3], true), ...chunk('XMP ', [4, 5], true)];
    const size = body.length;
    const webp = new Uint8Array([...[...'RIFF'].map((c) => c.charCodeAt(0)), size & 255, size >> 8, 0, 0, ...body]);
    expect(findMetadata(webp)).toEqual(['webp:EXIF', 'webp:XMP']);
    const clean = stripMetadata(webp);
    expect(findMetadata(clean)).toEqual([]);
    expect(clean[20] & 0x0c).toBe(0); // VP8X flags cleared
    const riffSize = clean[4] | (clean[5] << 8) | (clean[6] << 16) | (clean[7] << 24);
    expect(riffSize).toBe(clean.length - 8);
    expect(readImageInfo(clean)).toMatchObject({ width: 10, height: 5 });
  });
});
