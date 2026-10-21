import { expect, test } from '@playwright/test';
import { dragImage, makeImage, openViaPicker, overlayRegions } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const png = await makeImage(page, { width: 800, height: 600 });
  await openViaPicker(page, png, 'kb.png', 'image/png');
  await page.getByTestId('canvas-area').focus();
});

test('tool keys switch tools', async ({ page }) => {
  for (const [key, name] of [['v', 'Select'], ['r', 'Rectangle'], ['e', 'Ellipse'], ['b', 'Brush'], ['h', 'Pan']] as const) {
    await page.keyboard.press(key);
    await expect(page.getByRole('radio', { name })).toBeChecked();
  }
});

test('the whole editing flow works from the keyboard', async ({ page }) => {
  const canvas = page.getByTestId('preview-canvas');
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  expect(await overlayRegions(page)).toHaveLength(2);
  await expect(page.getByTestId('announcer')).toContainText('Rectangle 2 added');

  await page.keyboard.press('3');
  await expect(page.getByRole('radio', { name: 'Solid fill' })).toBeChecked();
  await page.keyboard.press('2');
  await expect(page.getByRole('radio', { name: 'Pixelate' })).toBeChecked();

  const handle = page.locator('[data-handle="nw"]');
  const before = (await handle.boundingBox())!;
  const scale = Number(await canvas.getAttribute('data-view-scale'));
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowDown');
  const after = (await handle.boundingBox())!;
  const unit = Math.max(1, Math.round(1 / scale));
  expect(after.x - before.x).toBeCloseTo(10 * unit * scale, 0);
  expect(after.y - before.y).toBeCloseTo(1 * unit * scale, 0);

  // Alt+Arrow resizes.
  const se0 = (await page.locator('[data-handle="se"]').boundingBox())!;
  await page.keyboard.press('Alt+Shift+ArrowRight');
  const se1 = (await page.locator('[data-handle="se"]').boundingBox())!;
  expect(se1.x - se0.x).toBeCloseTo(10 * unit * scale, 0);

  // Nudges coalesce into one undo step per kind.
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(async () => (await page.locator('[data-handle="se"]').boundingBox())!.x).toBeCloseTo(se0.x, 0);

  await page.keyboard.press(','); // previous region
  expect((await overlayRegions(page))[0].selected).toBe(true);
  await page.keyboard.press('Escape');
  expect((await overlayRegions(page)).some((r) => r.selected)).toBe(false);
  await page.keyboard.press('.');
  await page.keyboard.press('Delete');
  expect(await overlayRegions(page)).toHaveLength(1);
});

test('zoom keys and brush size keys', async ({ page }) => {
  const level = page.getByTestId('zoom-level');
  await page.keyboard.press('ControlOrMeta+1');
  await expect(level).toHaveText('100%');
  await page.keyboard.press('+');
  await expect(level).toHaveText('150%');
  await page.keyboard.press('-');
  await expect(level).toHaveText('100%');
  await page.keyboard.press('ControlOrMeta+0');
  await expect(level).not.toHaveText('100%');

  await page.keyboard.press('b');
  const size = page.getByRole('slider', { name: 'Brush size' });
  const s0 = Number(await size.inputValue());
  await page.keyboard.press(']');
  expect(Number(await size.inputValue())).toBeGreaterThan(s0);
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  expect(Number(await size.inputValue())).toBeLessThan(s0);
});

test('"?" opens the shortcut overlay; Escape closes it', async ({ page }) => {
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  for (const label of ['Rectangle', 'Ellipse', 'Brush', 'Undo', 'Redo', 'Fit to screen', 'Hold to show the original', 'Export']) {
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
  }
  // Shortcuts are paused while the overlay is open.
  await page.keyboard.press('e');
  await expect(page.getByRole('radio', { name: 'Ellipse' })).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close keyboard shortcuts' }).click();
  await expect(dialog).toBeHidden();
});

test('Ctrl/Cmd+S opens export; drawing still works with the mouse after keyboard use', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByRole('dialog', { name: 'Export image' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Export image' })).toBeHidden();
  await page.keyboard.press('e');
  await dragImage(page, [100, 100], [200, 200]);
  expect((await overlayRegions(page)).map((r) => r.shape)).toEqual(['ellipse']);
});
