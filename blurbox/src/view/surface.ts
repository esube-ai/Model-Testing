/**
 * Main-thread copies of the preview: the untouched original (for before/after) and the processed
 * composite that the worker patches as regions change. Both are preview-sized, never full-res.
 */
export interface PreviewSurface {
  scale: number;
  original: HTMLCanvasElement;
  composite: HTMLCanvasElement;
  /** Bumped whenever `composite` changes so views know to redraw. */
  version: number;
}

export function createSurface(bitmap: ImageBitmap, scale: number): PreviewSurface {
  const make = () => {
    const c = document.createElement('canvas');
    c.width = bitmap.width;
    c.height = bitmap.height;
    c.getContext('2d')?.drawImage(bitmap, 0, 0);
    return c;
  };
  const surface = { scale, original: make(), composite: make(), version: 0 };
  bitmap.close();
  return surface;
}
