import { expect, test } from '@playwright/test';
import { dragImage, makeImage, openViaPicker, overlayRegions, previewSettled, sampleImagePixel, selectTool } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const png = await makeImage(page, { width: 400, height: 300 });
  await openViaPicker(page, png, 'quads.png', 'image/png');
});

test('undo and redo with buttons and keyboard, including method changes', async ({ page }) => {
  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeDisabled();
  await selectTool(page, 'Rectangle');
  await dragImage(page, [20, 20], [120, 120]);
  await selectTool(page, 'Ellipse');
  await dragImage(page, [220, 20], [320, 120]);
  await page.getByRole('radio', { name: 'Solid fill' }).check();
  await previewSettled(page);
  expect(await sampleImagePixel(page, 270, 70)).toEqual([0, 0, 0]);

  await undo.click(); // method change
  await previewSettled(page);
  expect(await sampleImagePixel(page, 270, 70)).not.toEqual([0, 0, 0]);
  await undo.click(); // ellipse
  expect((await overlayRegions(page)).map((r) => r.shape)).toEqual(['rect']);
  await undo.click(); // rectangle
  expect(await overlayRegions(page)).toEqual([]);
  await expect(undo).toBeDisabled();

  await page.getByTestId('canvas-area').focus();
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  expect((await overlayRegions(page)).map((r) => r.shape)).toEqual(['rect', 'ellipse']);
  await previewSettled(page);
  expect(await sampleImagePixel(page, 270, 70)).toEqual([0, 0, 0]);
  await expect(redo).toBeDisabled();

  await page.keyboard.press('ControlOrMeta+Z');
  await page.keyboard.press('ControlOrMeta+Z');
  expect((await overlayRegions(page)).map((r) => r.shape)).toEqual(['rect']);
  await page.keyboard.press('Control+Y');
  expect((await overlayRegions(page)).map((r) => r.shape)).toEqual(['rect', 'ellipse']);
});

test('a slider drag is a single undo step; 60 edits can all be undone', async ({ page }) => {
  await selectTool(page, 'Rectangle');
  await dragImage(page, [20, 20], [120, 120]);
  const strength = page.getByLabel('Blur strength');
  const initial = await strength.inputValue();
  await strength.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  expect(Number(await strength.inputValue())).toBe(Number(initial) + 5);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(strength).toHaveValue(initial);

  // 60 separate edits (alternating methods), then undo them all.
  const methods = ['Pixelate', 'Blur'] as const;
  for (let i = 0; i < 60; i++) await page.getByRole('radio', { name: methods[i % 2] }).check();
  await expect(page.getByRole('radio', { name: 'Blur', exact: true })).toBeChecked();
  for (let i = 0; i < 60; i++) await page.getByRole('button', { name: 'Undo' }).click();
  // Back to just after the rectangle was drawn: blur, initial strength.
  await expect(page.getByRole('radio', { name: 'Blur', exact: true })).toBeChecked();
  await expect(strength).toHaveValue(initial);
  expect(await overlayRegions(page)).toHaveLength(1);
});
