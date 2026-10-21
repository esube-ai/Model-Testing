import { insertJpegExif } from '../processing/exifWriter';
import { readImageInfo, type ImageFormat } from '../processing/imageInfo';
import { fitWithin } from '../processing/limits';
import { orientationMatrix, orientedSize, type Orientation } from '../processing/orientation';

export interface Decoded {
  canvas: OffscreenCanvas;
  format: ImageFormat;
  sourceWidth: number;
  sourceHeight: number;
  downscaled: boolean;
}

let orientationProbe: Promise<boolean> | null = null;

/** Does this browser apply EXIF orientation in createImageBitmap? Decodes a 2×1 JPEG tagged "rotate 90°". */
function browserAppliesOrientation(): Promise<boolean> {
  orientationProbe ??= (async () => {
    try {
      const c = new OffscreenCanvas(2, 1);
      c.getContext('2d')?.fillRect(0, 0, 2, 1);
      const jpeg = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg' })).arrayBuffer());
      const tagged = insertJpegExif(jpeg, { orientation: 6 });
      const bmp = await createImageBitmap(new Blob([tagged], { type: 'image/jpeg' }), { imageOrientation: 'from-image' });
      const applied = bmp.width === 1 && bmp.height === 2;
      bmp.close();
      return applied;
    } catch {
      return true;
    }
  })();
  return orientationProbe;
}

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot create a 2D canvas.');
  return ctx;
}

/**
 * Decodes an image file into an upright canvas no larger than `maxPixels`. Orientation comes from
 * EXIF; if the browser does not apply it, it is applied here with an explicit transform.
 */
export async function decodeImage(file: Blob, maxPixels: number): Promise<Decoded> {
  const head = new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer());
  const info = readImageInfo(head);
  if (!info) throw new Error('Unsupported file. Please open a JPEG, PNG or WebP image.');
  const orientation: Orientation = info.format === 'jpeg' ? info.orientation : 1;

  let rawW = info.width;
  let rawH = info.height;
  if (!rawW || !rawH) {
    const probe = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const o = orientedSize(orientation, probe.width, probe.height);
    rawW = o.width; // probe was already upright here, so undo the swap
    rawH = o.height;
    probe.close();
  }
  const upright = orientedSize(orientation, rawW, rawH);
  const target = fitWithin(upright.width, upright.height, maxPixels);
  const downscaled = target.scale < 1;
  const resize = (w: number, h: number): ImageBitmapOptions =>
    downscaled ? { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' } : {};

  let bitmap: ImageBitmap;
  let manual = orientation !== 1 && !(await browserAppliesOrientation());
  if (!manual) {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', ...resize(target.width, target.height) });
    // Sanity check: a browser that ignored a 90° orientation hands back swapped dimensions.
    if (orientation >= 5 && target.width !== target.height && bitmap.width === target.height && bitmap.height === target.width) {
      manual = true;
    }
  } else {
    const raw = orientedSize(orientation, target.width, target.height);
    bitmap = await createImageBitmap(file, resize(raw.width, raw.height));
  }

  const canvas = new OffscreenCanvas(target.width, target.height);
  const ctx = context2d(canvas);
  if (manual) {
    ctx.setTransform(...orientationMatrix(orientation, bitmap.width, bitmap.height));
  }
  ctx.drawImage(bitmap, 0, 0, manual ? bitmap.width : target.width, manual ? bitmap.height : target.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  bitmap.close();
  return { canvas, format: info.format, sourceWidth: upright.width, sourceHeight: upright.height, downscaled };
}

export { context2d };
