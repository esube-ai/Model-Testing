/** Maps image pixels to CSS pixels in the viewport: screen = image × scale + (tx, ty). */
export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.01;
export const MAX_SCALE = 32;
const FIT_PADDING = 16;
/** At least this many CSS pixels of the image stay on screen while panning. */
const KEEP_VISIBLE = 48;

export function fitView(viewport: Size, image: Size): View {
  const availW = Math.max(1, viewport.width - FIT_PADDING * 2);
  const availH = Math.max(1, viewport.height - FIT_PADDING * 2);
  const scale = clampScale(Math.min(availW / image.width, availH / image.height));
  return {
    scale,
    tx: (viewport.width - image.width * scale) / 2,
    ty: (viewport.height - image.height * scale) / 2,
  };
}

/** 100%: one image pixel per CSS pixel, centred on the viewport centre's image point. */
export function actualSizeView(view: View, viewport: Size, image: Size): View {
  return zoomTo(view, 1, viewport.width / 2, viewport.height / 2, viewport, image);
}

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Zooms to `scale` keeping the image point under screen point (px, py) fixed. */
export function zoomTo(view: View, scale: number, px: number, py: number, viewport: Size, image: Size): View {
  const s = clampScale(scale);
  const ix = (px - view.tx) / view.scale;
  const iy = (py - view.ty) / view.scale;
  return clampPan({ scale: s, tx: px - ix * s, ty: py - iy * s }, viewport, image);
}

export function zoomBy(view: View, factor: number, px: number, py: number, viewport: Size, image: Size): View {
  return zoomTo(view, view.scale * factor, px, py, viewport, image);
}

export function panBy(view: View, dx: number, dy: number, viewport: Size, image: Size): View {
  return clampPan({ ...view, tx: view.tx + dx, ty: view.ty + dy }, viewport, image);
}

/** Keeps part of the image on screen so it can't be lost by panning. */
export function clampPan(view: View, viewport: Size, image: Size): View {
  const w = image.width * view.scale;
  const h = image.height * view.scale;
  const keepX = Math.min(KEEP_VISIBLE, w);
  const keepY = Math.min(KEEP_VISIBLE, h);
  return {
    scale: view.scale,
    tx: Math.min(viewport.width - keepX, Math.max(keepX - w, view.tx)),
    ty: Math.min(viewport.height - keepY, Math.max(keepY - h, view.ty)),
  };
}

export function screenToImage(view: View, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - view.tx) / view.scale, y: (sy - view.ty) / view.scale };
}

export function imageToScreen(view: View, ix: number, iy: number): { x: number; y: number } {
  return { x: ix * view.scale + view.tx, y: iy * view.scale + view.ty };
}

/** Preset zoom steps used by the +/- buttons and keys. */
const STEPS = [0.01, 0.02, 0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];

export function nextZoomStep(scale: number, direction: 1 | -1): number {
  if (direction > 0) return STEPS.find((s) => s > scale * 1.001) ?? MAX_SCALE;
  return [...STEPS].reverse().find((s) => s < scale / 1.001) ?? MIN_SCALE;
}
