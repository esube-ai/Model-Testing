/// <reference lib="webworker" />
import { blitRaster, hasTransparency, type Raster } from '../processing/raster';
import { fitWithin, PREVIEW_MAX_SIDE } from '../processing/limits';
import { changedArea, renderArea, renderVisible, scaleRegion } from '../processing/composite';
import type { ImageMeta, Region } from '../model/types';
import { context2d, decodeImage } from './decode';
import type { WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

interface Loaded {
  meta: ImageMeta;
  /** Full-resolution upright pixels. Never leaves the worker except as an encoded export. */
  original: Raster;
  previewScale: number;
  previewOriginal: Raster;
  /** previewOriginal with the last rendered regions applied. */
  previewComposite: Raster;
  /** Regions (in preview coordinates) that previewComposite currently reflects. */
  previewRegions: Region[];
}

let image: Loaded | null = null;

function post(msg: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'image';
}

async function load(req: Extract<WorkerRequest, { type: 'load' }>): Promise<void> {
  image = null;
  const decoded = await decodeImage(req.file, req.maxPixels);
  const { width, height } = decoded.canvas;
  const original = context2d(decoded.canvas).getImageData(0, 0, width, height);

  const p = fitWithin(width, height, req.previewMaxPixels, PREVIEW_MAX_SIDE);
  const previewCanvas = new OffscreenCanvas(p.width, p.height);
  const pctx = context2d(previewCanvas);
  pctx.imageSmoothingQuality = 'high';
  pctx.drawImage(decoded.canvas, 0, 0, p.width, p.height);
  const previewOriginal = pctx.getImageData(0, 0, p.width, p.height);
  // Release the decode canvas's backing store; the pixels now live in `original`.
  decoded.canvas.width = 1;
  decoded.canvas.height = 1;

  const meta: ImageMeta = {
    name: baseName(req.name),
    width,
    height,
    sourceWidth: decoded.sourceWidth,
    sourceHeight: decoded.sourceHeight,
    downscaled: decoded.downscaled,
    format: decoded.format,
    hasAlpha: hasTransparency(original),
  };
  image = {
    meta,
    original,
    previewScale: p.scale,
    previewOriginal,
    previewComposite: { width: p.width, height: p.height, data: new Uint8ClampedArray(previewOriginal.data) },
    previewRegions: [],
  };
  const preview = previewCanvas.transferToImageBitmap();
  post({ type: 'loaded', id: req.id, meta, previewScale: p.scale, preview }, [preview]);
}

function requireImage(): Loaded {
  if (!image) throw new Error('No image is open.');
  return image;
}

function toBitmap(r: Raster): Promise<ImageBitmap> {
  return createImageBitmap(new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, r.width, r.height));
}

/** Re-renders only the part of the preview affected by what changed since the last render. */
async function render(req: Extract<WorkerRequest, { type: 'render' }>): Promise<void> {
  const img = requireImage();
  const next = req.regions.map((r) => scaleRegion(r, img.previewScale));
  const dirty = changedArea(img.previewRegions, next, img.previewOriginal.width, img.previewOriginal.height);
  img.previewRegions = next;
  if (dirty.w <= 0 || dirty.h <= 0) {
    post({ type: 'patch', id: req.id, x: 0, y: 0, bitmap: null });
    return;
  }
  const { rect, raster } = renderArea(img.previewOriginal, next, dirty);
  blitRaster(img.previewComposite, raster, rect.x, rect.y);
  const bitmap = await toBitmap(raster);
  post({ type: 'patch', id: req.id, x: rect.x, y: rect.y, bitmap }, [bitmap]);
}

/** Full-resolution render of a visible area, for when the view is zoomed past the preview's resolution. */
async function detail(req: Extract<WorkerRequest, { type: 'detail' }>): Promise<void> {
  const img = requireImage();
  const { rect, raster } = renderVisible(img.original, req.regions, req.rect);
  if (rect.w <= 0 || rect.h <= 0) throw new Error('Empty detail area');
  let bitmap = await toBitmap(raster);
  const s = Math.min(1, req.outScale);
  if (s < 1) {
    const full = bitmap;
    bitmap = await createImageBitmap(full, {
      resizeWidth: Math.max(1, Math.round(rect.w * s)),
      resizeHeight: Math.max(1, Math.round(rect.h * s)),
      resizeQuality: 'high',
    });
    full.close();
  }
  post({ type: 'detail', id: req.id, rect, bitmap }, [bitmap]);
}

async function handle(req: WorkerRequest): Promise<void> {
  switch (req.type) {
    case 'load':
      return load(req);
    case 'render':
      return render(req);
    case 'detail':
      return detail(req);
    case 'export':
      throw new Error('Export is not available yet.');
  }
}

// Requests run strictly one after another so a render never sees a half-loaded image.
let queue: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  queue = queue.then(() =>
    handle(req).catch((err: unknown) => {
      post({ type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) });
    }),
  );
};
