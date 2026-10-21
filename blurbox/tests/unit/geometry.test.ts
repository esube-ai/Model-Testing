import { describe, expect, it } from 'vitest';
import {
  fitShapeToBox, hitTestShape, intersectsImage, moveShape, regionAt, resizeBox, resizeShape, shapeBounds,
} from '../../src/model/geometry';
import { makeRegion, defaultSettings } from '../../src/model/defaults';
import type { BrushShape } from '../../src/model/types';

const s = defaultSettings(1000, 1000);

describe('geometry', () => {
  it('computes brush bounds including the brush radius', () => {
    const b: BrushShape = { kind: 'brush', points: [10, 10, 50, 30], size: 10 };
    expect(shapeBounds(b)).toEqual({ x: 5, y: 5, w: 50, h: 30 });
  });

  it('hit-tests each shape kind', () => {
    expect(hitTestShape({ kind: 'rect', x: 10, y: 10, w: 20, h: 20 }, 15, 15)).toBe(true);
    expect(hitTestShape({ kind: 'rect', x: 10, y: 10, w: 20, h: 20 }, 35, 15)).toBe(false);
    expect(hitTestShape({ kind: 'rect', x: 10, y: 10, w: 20, h: 20 }, 33, 15, 4)).toBe(true);
    // Ellipse corners are outside even though they're inside the bounds.
    expect(hitTestShape({ kind: 'ellipse', x: 0, y: 0, w: 100, h: 50 }, 50, 25)).toBe(true);
    expect(hitTestShape({ kind: 'ellipse', x: 0, y: 0, w: 100, h: 50 }, 3, 3)).toBe(false);
    const brush: BrushShape = { kind: 'brush', points: [0, 0, 100, 0], size: 10 };
    expect(hitTestShape(brush, 50, 4)).toBe(true);
    expect(hitTestShape(brush, 50, 6)).toBe(false);
  });

  it('picks the topmost region', () => {
    const a = makeRegion('a', { kind: 'rect', x: 0, y: 0, w: 50, h: 50 }, s);
    const b = makeRegion('b', { kind: 'rect', x: 25, y: 25, w: 50, h: 50 }, s);
    expect(regionAt([a, b], 30, 30)?.id).toBe('b');
    expect(regionAt([a, b], 10, 10)?.id).toBe('a');
    expect(regionAt([a, b], 90, 90)).toBeNull();
  });

  it('resizes by handle and flips when dragged past the opposite edge', () => {
    const box = { x: 10, y: 10, w: 40, h: 20 };
    expect(resizeBox(box, 'se', 70, 50)).toEqual({ x: 10, y: 10, w: 60, h: 40 });
    expect(resizeBox(box, 'e', 0, 999)).toEqual({ x: 0, y: 10, w: 10, h: 20 });
    expect(resizeBox(box, 'n', 999, 0)).toEqual({ x: 10, y: 0, w: 40, h: 30 });
    expect(resizeBox(box, 'nw', 60, 40)).toEqual({ x: 50, y: 30, w: 10, h: 10 });
  });

  it('moves and resizes brush strokes, keeping the stroke width', () => {
    const b: BrushShape = { kind: 'brush', points: [10, 10, 30, 10], size: 4 };
    const moved = moveShape(b, 5, -5) as BrushShape;
    expect(moved.points).toEqual([15, 5, 35, 5]);
    const start = shapeBounds(b); // x 8..32
    const grown = resizeShape(b, start, 'e', 52, 0) as BrushShape;
    expect(grown.size).toBe(4);
    expect(shapeBounds(grown).x).toBeCloseTo(8);
    expect(shapeBounds(grown).w).toBeCloseTo(44);
    const fitted = fitShapeToBox({ kind: 'rect', x: 0, y: 0, w: 1, h: 1 }, start, { x: 1, y: 2, w: 3, h: 4 });
    expect(fitted).toEqual({ kind: 'rect', x: 1, y: 2, w: 3, h: 4 });
  });

  it('knows when a shape is entirely off the image', () => {
    expect(intersectsImage({ kind: 'rect', x: -50, y: -50, w: 60, h: 60 }, 100, 100)).toBe(true);
    expect(intersectsImage({ kind: 'rect', x: 120, y: 0, w: 60, h: 60 }, 100, 100)).toBe(false);
  });
});
