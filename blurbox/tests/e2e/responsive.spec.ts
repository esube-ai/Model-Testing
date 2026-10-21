import { expect, test } from '@playwright/test';
import { dragImage, makeImage, openViaPicker, selectTool } from './helpers';

test('layout fits the viewport with no horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await noOverflow()).toBe(true);
  const png = await makeImage(page, { width: 1200, height: 800 });
  await openViaPicker(page, png, 'wide-name-for-a-photo-taken-on-holiday.png', 'image/png');
  await selectTool(page, 'Brush');
  await dragImage(page, [100, 100], [500, 400]);
  expect(await noOverflow()).toBe(true);

  const vp = page.viewportSize()!;
  const canvas = (await page.getByTestId('canvas-area').boundingBox())!;
  expect(canvas.width).toBeGreaterThan(vp.width * 0.6);
  expect(canvas.height).toBeGreaterThan(Math.min(250, vp.height * 0.3));
  // All primary controls are on screen.
  for (const name of ['Open', 'Undo', 'Redo', 'Keyboard shortcuts', 'Export…', 'Zoom in', 'Hold to compare']) {
    const box = (await page.getByRole('button', { name, exact: name !== 'Open' }).first().boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
  }
  await page.getByRole('button', { name: 'Export…' }).click();
  const dlg = (await page.getByRole('dialog', { name: 'Export image' }).boundingBox())!;
  expect(dlg.x).toBeGreaterThanOrEqual(0);
  expect(dlg.x + dlg.width).toBeLessThanOrEqual(vp.width);
});
