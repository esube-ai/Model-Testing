import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dragImage, makeImage, openViaPicker, selectTool } from './helpers';

async function axe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${label}: ${v.id} (${v.impact}) ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join('\n  ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test('no WCAG A/AA violations in any state', async ({ page }) => {
  await page.goto('/');
  await axe(page, 'empty');
  const png = await makeImage(page, { width: 800, height: 600 });
  await openViaPicker(page, png, 'a11y.png', 'image/png');
  await axe(page, 'loaded');
  await selectTool(page, 'Rectangle');
  await dragImage(page, [100, 100], [300, 250]);
  await axe(page, 'region selected (blur)');
  await page.getByRole('radio', { name: 'Feathered' }).check();
  await page.getByRole('radio', { name: 'Pixelate' }).check();
  await page.getByRole('radio', { name: 'Solid fill' }).check();
  await axe(page, 'fill');
  await selectTool(page, 'Brush');
  await axe(page, 'brush tool');
  await page.getByRole('button', { name: 'Export…' }).click();
  await axe(page, 'export dialog');
  await page.keyboard.press('Escape');
  await page.keyboard.press('?');
  await axe(page, 'help dialog');
});

test('every control is reachable with Tab and shows a visible focus indicator', async ({ page }) => {
  await page.goto('/');
  const png = await makeImage(page, { width: 800, height: 600 });
  await openViaPicker(page, png, 'kb.png', 'image/png');
  await selectTool(page, 'Rectangle');
  await dragImage(page, [100, 100], [300, 250]);
  await page.getByRole('radio', { name: 'Feathered' }).check();
  await page.locator('body').focus();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  const seen: { name: string; visible: boolean }[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const label =
        el.getAttribute('aria-label') ||
        (el instanceof HTMLInputElement && el.labels?.[0]?.textContent) ||
        el.textContent ||
        el.getAttribute('title') ||
        el.tagName;
      // Visually hidden radios show focus on their label wrapper.
      const target = el instanceof HTMLInputElement && el.type === 'radio' ? el.parentElement! : el;
      const s = getComputedStyle(target);
      const visible = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
      return { name: label.trim().replace(/\s+/g, ' '), visible };
    });
    if (!info) continue;
    if (seen.some((s) => s.name === info.name)) break;
    seen.push(info);
  }
  const names = seen.map((s) => s.name);
  for (const expected of [
    'Open image', 'Undo', 'Keyboard shortcuts', 'Export…', 'Rectangle', 'Image kb', 'Zoom out', 'Zoom in', 'Fit', '100%',
    'Hold to compare', 'Rectangle 1 · Blur', 'Blur', 'Blur strength', 'Feathered', 'Feather width', 'Delete region',
  ]) {
    expect(names.some((n) => n.startsWith(expected)), `${expected} reachable; got: ${names.join(' | ')}`).toBe(true);
  }
  const invisible = seen.filter((s) => !s.visible).map((s) => s.name);
  expect(invisible, `no focus ring: ${invisible.join(', ')}`).toEqual([]);
});
