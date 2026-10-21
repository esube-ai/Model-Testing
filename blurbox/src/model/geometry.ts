import type { BrushShape, Region, Shape } from './types';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Axis-aligned bounds of the pixels a shape covers, in image pixels. */
export function shapeBounds(s: Shape): Box {
  if (s.kind !== 'brush') return { x: s.x, y: s.y, w: s.w, h: s.h };
  const p = s.points;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]);
    x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]);
    y1 = Math.max(y1, p[i + 1]);
  }
  const r = s.size / 2;
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0 - r, y: y0 - r, w: x1 - x0 + s.size, h: y1 - y0 + s.size };
}

/** Squared distance from (px, py) to the segment (ax, ay)–(bx, by). */
export function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len > 0 ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

export function brushDistance(s: BrushShape, x: number, y: number): number {
  const p = s.points;
  if (p.length < 2) return Infinity;
  let best = Infinity;
  if (p.length === 2) return Math.hypot(x - p[0], y - p[1]);
  for (let i = 0; i + 3 < p.length; i += 2) {
    best = Math.min(best, distSqToSegment(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]));
  }
  return Math.sqrt(best);
}

/** Is (x, y) on the shape? `tolerance` (image px) widens the hit area for small shapes and touch. */
export function hitTestShape(s: Shape, x: number, y: number, tolerance = 0): boolean {
  switch (s.kind) {
    case 'rect':
      return x >= s.x - tolerance && x <= s.x + s.w + tolerance && y >= s.y - tolerance && y <= s.y + s.h + tolerance;
    case 'ellipse': {
      const rx = s.w / 2 + tolerance;
      const ry = s.h / 2 + tolerance;
      if (rx <= 0 || ry <= 0) return false;
      const nx = (x - (s.x + s.w / 2)) / rx;
      const ny = (y - (s.y + s.h / 2)) / ry;
      return nx * nx + ny * ny <= 1;
    }
    case 'brush':
      return brushDistance(s, x, y) <= s.size / 2 + tolerance;
  }
}

/** Topmost region under the point (regions later in the list are drawn on top). */
export function regionAt(regions: Region[], x: number, y: number, tolerance = 0): Region | null {
  for (let i = regions.length - 1; i >= 0; i--) {
    if (hitTestShape(regions[i].shape, x, y, tolerance)) return regions[i];
  }
  return null;
}

export function handlePosition(b: Box, h: Handle): { x: number; y: number } {
  const x = h.includes('w') ? b.x : h.includes('e') ? b.x + b.w : b.x + b.w / 2;
  const y = h.startsWith('n') ? b.y : h.startsWith('s') ? b.y + b.h : b.y + b.h / 2;
  return { x, y };
}

export function normalizeBox(x0: number, y0: number, x1: number, y1: number): Box {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

/** New bounds after dragging handle `h` of `start` to (x, y). Dragging past the opposite edge flips. */
export function resizeBox(start: Box, h: Handle, x: number, y: number): Box {
  let x0 = start.x;
  let y0 = start.y;
  let x1 = start.x + start.w;
  let y1 = start.y + start.h;
  if (h.includes('w')) x0 = x;
  if (h.includes('e')) x1 = x;
  if (h.startsWith('n')) y0 = y;
  if (h.startsWith('s')) y1 = y;
  return normalizeBox(x0, y0, x1, y1);
}

export function moveShape(s: Shape, dx: number, dy: number): Shape {
  if (s.kind === 'brush') return { ...s, points: s.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };
  return { ...s, x: s.x + dx, y: s.y + dy };
}

/** Fits a shape whose bounds were `from` into the bounds `to`. Brush strokes keep their width. */
export function fitShapeToBox(s: Shape, from: Box, to: Box): Shape {
  if (s.kind !== 'brush') return { ...s, x: to.x, y: to.y, w: to.w, h: to.h };
  const r = s.size / 2;
  // Scale the stroke's centre-line bounds (bounds minus the brush radius on each side).
  const fx = from.x + r;
  const fy = from.y + r;
  const fw = Math.max(0, from.w - s.size);
  const fh = Math.max(0, from.h - s.size);
  const tx = to.x + r;
  const ty = to.y + r;
  const tw = Math.max(0, to.w - s.size);
  const th = Math.max(0, to.h - s.size);
  const sx = fw > 0 ? tw / fw : 1;
  const sy = fh > 0 ? th / fh : 1;
  return {
    ...s,
    points: s.points.map((v, i) => (i % 2 === 0 ? tx + (v - fx) * sx : ty + (v - fy) * sy)),
  };
}

export function resizeShape(s: Shape, start: Box, h: Handle, x: number, y: number): Shape {
  return fitShapeToBox(s, start, resizeBox(start, h, x, y));
}

/** Does any part of the shape lie on the image? Regions fully outside are useless. */
export function intersectsImage(s: Shape, width: number, height: number): boolean {
  const b = shapeBounds(s);
  return b.x < width && b.y < height && b.x + b.w > 0 && b.y + b.h > 0;
}

export function shapeLabel(s: Shape): string {
  return s.kind === 'rect' ? 'Rectangle' : s.kind === 'ellipse' ? 'Ellipse' : 'Brush stroke';
}
