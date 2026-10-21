import type { IntRect } from '../processing/raster';
import type { ExportFormat, ImageMeta, Region } from '../model/types';

export type WorkerRequest =
  | { type: 'load'; id: number; file: Blob; name: string; maxPixels: number; previewMaxPixels: number }
  | { type: 'render'; id: number; regions: Region[] }
  | { type: 'detail'; id: number; regions: Region[]; rect: IntRect; outScale: number }
  | { type: 'export'; id: number; regions: Region[]; format: ExportFormat; quality: number };

export type WorkerResponse =
  | { type: 'loaded'; id: number; meta: ImageMeta; previewScale: number; preview: ImageBitmap }
  | { type: 'patch'; id: number; x: number; y: number; bitmap: ImageBitmap | null }
  | { type: 'detail'; id: number; rect: IntRect; bitmap: ImageBitmap }
  | { type: 'exported'; id: number; blob: Blob; width: number; height: number }
  | { type: 'error'; id: number; message: string };
