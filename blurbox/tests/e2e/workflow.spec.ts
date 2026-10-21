import { expect, test } from '@playwright/test';
import { readImageInfo } from '../../src/processing/imageInfo';
import {
  decodeInBrowser, dragImage, exportImage, makeImage, openViaPicker, overlayRegions, previewSettled, selectTool,
} from './helpers';

// The end-to-end acceptance flow. Runs in both projects: 400 px phone (touch) and 1440 px desktop.
test('load, draw each shape, apply each method, undo/redo, export at original size', async ({ page }) => {
  await page.goto('/');
  const jpeg = await makeImage(page, { width: 1200, height: 900, type: 'image/jpeg', pattern: 'noise' });
  await openViaPicker(page, jpeg, 'receipt.jpg', 'image/jpeg');
  await expect(page.getByTestId('image-info')).toHaveText('receipt · 1200 × 900');

  await selectTool(page, 'Rectangle');
  await dragImage(page, [100, 100], [400, 300]);
  await page.getByRole('radio', { name: 'Blur', exact: true }).check();

  await selectTool(page, 'Ellipse');
  await dragImage(page, [600, 100], [900, 350]);
  await page.getByRole('radio', { name: 'Pixelate' }).check();

  await selectTool(page, 'Brush');
  await dragImage(page, [150, 600], [[400, 650], [700, 600], [1000, 700]]);
  await page.getByRole('radio', { name: 'Solid fill' }).check();
  await previewSettled(page);

  const shapes = async () => (await overlayRegions(page)).map((r) => r.shape);
  expect(await shapes()).toEqual(['rect', 'ellipse', 'brush']);
  await expect(page.getByTestId('region-item')).toHaveText([/Rectangle 1 · Blur/, /Ellipse 2 · Pixelate/, /Brush stroke 3 · Fill/]);

  // Undo the fill and the brush stroke, then redo both.
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await shapes()).toEqual(['rect', 'ellipse']);
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(await shapes()).toEqual(['rect', 'ellipse', 'brush']);
  await expect(page.getByTestId('region-item').nth(2)).toHaveText(/Fill/);
  await previewSettled(page);

  const out = await exportImage(page, { format: 'JPEG', quality: 90 });
  expect(out.filename).toBe('receipt-blurred.jpg');
  expect(readImageInfo(out.bytes)).toMatchObject({ width: 1200, height: 900 });
  const decoded = await decodeInBrowser(page, out.bytes, { x: 400, y: 650, w: 1, h: 1 });
  expect([decoded.width, decoded.height]).toEqual([1200, 900]);
  // A pixel on the brush stroke is (JPEG-close to) black.
  expect(Math.max(...decoded.pixels.slice(0, 3))).toBeLessThan(24);
});
