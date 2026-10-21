/** Largest working image on desktop browsers. 50 MP sources load at full resolution. */
export const DESKTOP_MAX_PIXELS = 100_000_000;
/** iOS Safari refuses canvases larger than 4096×4096 (16.7 MP). */
export const IOS_MAX_PIXELS = 16_777_216;
/** Preview raster used for live editing; full resolution is rendered on demand and on export. */
export const PREVIEW_MAX_PIXELS = 8_000_000;
export const PREVIEW_MAX_SIDE = 4096;

/** Scales width×height down (never up) so it has at most `maxPixels` and a side of at most `maxSide`. */
export function fitWithin(
  width: number,
  height: number,
  maxPixels: number,
  maxSide = Infinity,
): { width: number; height: number; scale: number } {
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)), maxSide / Math.max(width, height));
  if (scale >= 1) return { width, height, scale: 1 };
  // Floor so the result never exceeds the limit, then recompute the exact scale used.
  const w = Math.max(1, Math.floor(width * scale));
  const h = Math.max(1, Math.floor(height * scale));
  return { width: w, height: h, scale: w / width };
}

export function isIOS(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

/** Pixel budget for this device. `?maxMegapixels=N` overrides it (used by tests to exercise the downscale path). */
export function maxPixelsForDevice(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>, search: string): number {
  const override = Number(new URLSearchParams(search).get('maxMegapixels'));
  if (Number.isFinite(override) && override > 0) return Math.round(override * 1_000_000);
  return isIOS(nav) ? IOS_MAX_PIXELS : DESKTOP_MAX_PIXELS;
}
