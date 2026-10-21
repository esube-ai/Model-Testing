import { useEffect, useRef, type ReactNode } from 'react';
import type { ImageMeta } from '../model/types';
import type { PreviewSurface } from './surface';
import { panBy, screenToImage, zoomBy, zoomTo, type Size, type View } from './viewTransform';
import styles from './CanvasView.module.css';

export interface ToolPointer {
  /** Position in image pixels. */
  x: number;
  y: number;
  /** Position in viewport CSS pixels. */
  sx: number;
  sy: number;
  pointerType: string;
  shiftKey: boolean;
  altKey: boolean;
}

/** Single-pointer editing gestures (drawing, moving, resizing) are delegated to the active tool. */
export interface ToolHandler {
  down(p: ToolPointer): boolean; // return false to ignore the gesture
  move(p: ToolPointer): void;
  up(p: ToolPointer): void;
  cancel(): void;
  hover?(p: ToolPointer | null): void;
}

interface Props {
  meta: ImageMeta;
  surface: PreviewSurface;
  surfaceVersion: number;
  detail: DetailTile | null;
  showOriginal: boolean;
  view: View;
  onViewChange: (v: View) => void;
  onViewportSize: (s: Size) => void;
  viewport: Size;
  panMode: boolean;
  cursor: string;
  tool: ToolHandler | null;
  label: string;
  busy?: boolean;
  children?: ReactNode;
}

/** A full-resolution render of part of the image, drawn over the preview when zoomed in. */
export interface DetailTile {
  /** Image-pixel rectangle the bitmap covers. */
  x: number;
  y: number;
  w: number;
  h: number;
  bitmap: ImageBitmap;
}

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; id: number; lastX: number; lastY: number }
  | { kind: 'pinch'; lastDist: number; lastCx: number; lastCy: number }
  | { kind: 'tool'; id: number };

export function CanvasView(props: Props) {
  const { meta, surface, surfaceVersion, detail, showOriginal, view, viewport, onViewportSize } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ kind: 'none' });

  useEffect(() => {
    latest.current = props;
  });

  /** Events can arrive faster than React re-renders, so the next event must see this view at once. */
  const applyView = (v: View) => {
    latest.current = { ...latest.current, view: v };
    latest.current.onViewChange(v);
  };

  // Track the viewport size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      onViewportSize({ width: Math.round(width), height: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onViewportSize]);

  // Paint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !viewport.width || !viewport.height) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(viewport.width * dpr);
    const ch = Math.round(viewport.height * dpr);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const src = showOriginal ? surface.original : surface.composite;
    // Crisp pixels when zoomed far in; smooth when the preview is being shrunk or slightly enlarged.
    const enlargement = (view.scale * dpr) / surface.scale;
    ctx.imageSmoothingEnabled = enlargement < 3;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, view.tx, view.ty, meta.width * view.scale, meta.height * view.scale);
    if (detail && !showOriginal) {
      ctx.imageSmoothingEnabled = view.scale * dpr < 3;
      ctx.drawImage(
        detail.bitmap,
        view.tx + detail.x * view.scale,
        view.ty + detail.y * view.scale,
        detail.w * view.scale,
        detail.h * view.scale,
      );
    }
  }, [meta, surface, surfaceVersion, detail, showOriginal, view, viewport]);

  // Wheel: a mouse wheel zooms around the cursor; a trackpad two-finger drag pans; trackpad pinch
  // (reported as ctrl+wheel) zooms.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: v, viewport: vp, meta: m } = latest.current;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vp.height : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const looksLikeMouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
      if (e.ctrlKey || e.metaKey || looksLikeMouseWheel) {
        const factor = Math.exp(-dy * (e.ctrlKey && !looksLikeMouseWheel ? 0.01 : 0.002));
        applyView(zoomBy(v, factor, px, py, vp, m));
      } else {
        applyView(panBy(v, -dx, -dy, vp, m));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const local = (e: React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const toolPointer = (e: React.PointerEvent): ToolPointer => {
    const s = local(e);
    const p = screenToImage(latest.current.view, s.x, s.y);
    return { x: p.x, y: p.y, sx: s.x, sy: s.y, pointerType: e.pointerType, shiftKey: e.shiftKey, altKey: e.altKey };
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = {
      kind: 'pinch',
      lastDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      lastCx: (a.x + b.x) / 2,
      lastCy: (a.y + b.y) / 2,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    containerRef.current?.focus({ preventScroll: true });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone (or synthetic); tracking still works without capture.
    }
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (pointers.current.size === 2) {
      // A second finger turns any gesture into pinch-zoom / two-finger pan.
      if (g.kind === 'tool') latest.current.tool?.cancel();
      startPinch();
      return;
    }
    if (pointers.current.size > 2 || g.kind !== 'none') return;
    if (latest.current.panMode || e.button === 1) {
      gesture.current = { kind: 'pan', id: e.pointerId, lastX: p.x, lastY: p.y };
      return;
    }
    if (latest.current.tool?.down(toolPointer(e))) gesture.current = { kind: 'tool', id: e.pointerId };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!pointers.current.has(e.pointerId)) {
      if (g.kind === 'none') latest.current.tool?.hover?.(toolPointer(e));
      return;
    }
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const { view: v, viewport: vp, meta: m } = latest.current;
    if (g.kind === 'pan' && g.id === e.pointerId) {
      applyView(panBy(v, p.x - g.lastX, p.y - g.lastY, vp, m));
      g.lastX = p.x;
      g.lastY = p.y;
    } else if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      // Pan with the fingers' midpoint first, then zoom around where it is now.
      const panned = panBy(v, cx - g.lastCx, cy - g.lastCy, vp, m);
      applyView(zoomTo(panned, (v.scale * dist) / g.lastDist, cx, cy, vp, m));
      g.lastDist = dist;
      g.lastCx = cx;
      g.lastCy = cy;
    } else if (g.kind === 'tool' && g.id === e.pointerId) {
      latest.current.tool?.move(toolPointer(e));
    }
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === 'tool' && g.id === e.pointerId) {
      if (e.type === 'pointercancel') latest.current.tool?.cancel();
      else latest.current.tool?.up(toolPointer(e));
      gesture.current = { kind: 'none' };
    } else if (g.kind === 'pan' && g.id === e.pointerId) {
      gesture.current = { kind: 'none' };
    } else if (g.kind === 'pinch' && pointers.current.size < 2) {
      // Lifting one finger ends the pinch; the remaining finger does nothing until lifted.
      gesture.current = pointers.current.size === 0 ? { kind: 'none' } : { kind: 'pan', id: -1, lastX: 0, lastY: 0 };
    }
    if (pointers.current.size === 0) gesture.current = { kind: 'none' };
  };

  const onPointerLeave = () => {
    if (gesture.current.kind === 'none') latest.current.tool?.hover?.(null);
  };

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{ cursor: props.cursor }}
      role="application"
      aria-roledescription="image canvas"
      aria-label={props.label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      data-testid="canvas-area"
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-hidden="true"
        data-testid="preview-canvas"
        data-image-width={meta.width}
        data-image-height={meta.height}
        data-view-scale={view.scale}
        data-view-tx={view.tx}
        data-view-ty={view.ty}
        data-showing={showOriginal ? 'original' : 'result'}
        data-busy={props.busy ? 'true' : 'false'}
        data-detail={detail && !showOriginal ? `${detail.x},${detail.y},${detail.w},${detail.h}` : ''}
      />
      {props.children}
    </div>
  );
}
