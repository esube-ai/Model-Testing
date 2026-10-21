import { expect, test, type Page } from '@playwright/test';
import { imageToPage, makeImage, openViaPicker, overlayRegions } from './helpers';

/** One-finger drag with real touch-type pointer events, through image-pixel waypoints. */
async function fingerDrag(page: Page, pts: [number, number][], offset: [number, number] = [0, 0]) {
  const screen = [];
  for (const [x, y] of pts) {
    const p = await imageToPage(page, x, y);
    screen.push({ x: p.x + offset[0], y: p.y + offset[1] });
  }
  await page.getByTestId('canvas-area').evaluate((el, screen) => {
    const fire = (type: string, x: number, y: number) =>
      el.dispatchEvent(
        new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 }),
      );
    fire('pointerdown', screen[0].x, screen[0].y);
    for (let i = 1; i < screen.length; i++) {
      const a = screen[i - 1];
      const b = screen[i];
      for (let s = 1; s <= 5; s++) fire('pointermove', a.x + ((b.x - a.x) * s) / 5, a.y + ((b.y - a.y) * s) / 5);
    }
    const last = screen[screen.length - 1];
    fire('pointerup', last.x, last.y);
  }, screen);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const png = await makeImage(page, { width: 900, height: 700 });
  await openViaPicker(page, png, 'touch.png', 'image/png');
});

test('draws regions and adjusts them with one finger', async ({ page }, info) => {
  const press = (name: string) => {
    const radio = page.getByRole('radio', { name });
    return info.project.use.hasTouch ? radio.tap() : radio.check();
  };
  // Tapping tool buttons works with touch.
  await press('Ellipse');
  await expect(page.getByRole('radio', { name: 'Ellipse' })).toBeChecked();
  await fingerDrag(page, [[100, 100], [400, 300]]);
  await press('Brush');
  await fingerDrag(page, [[500, 400], [600, 500], [800, 450]]);
  expect((await overlayRegions(page)).map((r) => r.shape)).toEqual(['ellipse', 'brush']);

  // Select the ellipse with a tap, then resize it from slightly off its handle (fingers are imprecise).
  await press('Select');
  await fingerDrag(page, [[250, 200], [250, 200]]);
  expect((await overlayRegions(page))[0].selected).toBe(true);
  await fingerDrag(page, [[400, 300], [500, 400]], [12, 10]);
  const se = (await page.locator('[data-handle="se"]').boundingBox())!;
  const want = await imageToPage(page, 500, 400);
  // Off by the finger offset in image px (offset / scale), handled by the resize itself.
  expect(Math.abs(se.x + se.width / 2 - want.x)).toBeLessThan(14);
  expect(Math.abs(se.y + se.height / 2 - want.y)).toBeLessThan(12);

  // Move it with a finger drag on its body.
  const before = (await page.locator('[data-handle="nw"]').boundingBox())!;
  await fingerDrag(page, [[300, 250], [350, 280]]);
  const after = (await page.locator('[data-handle="nw"]').boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x);
});

test('handles are larger on touch screens', async ({ page, browserName }, info) => {
  test.skip(info.project.name !== 'phone-400' || browserName !== 'chromium', 'coarse pointer only on the touch project');
  await page.getByRole('radio', { name: 'Rectangle' }).tap();
  await fingerDrag(page, [[100, 100], [400, 300]]);
  const h = (await page.locator('[data-handle="se"]').boundingBox())!;
  expect(h.width).toBeGreaterThanOrEqual(16);
});
