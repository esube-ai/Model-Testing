import { useEffect, useRef, useState } from 'react';
import type { ImageMeta, Region } from '../model/types';
import type { WorkerClient } from '../worker/client';
import type { DetailTile } from './CanvasView';
import type { PreviewSurface } from './surface';
import type { Size, View } from './viewTransform';

interface Tile extends DetailTile {
  regions: Region[];
}

/** Zoomed in further than this (device pixels per preview pixel), the preview looks soft. */
const DETAIL_THRESHOLD = 1.25;
const DEBOUNCE_MS = 120;

export function needsDetail(view: View, surface: PreviewSurface, dpr: number): boolean {
  return surface.scale < 1 && (view.scale * dpr) / surface.scale > DETAIL_THRESHOLD;
}

/**
 * When zoomed past the preview's resolution, asks the worker for a full-resolution render of just
 * the visible area so what you see at 100% and beyond is the real result.
 */
export function useDetailTile(
  client: WorkerClient,
  meta: ImageMeta | null,
  surface: PreviewSurface | null,
  view: View,
  viewport: Size,
  regions: Region[],
): DetailTile | null {
  const [tile, setTile] = useState<Tile | null>(null);
  const requestSeq = useRef(0);
  const shown = useRef<Tile | null>(null);
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const wanted = !!meta && !!surface && viewport.width > 0 && needsDetail(view, surface, dpr);

  useEffect(() => {
    if (!wanted || !meta) return;
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      const x0 = Math.max(0, Math.floor(-view.tx / view.scale));
      const y0 = Math.max(0, Math.floor(-view.ty / view.scale));
      const x1 = Math.min(meta.width, Math.ceil((viewport.width - view.tx) / view.scale));
      const y1 = Math.min(meta.height, Math.ceil((viewport.height - view.ty) / view.scale));
      if (x1 <= x0 || y1 <= y0) return;
      const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      client
        .request({ type: 'detail', regions, rect, outScale: view.scale * dpr })
        .then((res) => {
          if (seq !== requestSeq.current) {
            res.bitmap.close();
            return;
          }
          // Release the bitmap this one replaces (not in an effect cleanup, which StrictMode replays).
          shown.current?.bitmap.close();
          shown.current = { ...res.rect, bitmap: res.bitmap, regions };
          setTile(shown.current);
        })
        .catch(() => {
          // The preview is still shown; a failed detail render is not fatal.
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [wanted, client, meta, view, viewport, regions, dpr]);


  // A tile is only valid for the exact regions it was rendered with.
  return wanted && tile && tile.regions === regions ? tile : null;
}
