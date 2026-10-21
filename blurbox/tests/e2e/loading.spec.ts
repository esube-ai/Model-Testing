import { expect, test } from '@playwright/test';
import { insertJpegExif } from '../../src/processing/exifWriter';
import { makeImage, openViaDrop, openViaPaste, openViaPicker, sampleCanvasAt } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('opens a PNG with the file picker', async ({ page }) => {
  const png = await makeImage(page, { width: 320, height: 200 });
  await openViaPicker(page, png, 'holiday.png', 'image/png');
  await expect(page.getByTestId('image-info')).toHaveText('holiday · 320 × 200');
});

test('opens a JPEG dropped on the window', async ({ page }) => {
  const jpeg = await makeImage(page, { width: 240, height: 180, type: 'image/jpeg' });
  await openViaDrop(page, jpeg, 'dropped.jpg', 'image/jpeg');
  await expect(page.getByTestId('image-info')).toHaveText('dropped · 240 × 180');
});

test('opens a WebP pasted from the clipboard', async ({ page }) => {
  const webp = await makeImage(page, { width: 128, height: 96, type: 'image/webp' });
  await openViaPaste(page, webp, 'image/webp');
  await expect(page.getByTestId('image-info')).toHaveText('image · 128 × 96');
});

test('rejects unsupported files with a clear message', async ({ page }) => {
  await openViaDrop(page, new TextEncoder().encode('GIF89a not really'), 'anim.gif', 'image/gif');
  await expect(page.getByRole('alert')).toContainText('Unsupported file');
});

test('loads phone photos upright using EXIF orientation 6', async ({ page }) => {
  // Stored landscape: red left half, blue right half. Orientation 6 = rotate 90° clockwise,
  // so upright it is portrait with red on top and blue at the bottom.
  const stored = await makeImage(page, { width: 300, height: 200, type: 'image/jpeg', pattern: 'halves' });
  const tagged = insertJpegExif(stored, { orientation: 6, make: 'PhoneCo', model: 'P1' });
  await openViaPicker(page, tagged, 'phone.jpg', 'image/jpeg');
  await expect(page.getByTestId('image-info')).toHaveText('phone · 200 × 300');
  const top = await sampleCanvasAt(page, 0.5, 0.2);
  const bottom = await sampleCanvasAt(page, 0.5, 0.8);
  expect(top[0]).toBeGreaterThan(200);
  expect(top[2]).toBeLessThan(60);
  expect(bottom[2]).toBeGreaterThan(200);
  expect(bottom[0]).toBeLessThan(60);
});

test('downscales images above the device pixel budget and says so', async ({ page }) => {
  await page.goto('/?maxMegapixels=0.01'); // 10,000 px budget
  const png = await makeImage(page, { width: 400, height: 100 });
  await openViaPicker(page, png, 'wide.png', 'image/png');
  await expect(page.getByTestId('image-info')).toHaveText('wide · 200 × 50');
  await expect(page.getByText(/larger than this device can process/)).toBeVisible();
});
