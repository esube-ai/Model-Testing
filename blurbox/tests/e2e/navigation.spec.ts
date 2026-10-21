import { expect, test } from '@playwright/test';
import { makeImage, openViaPicker } from './helpers';

async function viewState(page: import('@playwright/test').Page) {
  return page.getByTestId('preview-canvas').evaluate((c: HTMLCanvasElement) => ({
    scale: Number(c.dataset.viewScale),
    tx: Number(c.dataset.viewTx),
    ty: Number(c.dataset.viewTy),
  }));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const png = await makeImage(page, { width: 2400, height: 1600 });
  await openViaPicker(page, png, 'big.png', 'image/png');
});

test('fits the image on open and supports zoom buttons, fit and 100%', async ({ page }) => {
  const fitted = await viewState(page);
  expect(fitted.scale).toBeLessThan(1);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect((await viewState(page)).scale).toBeGreaterThan(fitted.scale);
  await page.getByRole('button', { name: '100%' }).click();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
  await page.getByRole('button', { name: 'Fit' }).click();
  expect((await viewState(page)).scale).toBeCloseTo(fitted.scale, 5);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  expect((await viewState(page)).scale).toBeLessThan(fitted.scale);
});

test('mouse wheel zooms around the cursor', async ({ page, isMobile }) => {
  test.skip(isMobile, 'wheel is a desktop input');
  const area = page.getByTestId('canvas-area');
  const box = (await area.boundingBox())!;
  const before = await viewState(page);
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await viewState(page)).scale).toBeGreaterThan(before.scale);
  const after = await viewState(page);
  // The image point under the cursor stays put.
  const px = box.width / 3;
  const ix0 = (px - before.tx) / before.scale;
  const ix1 = (px - after.tx) / after.scale;
  expect(Math.abs(ix1 - ix0)).toBeLessThan(1); // within one image pixel (mouse coords are rounded)
});

test('space + drag pans the view', async ({ page }) => {
  await page.getByRole('button', { name: '100%' }).click();
  const area = page.getByTestId('canvas-area');
  const box = (await area.boundingBox())!;
  const before = await viewState(page);
  await area.focus();
  await page.keyboard.down('Space');
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 140, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const after = await viewState(page);
  expect(after.tx - before.tx).toBeCloseTo(60, 0);
  expect(after.ty - before.ty).toBeCloseTo(40, 0);
});

test('two-finger pinch zooms and two-finger drag pans', async ({ page }) => {
  const area = page.getByTestId('canvas-area');
  const box = (await area.boundingBox())!;
  const before = await viewState(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // Synthesise two touch pointers via pointer events (Playwright has no multi-touch API).
  await area.evaluate((el, { cx, cy }) => {
    const fire = (type: string, id: number, x: number, y: number) =>
      el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, button: type === 'pointermove' ? -1 : 0 }));
    fire('pointerdown', 1, cx - 20, cy);
    fire('pointerdown', 2, cx + 20, cy);
    for (let i = 1; i <= 5; i++) {
      fire('pointermove', 1, cx - 20 - i * 10 + i * 6, cy + i * 6);
      fire('pointermove', 2, cx + 20 + i * 10 + i * 6, cy + i * 6);
    }
    fire('pointerup', 1, cx - 40 + 30, cy + 30);
    fire('pointerup', 2, cx + 70 + 30, cy + 30);
  }, { cx, cy });
  const after = await viewState(page);
  // Finger distance went from 40 to 140 → 3.5× zoom.
  expect(after.scale / before.scale).toBeCloseTo(3.5, 1);
  // The centroid moved by (30, 30): the image point under the original centroid follows it.
  const ix0 = (cx - box.x - before.tx) / before.scale;
  const ix1 = (cx - box.x + 30 - after.tx) / after.scale;
  expect(ix1).toBeCloseTo(ix0, 1);
});
