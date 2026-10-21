import { expect, test } from '@playwright/test';
import { dragImage, makeImage, openViaPicker, previewSettled, sampleImagePixel, selectTool } from './helpers';

// Quadrants: red TL, green TR, blue BL, white BR. A region straddling the centre mixes them when blurred.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const png = await makeImage(page, { width: 400, height: 300 });
  await openViaPicker(page, png, 'quads.png', 'image/png');
});

test('each method re-renders the region live, and only the region', async ({ page }) => {
  const centre = await sampleImagePixel(page, 210, 160);
  expect(centre).toEqual([255, 255, 255]);
  await selectTool(page, 'Rectangle');
  await dragImage(page, [150, 100], [250, 200]);
  await previewSettled(page);

  // Default method is blur: the pixel just inside the red quadrant now mixes with its neighbours.
  const blurred = await sampleImagePixel(page, 198, 148);
  expect(blurred[0]).toBeLessThan(250);
  expect(blurred[1]).toBeGreaterThan(20);
  // Outside the region is untouched.
  expect(await sampleImagePixel(page, 100, 50)).toEqual([255, 0, 0]);

  await page.getByRole('radio', { name: 'Solid fill' }).check();
  await previewSettled(page);
  expect(await sampleImagePixel(page, 160, 110)).toEqual([0, 0, 0]);
  expect(await sampleImagePixel(page, 240, 190)).toEqual([0, 0, 0]);

  await page.getByLabel('Fill colour').fill('#3366ff');
  await previewSettled(page);
  expect(await sampleImagePixel(page, 200, 150)).toEqual([0x33, 0x66, 0xff]);

  await page.getByRole('radio', { name: 'Pixelate' }).check();
  await previewSettled(page);
  const px = await sampleImagePixel(page, 199, 149);
  expect(px).not.toEqual([255, 0, 0]);
  expect(await sampleImagePixel(page, 100, 50)).toEqual([255, 0, 0]);
});

test('strength sliders update the preview', async ({ page }) => {
  await selectTool(page, 'Rectangle');
  await dragImage(page, [100, 50], [300, 250]);
  await previewSettled(page);
  const strength = page.getByLabel('Blur strength');
  await strength.fill('2');
  await previewSettled(page);
  const weak = await sampleImagePixel(page, 190, 150);
  await strength.fill('40');
  await previewSettled(page);
  const strong = await sampleImagePixel(page, 190, 150);
  // Stronger blur pulls the pixel 10 px from the boundary further from its original colour.
  expect(strong).not.toEqual(weak);
});

test('shows the sensitive-text tip next to the method picker', async ({ page }) => {
  await expect(page.getByRole('note')).toContainText('use Solid fill');
  await expect(page.getByRole('group', { name: 'Hide method' })).toBeVisible();
});

test('feathered edge is offered for blur only', async ({ page }) => {
  await selectTool(page, 'Rectangle');
  await dragImage(page, [100, 50], [300, 250]);
  await expect(page.getByRole('radio', { name: 'Feathered' })).toBeVisible();
  await page.getByRole('radio', { name: 'Feathered' }).check();
  await expect(page.getByLabel('Feather width')).toBeVisible();
  await page.getByRole('radio', { name: 'Pixelate' }).check();
  await expect(page.getByRole('radio', { name: 'Feathered' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Solid fill' }).check();
  await expect(page.getByRole('radio', { name: 'Feathered' })).toHaveCount(0);
});
