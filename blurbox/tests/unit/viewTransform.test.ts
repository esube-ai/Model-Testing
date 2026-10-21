import { describe, expect, it } from 'vitest';
import {
  actualSizeView, clampPan, fitView, imageToScreen, nextZoomStep, panBy, screenToImage, zoomBy,
} from '../../src/view/viewTransform';

const viewport = { width: 1000, height: 800 };
const image = { width: 4000, height: 3000 };

describe('view transform', () => {
  it('fits the image inside the viewport, centred', () => {
    const v = fitView(viewport, image);
    expect(v.scale).toBeCloseTo((1000 - 32) / 4000);
    const tl = imageToScreen(v, 0, 0);
    const br = imageToScreen(v, 4000, 3000);
    expect((tl.x + br.x) / 2).toBeCloseTo(500);
    expect((tl.y + br.y) / 2).toBeCloseTo(400);
  });

  it('round-trips screen and image coordinates at any zoom', () => {
    for (const scale of [0.05, 0.37, 1, 7.5, 32]) {
      const v = { scale, tx: 123.4, ty: -56.7 };
      const p = screenToImage(v, 321, 654);
      const s = imageToScreen(v, p.x, p.y);
      expect(s.x).toBeCloseTo(321, 9);
      expect(s.y).toBeCloseTo(654, 9);
    }
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const v = fitView(viewport, image);
    const before = screenToImage(v, 300, 200);
    const z = zoomBy(v, 3, 300, 200, viewport, image);
    const after = screenToImage(z, 300, 200);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('zooms to 100% around the viewport centre', () => {
    const v = fitView(viewport, image);
    const centre = screenToImage(v, 500, 400);
    const a = actualSizeView(v, viewport, image);
    expect(a.scale).toBe(1);
    const c2 = screenToImage(a, 500, 400);
    expect(c2.x).toBeCloseTo(centre.x, 6);
  });

  it('never pans the image fully off screen', () => {
    const v = fitView(viewport, image);
    const p = panBy(v, 100000, 100000, viewport, image);
    expect(p.tx).toBeLessThanOrEqual(1000 - 48);
    const q = clampPan({ scale: 1, tx: -100000, ty: -100000 }, viewport, image);
    expect(q.tx + 4000).toBeGreaterThanOrEqual(48);
  });

  it('steps through preset zoom levels', () => {
    expect(nextZoomStep(1, 1)).toBe(1.5);
    expect(nextZoomStep(1, -1)).toBe(0.67);
    expect(nextZoomStep(0.3, 1)).toBe(0.33);
  });
});
