/// <reference lib="webworker" />
import { blitRaster, hasTransparency, type Raster } from '../processing/raster';
import { fitWithin, PREVIEW_MAX_SIDE } from '../processing/limits';
import { changedArea, renderArea, renderFull, renderVisible, scaleRegion } from '../processing/composite';
import { stripMetadata } from '../processing/stripMetadata';
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

const EXPORT_MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;

/**
 * Flattens every region into a fresh copy of the full-resolution pixels and re-encodes it. Only
 * these processed pixels are encoded: no layers, masks or original image, and no source metadata.
 */
async function exportImage(req: Extract<WorkerRequest, { type: 'export' }>): Promise<void> {
  const img = requireImage();
  const { width, height } = img.original;
  let flat: Raster | null = renderFull(img.original, req.regions);
  let canvas = new OffscreenCanvas(width, height);
  context2d(canvas).putImageData(new ImageData(flat.data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  flat = null;
  if (req.format === 'jpeg' && img.meta.hasAlpha) {
    // JPEG has no alpha; the encoder would turn transparency black. Put it on white instead.
    const opaque = new OffscreenCanvas(width, height);
    const ctx = context2d(opaque);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(canvas, 0, 0);
    canvas.width = canvas.height = 1;
    canvas = opaque;
  }
  const quality = req.format === 'png' ? undefined : Math.min(1, Math.max(0.01, req.quality));
  const encoded = await canvas.convertToBlob({ type: EXPORT_MIME[req.format], quality });
  canvas.width = canvas.height = 1;
  if (encoded.type !== EXPORT_MIME[req.format]) {
    throw new Error(`This browser cannot encode ${req.format.toUpperCase()} images. Please choose another format.`);
  }
  const clean = stripMetadata(new Uint8Array(await encoded.arrayBuffer()));
  const blob = new Blob([clean], { type: EXPORT_MIME[req.format] });
  post({ type: 'exported', id: req.id, blob, width, height });
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
      return exportImage(req);
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
