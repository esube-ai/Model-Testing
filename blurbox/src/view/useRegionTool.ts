import { useLayoutEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { EditorAction } from '../model/editor';
import { newRegionId } from '../model/editor';
import { makeRegion, type RegionSettings } from '../model/defaults';
import {
  HANDLES, handlePosition, intersectsImage, moveShape, normalizeBox, regionAt, resizeShape, shapeBounds,
  type Box, type Handle,
} from '../model/geometry';
import type { ImageMeta, Region, Tool } from '../model/types';
import type { ToolHandler, ToolPointer } from './CanvasView';
import type { View } from './viewTransform';

type Gesture =
  | { kind: 'box'; region: Region; x0: number; y0: number; moved: boolean }
  | { kind: 'brush'; region: Region; minStep: number }
  | { kind: 'move'; start: Region; x0: number; y0: number; moved: boolean }
  | { kind: 'resize'; start: Region; box: Box; handle: Handle };

interface Options {
  tool: Tool;
  regions: Region[];
  selectedId: string | null;
  view: View;
  meta: ImageMeta;
  brushSize: number;
  settings: RegionSettings;
  dispatch: Dispatch<EditorAction>;
}

/** Screen-pixel radius for grabbing a resize handle. Fingers get a larger target. */
export function handleRadius(pointerType: string): number {
  return pointerType === 'touch' ? 22 : 9;
}

export function handleAt(region: Region, p: ToolPointer, view: View): Handle | null {
  const b = shapeBounds(region.shape);
  const r = handleRadius(p.pointerType);
  let best: Handle | null = null;
  let bestD = Infinity;
  for (const h of HANDLES) {
    const hp = handlePosition(b, h);
    const d = Math.hypot((hp.x - p.x) * view.scale, (hp.y - p.y) * view.scale);
    if (d <= r && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

const HANDLE_CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
};

/**
 * Pointer behaviour for the editing tools. Changes in progress live in `draft` (shown live in the
 * overlay and preview) and are committed to history as a single step when the pointer is released.
 */
export function useRegionTool(o: Options) {
  const [draft, setDraft] = useState<Region | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; cursor: string } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const opts = useRef(o);
  useLayoutEffect(() => {
    opts.current = o;
  });

  const handler = useMemo<ToolHandler>(() => {
    const tolerance = (p: ToolPointer) => (p.pointerType === 'touch' ? 12 : 3) / opts.current.view.scale;
    const selected = () => opts.current.regions.find((r) => r.id === opts.current.selectedId) ?? null;

    const cursorAt = (p: ToolPointer): string => {
      const { tool, regions, view } = opts.current;
      const sel = selected();
      const h = sel && handleAt(sel, p, view);
      if (h) return HANDLE_CURSORS[h];
      if (tool === 'select') return regionAt(regions, p.x, p.y, tolerance(p)) ? 'move' : 'default';
      if (tool === 'brush') return 'none';
      return 'crosshair';
    };

    return {
      down(p) {
        const { tool, regions, view, brushSize, settings, dispatch } = opts.current;
        const sel = selected();
        const h = sel && handleAt(sel, p, view);
        if (sel && h) {
          gesture.current = { kind: 'resize', start: sel, box: shapeBounds(sel.shape), handle: h };
          return true;
        }
        if (tool === 'select') {
          const hit = regionAt(regions, p.x, p.y, tolerance(p));
          dispatch({ type: 'select', id: hit?.id ?? null });
          if (!hit) return false;
          gesture.current = { kind: 'move', start: hit, x0: p.x, y0: p.y, moved: false };
          return true;
        }
        if (tool === 'rect' || tool === 'ellipse') {
          const region = makeRegion(newRegionId(), { kind: tool, x: p.x, y: p.y, w: 0, h: 0 }, settings);
          gesture.current = { kind: 'box', region, x0: p.x, y0: p.y, moved: false };
          return true;
        }
        if (tool === 'brush') {
          const region = makeRegion(newRegionId(), { kind: 'brush', points: [p.x, p.y], size: brushSize }, settings);
          gesture.current = { kind: 'brush', region, minStep: Math.max(0.5, Math.min(brushSize / 6, 4 / view.scale)) };
          setDraft(region);
          return true;
        }
        return false;
      },

      move(p) {
        const g = gesture.current;
        if (!g) return;
        const scale = opts.current.view.scale;
        if (g.kind === 'box') {
          let { x, y } = p;
          if (p.shiftKey) {
            // Constrain to a square / circle.
            const side = Math.max(Math.abs(x - g.x0), Math.abs(y - g.y0));
            x = g.x0 + Math.sign(x - g.x0 || 1) * side;
            y = g.y0 + Math.sign(y - g.y0 || 1) * side;
          }
          const box = normalizeBox(g.x0, g.y0, x, y);
          g.moved ||= box.w * scale >= 3 || box.h * scale >= 3;
          g.region = { ...g.region, shape: { ...g.region.shape, ...box } as Region['shape'] };
          if (g.moved) setDraft(g.region);
        } else if (g.kind === 'brush') {
          if (g.region.shape.kind !== 'brush') return;
          const pts = g.region.shape.points;
          const lx = pts[pts.length - 2];
          const ly = pts[pts.length - 1];
          if (Math.hypot(p.x - lx, p.y - ly) < g.minStep) return;
          g.region = { ...g.region, shape: { ...g.region.shape, points: [...pts, p.x, p.y] } };
          setDraft(g.region);
        } else if (g.kind === 'move') {
          const dx = p.x - g.x0;
          const dy = p.y - g.y0;
          g.moved ||= Math.hypot(dx, dy) * scale >= 2;
          if (g.moved) setDraft({ ...g.start, shape: moveShape(g.start.shape, dx, dy) });
        } else {
          setDraft({ ...g.start, shape: resizeShape(g.start.shape, g.box, g.handle, p.x, p.y) });
        }
      },

      up(p) {
        const g = gesture.current;
        gesture.current = null;
        const { dispatch, regions, meta } = opts.current;
        setDraft(null);
        if (!g) return;
        if (g.kind === 'box') {
          if (!g.moved) {
            // A click without a drag selects whatever is under the pointer.
            const hit = regionAt(regions, p.x, p.y, tolerance(p));
            dispatch({ type: 'select', id: hit?.id ?? null });
            return;
          }
          if (intersectsImage(g.region.shape, meta.width, meta.height)) dispatch({ type: 'add', region: g.region });
        } else if (g.kind === 'brush') {
          if (intersectsImage(g.region.shape, meta.width, meta.height)) dispatch({ type: 'add', region: g.region });
        } else if (g.kind === 'move') {
          if (!g.moved) return;
          const shape = moveShape(g.start.shape, p.x - g.x0, p.y - g.y0);
          if (intersectsImage(shape, meta.width, meta.height)) dispatch({ type: 'replace', region: { ...g.start, shape } });
        } else {
          const shape = resizeShape(g.start.shape, g.box, g.handle, p.x, p.y);
          const b = shapeBounds(shape);
          if (b.w > 0 && b.h > 0 && intersectsImage(shape, meta.width, meta.height)) {
            dispatch({ type: 'replace', region: { ...g.start, shape } });
          }
        }
      },

      cancel() {
        gesture.current = null;
        setDraft(null);
      },

      hover(p) {
        setHover(p ? { x: p.x, y: p.y, cursor: cursorAt(p) } : null);
      },
    };
  }, []);

  return { handler, draft, hover };
}

/** The regions as they should currently look, with any in-progress edit applied. */
export function withDraft(regions: Region[], draft: Region | null): Region[] {
  if (!draft) return regions;
  const i = regions.findIndex((r) => r.id === draft.id);
  if (i < 0) return [...regions, draft];
  const next = regions.slice();
  next[i] = draft;
  return next;
}
