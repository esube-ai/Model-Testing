import { expect, test } from '@playwright/test';
import { insertJpegExif } from '../../src/processing/exifWriter';
import { dragImage, exportImage, makeImage, openViaDrop, openViaPicker, previewSettled, selectTool } from './helpers';

test('no network requests, storage or logging after page load', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Prepare test images before monitoring starts (makeImage uses the page only to encode).
  const photo = insertJpegExif(await makeImage(page, { width: 1600, height: 1200, type: 'image/jpeg', pattern: 'noise' }), {
    make: 'Cam', gps: { latitude: 1, longitude: 2 },
  });
  const second = await makeImage(page, { width: 300, height: 200 });

  const requests: string[] = [];
  const sockets: string[] = [];
  const consoleMessages: string[] = [];
  page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
  context.on('request', (r) => requests.push(`ctx ${r.method()} ${r.url()}`));
  page.on('websocket', (ws) => sockets.push(ws.url()));
  page.on('console', (m) => consoleMessages.push(`${m.type()}: ${m.text()}`));

  // A full session: open (picker and drop), edit with every tool and method, preview, undo/redo, export.
  await openViaPicker(page, photo, 'private.jpg', 'image/jpeg');
  await selectTool(page, 'Rectangle');
  await dragImage(page, [100, 100], [600, 400]);
  await selectTool(page, 'Ellipse');
  await dragImage(page, [700, 100], [1100, 500]);
  await page.getByRole('radio', { name: 'Pixelate' }).check();
  await selectTool(page, 'Brush');
  await dragImage(page, [200, 800], [[800, 900], [1400, 700]]);
  await page.getByRole('radio', { name: 'Solid fill' }).check();
  await previewSettled(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.getByRole('button', { name: '100%' }).click();
  await previewSettled(page);
  await page.getByRole('button', { name: 'Fit' }).click();
  for (const format of ['PNG (lossless)', 'JPEG', 'WebP'] as const) await exportImage(page, { format });
  await openViaDrop(page, second, 'second.png', 'image/png');
  await expect(page.getByTestId('image-info')).toHaveText('second · 300 × 200');

  expect(requests, 'network requests after load').toEqual([]);
  expect(sockets).toEqual([]);
  expect(consoleMessages, 'console output').toEqual([]);

  const storage = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    idb: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
  }));
  expect(storage).toEqual({ local: 0, session: 0, cookie: '', idb: 0, caches: 0 });
});

test('the production page forbids network connections via Content-Security-Policy', async ({ page }) => {
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("default-src 'self'");
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
});
