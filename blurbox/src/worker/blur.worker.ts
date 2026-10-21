/// <reference lib="webworker" />
import { hasTransparency, type Raster } from '../processing/raster';
import { fitWithin, PREVIEW_MAX_PIXELS, PREVIEW_MAX_SIDE } from '../processing/limits';
import { MIME_BY_FORMAT } from '../processing/imageInfo';
import type { ImageMeta } from '../model/types';
import { context2d, decodeImage } from './decode';
import type { WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

interface Loaded {
  meta: ImageMeta;
  /** Full-resolution upright pixels. Never leaves the worker except as an encoded export. */
  original: Raster;
  previewScale: number;
  previewOriginal: Raster;
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
  image = { meta, original, previewScale: p.scale, previewOriginal };
  const preview = previewCanvas.transferToImageBitmap();
  post({ type: 'loaded', id: req.id, meta, previewScale: p.scale, preview }, [preview]);
}

async function handle(req: WorkerRequest): Promise<void> {
  switch (req.type) {
    case 'load':
      return load(req);
    default:
      throw new Error(`Not implemented: ${req.type} (${MIME_BY_FORMAT.png}, ${PREVIEW_MAX_PIXELS}, ${image ? 1 : 0})`);
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
