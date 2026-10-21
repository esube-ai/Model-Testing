import { jpegSegments, sniffFormat } from './imageInfo';

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const u32le = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** JPEG: keep APP0 (JFIF) and APP14 (Adobe colour transform); drop other APPn (EXIF, XMP, ICC, IPTC…) and comments. */
function stripJpeg(b: Uint8Array): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let tail = 2;
  for (const seg of jpegSegments(b)) {
    const isApp = seg.marker >= 0xe1 && seg.marker <= 0xef && seg.marker !== 0xee;
    if (!isApp && seg.marker !== 0xfe) parts.push(b.subarray(seg.start, seg.marker === 0xda ? b.length : seg.end));
    tail = seg.marker === 0xda ? b.length : seg.end;
  }
  if (tail < b.length) parts.push(b.subarray(tail));
  return concat(parts);
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function stripPng(b: Uint8Array): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let p = 8;
  while (p + 12 <= b.length) {
    const len = u32be(b, p);
    const type = ascii(b, p + 4, 4);
    const end = p + 12 + len;
    if (!PNG_DROP.has(type)) parts.push(b.subarray(p, end));
    p = end;
    if (type === 'IEND') break;
  }
  return concat(parts);
}

function stripWebp(b: Uint8Array): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let p = 12;
  while (p + 8 <= b.length) {
    const type = ascii(b, p, 4);
    const len = u32le(b, p + 4);
    const end = Math.min(b.length, p + 8 + len + (len & 1));
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = b.slice(p, end);
      if (type === 'VP8X') chunk[8] &= ~(0x08 | 0x04); // clear the EXIF and XMP flags
      chunks.push(chunk);
    }
    p = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  const size = body.length + 4;
  header[4] = size & 0xff;
  header[5] = (size >> 8) & 0xff;
  header[6] = (size >> 16) & 0xff;
  header[7] = (size >>> 24) & 0xff;
  return concat([header, body]);
}

/**
 * Removes metadata containers from an encoded image. Canvas encoders already write none; this is a
 * second, format-level guarantee that no EXIF/GPS/XMP/text survives into an export.
 */
export function stripMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  switch (sniffFormat(bytes)) {
    case 'jpeg':
      return stripJpeg(bytes);
    case 'png':
      return stripPng(bytes);
    case 'webp':
      return stripWebp(bytes);
    default:
      throw new Error('Unknown export format');
  }
}
