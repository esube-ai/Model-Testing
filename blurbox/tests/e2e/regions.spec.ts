import { expect, test } from '@playwright/test';
import { dragImage, imageToPage, makeImage, openViaPicker, overlayRegions, selectTool } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const png = await makeImage(page, { width: 800, height: 600 });
  await openViaPicker(page, png, 'scene.png', 'image/png');
});

test('draws a rectangle, an ellipse and a brush stroke', async ({ page }) => {
  await selectTool(page, 'Rectangle');
  await dragImage(page, [50, 50], [250, 200]);
  await selectTool(page, 'Ellipse');
  await dragImage(page, [400, 80], [600, 250]);
  await selectTool(page, 'Brush');
  await dragImage(page, [100, 400], [[200, 450], [300, 420], [400, 480]]);
  const regions = await overlayRegions(page);
  expect(regions.map((r) => r.shape)).toEqual(['rect', 'ellipse', 'brush']);
  expect(regions[2].selected).toBe(true);
  await expect(page.getByTestId('region-item')).toHaveCount(3);
  await expect(page.getByTestId('announcer')).toContainText('Brush stroke 3 added');
});

test('selects, moves, resizes and deletes a region', async ({ page }) => {
  await selectTool(page, 'Rectangle');
  await dragImage(page, [100, 100], [300, 250]);
  await selectTool(page, 'Select');
  // Click empty space to deselect, then click the region to select it.
  await dragImage(page, [600, 500], [600, 500]);
  expect((await overlayRegions(page))[0].selected).toBe(false);
  await dragImage(page, [200, 170], [200, 170]);
  expect((await overlayRegions(page))[0].selected).toBe(true);

  // Move by (+100, +50) image px.
  await dragImage(page, [200, 170], [300, 220]);
  const handle = page.locator('[data-handle="se"]');
  const hb = (await handle.boundingBox())!;
  const expected = await imageToPage(page, 400, 300);
  expect(hb.x + hb.width / 2).toBeCloseTo(expected.x, 0);
  expect(hb.y + hb.height / 2).toBeCloseTo(expected.y, 0);

  // Resize with the south-east handle to (500, 350).
  await dragImage(page, [400, 300], [500, 350]);
  const hb2 = (await handle.boundingBox())!;
  const expected2 = await imageToPage(page, 500, 350);
  expect(hb2.x + hb2.width / 2).toBeCloseTo(expected2.x, 0);
  expect(hb2.y + hb2.height / 2).toBeCloseTo(expected2.y, 0);

  await page.getByRole('button', { name: 'Delete region' }).click();
  expect(await overlayRegions(page)).toEqual([]);
});

test('editing stays accurate when zoomed in', async ({ page }) => {
  await page.getByRole('button', { name: '100%' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click(); // 300%
  await selectTool(page, 'Rectangle');
  await dragImage(page, [390, 290], [410, 310]);
  const nw = (await page.locator('[data-handle="nw"]').boundingBox())!;
  const at = await imageToPage(page, 390, 290);
  expect(nw.x + nw.width / 2).toBeCloseTo(at.x, 0);
  expect(nw.y + nw.height / 2).toBeCloseTo(at.y, 0);
});

test('Delete key removes the selected region; regions past the edge are allowed', async ({ page }) => {
  await selectTool(page, 'Rectangle');
  await dragImage(page, [700, 500], [900, 700]); // extends past the 800×600 image
  expect(await overlayRegions(page)).toHaveLength(1);
  await page.getByTestId('canvas-area').focus();
  await page.keyboard.press('Delete');
  expect(await overlayRegions(page)).toHaveLength(0);
});
