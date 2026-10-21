import { expect, test } from '@playwright/test';
import { insertJpegExif } from '../../src/processing/exifWriter';
import { findMetadata, readImageInfo } from '../../src/processing/imageInfo';
import {
  countOccurrences, decodeInBrowser, dragImage, exportImage, makeImage, openViaPicker, previewSettled, selectTool,
} from './helpers';

const FORMATS = [
  { label: 'PNG (lossless)', ext: 'png', format: 'png' },
  { label: 'JPEG', ext: 'jpg', format: 'jpeg' },
  { label: 'WebP', ext: 'webp', format: 'webp' },
] as const;

test.describe('export', () => {
  test('exports PNG, JPEG and WebP at full resolution with the default "-blurred" name', async ({ page }) => {
    await page.goto('/');
    const png = await makeImage(page, { width: 640, height: 480 });
    await openViaPicker(page, png, 'family photo.png', 'image/png');
    await selectTool(page, 'Rectangle');
    await dragImage(page, [100, 100], [300, 250]);
    for (const f of FORMATS) {
      const out = await exportImage(page, { format: f.label, quality: f.format === 'png' ? undefined : 80 });
      expect(out.filename).toBe(`family photo-blurred.${f.ext}`);
      expect(readImageInfo(out.bytes)).toMatchObject({ format: f.format, width: 640, height: 480 });
      expect(findMetadata(out.bytes)).toEqual([]);
      const decoded = await decodeInBrowser(page, out.bytes);
      expect([decoded.width, decoded.height]).toEqual([640, 480]);
    }
  });

  test('a custom file name is used and sanitised', async ({ page }) => {
    await page.goto('/');
    const png = await makeImage(page, { width: 64, height: 64 });
    await openViaPicker(page, png, 'x.png', 'image/png');
    const out = await exportImage(page, { filename: 'safe/name:v2' });
    expect(out.filename).toBe('safe-name-v2.png');
  });
});

test('metadata: an exported photo with EXIF GPS contains no EXIF block', async ({ page }) => {
  await page.goto('/');
  const base = await makeImage(page, { width: 800, height: 600, type: 'image/jpeg', pattern: 'quadrants' });
  const photo = insertJpegExif(base, {
    make: 'PhoneMaker',
    model: 'Model 9',
    gps: { latitude: 37.7749, longitude: -122.4194 },
  });
  expect(findMetadata(photo)).toContain('jpeg:exif');
  await openViaPicker(page, photo, 'IMG_0001.jpg', 'image/jpeg');
  await selectTool(page, 'Ellipse');
  await dragImage(page, [300, 200], [500, 400]);
  for (const f of FORMATS) {
    const out = await exportImage(page, { format: f.label });
    expect(findMetadata(out.bytes)).toEqual([]);
    const text = Buffer.from(out.bytes).toString('latin1');
    expect(text).not.toContain('Exif\u0000\u0000');
    expect(text).not.toContain('PhoneMaker');
    expect(text).not.toContain('Model 9');
    expect(text.includes('GPS')).toBe(false);
  }
});

test('pixel destruction: fill is exact, blur/pixelate differ from the original, and the original is not embedded', async ({ page }) => {
  await page.goto('/');
  const src = await makeImage(page, { width: 400, height: 300, pattern: 'noise' });
  await openViaPicker(page, src, 'noise.png', 'image/png');
  const region = { x: 50, y: 40, w: 120, h: 90 };
  await selectTool(page, 'Rectangle');
  await dragImage(page, [region.x, region.y], [region.x + region.w, region.y + region.h]);
  const original = await decodeInBrowser(page, src, region);

  // Solid fill: every pixel equals the fill colour.
  await page.getByRole('radio', { name: 'Solid fill' }).check();
  await page.getByLabel('Fill colour').fill('#10ff80');
  await previewSettled(page);
  const filled = await exportImage(page);
  const fillPx = await decodeInBrowser(page, filled.bytes, region);
  for (let i = 0; i < fillPx.pixels.length; i += 4) {
    expect(fillPx.pixels.slice(i, i + 4)).toEqual([0x10, 0xff, 0x80, 255]);
  }

  for (const method of ['Blur', 'Pixelate'] as const) {
    await page.getByRole('radio', { name: method, exact: true }).check();
    await previewSettled(page);
    const out = await exportImage(page);
    const px = await decodeInBrowser(page, out.bytes, region);
    let same = 0;
    for (let i = 0; i < px.pixels.length; i += 4) {
      if (px.pixels[i] === original.pixels[i] && px.pixels[i + 1] === original.pixels[i + 1] && px.pixels[i + 2] === original.pixels[i + 2]) same++;
    }
    // Every pixel inside the region was changed (noise image: no coincidental matches expected).
    expect(same).toBe(0);
    // Exactly one image in the file: one IHDR/IEND, no embedded copy or thumbnail.
    expect(countOccurrences(out.bytes, [...'IHDR'].map((c) => c.charCodeAt(0)))).toBe(1);
    expect(countOccurrences(out.bytes, [...'IEND'].map((c) => c.charCodeAt(0)))).toBe(1);
    // A run of the source file's compressed bytes doesn't appear in the export.
    const probe = Array.from(src.slice(Math.floor(src.length / 2), Math.floor(src.length / 2) + 32));
    expect(countOccurrences(out.bytes, probe)).toBe(0);
  }
});
