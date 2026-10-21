import { expect, type Download, type Page } from '@playwright/test';

export interface PatternOptions {
  width: number;
  height: number;
  type?: 'image/jpeg' | 'image/png' | 'image/webp';
  quality?: number;
  /** 'quadrants': red TL, green TR, blue BL, white BR. 'noise': seeded random pixels. */
  pattern?: 'quadrants' | 'noise' | 'halves';
}

/** Encodes a test image in the browser and returns its bytes. */
export async function makeImage(page: Page, opts: PatternOptions): Promise<Uint8Array> {
  const b64 = await page.evaluate(async ({ width, height, type, quality, pattern }) => {
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext('2d')!;
    if (pattern === 'noise') {
      const img = ctx.createImageData(width, height);
      let s = 12345;
      for (let i = 0; i < img.data.length; i += 4) {
        s = (s * 1103515245 + 12345) >>> 0;
        img.data[i] = s >>> 24;
        img.data[i + 1] = (s >>> 16) & 255;
        img.data[i + 2] = (s >>> 8) & 255;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    } else if (pattern === 'halves') {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, width / 2, height);
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(width / 2, 0, width / 2, height);
    } else {
      const w = width / 2;
      const h = height / 2;
      ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#00ff00'; ctx.fillRect(w, 0, w, h);
      ctx.fillStyle = '#0000ff'; ctx.fillRect(0, h, w, h);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(w, h, w, h);
    }
    const blob = await c.convertToBlob({ type, quality });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { type: 'image/png', quality: 0.92, pattern: 'quadrants', ...opts });
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export async function openViaPicker(page: Page, bytes: Uint8Array, name: string, mimeType: string): Promise<void> {
  await page.getByTestId('file-input').setInputFiles({ name, mimeType, buffer: Buffer.from(bytes) as never });
  await expect(page.getByTestId('image-info')).toBeVisible();
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Simulates dropping a file anywhere on the window. */
export async function openViaDrop(page: Page, bytes: Uint8Array, name: string, mimeType: string): Promise<void> {
  await page.evaluate(({ b64, name, mimeType }) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([arr], name, { type: mimeType }));
    for (const type of ['dragenter', 'dragover', 'drop']) {
      document.body.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }
  }, { b64: toBase64(bytes), name, mimeType });
}

/** Simulates pasting an image from the clipboard. */
export async function openViaPaste(page: Page, bytes: Uint8Array, mimeType: string): Promise<void> {
  await page.evaluate(({ b64, mimeType }) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([arr], 'image.png', { type: mimeType }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { b64: toBase64(bytes), mimeType });
}

export async function readDownload(download: Download): Promise<Uint8Array> {
  const stream = await download.createReadStream();
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk as Uint8Array);
  return new Uint8Array(Buffer.concat(chunks));
}

/** Samples the on-screen preview canvas at a fraction of its displayed image area. */
export async function sampleCanvasAt(page: Page, fx: number, fy: number): Promise<[number, number, number]> {
  return page.evaluate(({ fx, fy }) => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const iw = Number(c.dataset.imageWidth);
    const ih = Number(c.dataset.imageHeight);
    const sx = Number(c.dataset.viewScale);
    const tx = Number(c.dataset.viewTx);
    const ty = Number(c.dataset.viewTy);
    const dpr = c.width / c.clientWidth;
    const x = Math.floor((tx + fx * iw * sx) * dpr);
    const y = Math.floor((ty + fy * ih * sx) * dpr);
    const p = c.getContext('2d')!.getImageData(x, y, 1, 1).data;
    return [p[0], p[1], p[2]] as [number, number, number];
  }, { fx, fy });
}
