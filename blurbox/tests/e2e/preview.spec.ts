import { expect, test } from '@playwright/test';
import { dragImage, makeImage, openViaPicker, previewSettled, sampleImagePixel, selectTool } from './helpers';

test('hold the compare button or the \\ key to see the original', async ({ page }) => {
  await page.goto('/');
  const png = await makeImage(page, { width: 400, height: 300 });
  await openViaPicker(page, png, 'quads.png', 'image/png');
  await selectTool(page, 'Rectangle');
  await dragImage(page, [20, 20], [180, 130]);
  await page.getByRole('radio', { name: 'Solid fill' }).check();
  await previewSettled(page);
  expect(await sampleImagePixel(page, 100, 75)).toEqual([0, 0, 0]);

  const btn = page.getByRole('button', { name: 'Hold to compare' });
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('preview-canvas')).toHaveAttribute('data-showing', 'original');
  expect(await sampleImagePixel(page, 100, 75)).toEqual([255, 0, 0]);
  await expect(page.getByTestId('region-overlay')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByTestId('preview-canvas')).toHaveAttribute('data-showing', 'result');
  expect(await sampleImagePixel(page, 100, 75)).toEqual([0, 0, 0]);

  await page.getByTestId('canvas-area').focus();
  await page.keyboard.down('\\');
  await expect(page.getByTestId('preview-canvas')).toHaveAttribute('data-showing', 'original');
  await page.keyboard.up('\\');
  await expect(page.getByTestId('preview-canvas')).toHaveAttribute('data-showing', 'result');
});

test('large images render full-resolution detail when zoomed in', async ({ page }) => {
  await page.goto('/');
  const jpeg = await makeImage(page, { width: 6000, height: 4000, type: 'image/jpeg', quality: 0.8 });
  await openViaPicker(page, jpeg, 'large.jpg', 'image/jpeg');
  const canvas = page.getByTestId('preview-canvas');
  // Fitted: the 8 MP preview is plenty, no detail tile.
  await expect(canvas).toHaveAttribute('data-detail', '');
  await page.getByRole('button', { name: '100%' }).click();
  await expect(canvas).not.toHaveAttribute('data-detail', '');
  const [x, y, w, h] = (await canvas.getAttribute('data-detail'))!.split(',').map(Number);
  const vp = (await page.getByTestId('canvas-area').boundingBox())!;
  expect(w).toBeGreaterThanOrEqual(Math.floor(vp.width) - 1);
  expect(h).toBeGreaterThanOrEqual(Math.floor(vp.height) - 1);
  expect(x).toBeGreaterThan(0);
  expect(y).toBeGreaterThan(0);

  // Editing invalidates the tile, then a fresh one arrives with the new region applied.
  await selectTool(page, 'Rectangle');
  await dragImage(page, [x + 10, y + 10], [x + 60, y + 60]);
  await page.getByRole('radio', { name: 'Solid fill' }).check();
  await previewSettled(page);
  await expect(canvas).not.toHaveAttribute('data-detail', '');
  await expect.poll(() => sampleImagePixel(page, x + 35, y + 35)).toEqual([0, 0, 0]);
});
