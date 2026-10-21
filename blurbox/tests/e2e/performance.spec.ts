import { expect, test } from '@playwright/test';
import { readImageInfo } from '../../src/processing/imageInfo';
import { dragImage, exportImage, previewSettled, selectTool } from './helpers';

const W = 8660;
const H = 5774; // 50.0 megapixels

test('a 50 MP image loads, blurs and exports without blocking the main thread for more than 200 ms', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');

  // Build the 50 MP JPEG in the page before measuring.
  await page.evaluate(async ({ W, H }) => {
    const c = new OffscreenCanvas(W, H);
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#203060');
    g.addColorStop(0.5, '#e0a040');
    g.addColorStop(1, '#40a080');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 220px sans-serif';
    for (let y = 300; y < H; y += 600) ctx.fillText('ACCOUNT 1234 5678 9012', 200, y);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    (window as unknown as { __big: File }).__big = new File([blob], 'huge.jpg', { type: 'image/jpeg' });
  }, { W, H });

  await page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    }).observe({ type: 'longtask' });
  });

  const t0 = Date.now();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add((window as unknown as { __big: File }).__big);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      document.body.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }
  });
  await expect(page.getByTestId('image-info')).toHaveText(`huge · ${W} × ${H}`, { timeout: 120_000 });
  const loadMs = Date.now() - t0;

  const t1 = Date.now();
  await selectTool(page, 'Rectangle');
  await dragImage(page, [800, 800], [7800, 4800]); // a 28 MP blur region
  await previewSettled(page);
  await page.getByLabel('Blur strength').fill('120');
  await previewSettled(page);
  const blurMs = Date.now() - t1;

  // Zoom to 100% so the full-resolution detail path runs too.
  await page.getByRole('button', { name: '100%' }).click();
  await expect(page.getByTestId('preview-canvas')).not.toHaveAttribute('data-detail', '', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Fit' }).click();

  const t2 = Date.now();
  const out = await exportImage(page, { format: 'JPEG', quality: 85 });
  const exportMs = Date.now() - t2;
  expect(readImageInfo(out.bytes)).toMatchObject({ width: W, height: H });

  const longTasks = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
  const worst = Math.max(0, ...longTasks);
  console.log(
    `50 MP: load ${loadMs} ms, blur+preview ${blurMs} ms, export ${exportMs} ms (${(out.bytes.length / 1e6).toFixed(1)} MB); ` +
      `main-thread long tasks: ${longTasks.length}, worst ${worst.toFixed(0)} ms`,
  );
  expect(worst).toBeLessThanOrEqual(200);
});
