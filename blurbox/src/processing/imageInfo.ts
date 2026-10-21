import { isOrientation, type Orientation } from './orientation';

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export interface ImageInfo {
  format: ImageFormat;
  /** Raw (stored) dimensions, before orientation is applied. 0 if the header did not say. */
  width: number;
  height: number;
  orientation: Orientation;
}

export const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));
const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const u24le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const u32le = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

export function sniffFormat(b: Uint8Array): ImageFormat | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && u32be(b, 0) === 0x89504e47 && u32be(b, 4) === 0x0d0a1a0a) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  return null;
}

/** Reads format, stored dimensions and EXIF orientation from the first bytes of a file. */
export function readImageInfo(b: Uint8Array): ImageInfo | null {
  const format = sniffFormat(b);
  if (!format) return null;
  if (format === 'png') {
    return { format, width: b.length >= 24 ? u32be(b, 16) : 0, height: b.length >= 24 ? u32be(b, 20) : 0, orientation: 1 };
  }
  if (format === 'webp') return { format, ...readWebpSize(b), orientation: 1 };
  return readJpegInfo(b);
}

function readWebpSize(b: Uint8Array): { width: number; height: number } {
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X' && b.length >= 30) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (chunk === 'VP8 ' && b.length >= 30) return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  if (chunk === 'VP8L' && b.length >= 25) {
    const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  return { width: 0, height: 0 };
}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** One JPEG marker segment (between SOI and SOS). `start` points at the 0xFF of the marker. */
export interface JpegSegment {
  marker: number;
  start: number;
  /** Offset of the payload (after the 2-byte length). */
  dataStart: number;
  /** Offset just past the segment. */
  end: number;
}

export function* jpegSegments(b: Uint8Array): Generator<JpegSegment> {
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return;
    const marker = b[p + 1];
    if (marker === 0xff) { p++; continue; } // fill byte
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { p += 2; continue; }
    if (marker === 0xd9) return;
    const len = u16be(b, p + 2);
    const seg = { marker, start: p, dataStart: p + 4, end: p + 2 + len };
    yield seg;
    if (marker === 0xda) return; // start of scan: entropy-coded data follows
    p = seg.end;
  }
}

function readJpegInfo(b: Uint8Array): ImageInfo {
  let width = 0;
  let height = 0;
  let orientation: Orientation = 1;
  for (const seg of jpegSegments(b)) {
    if (seg.marker === 0xe1 && seg.end <= b.length && ascii(b, seg.dataStart, 6) === 'Exif\0\0') {
      orientation = readTiffOrientation(b.subarray(seg.dataStart + 6, seg.end)) ?? orientation;
    } else if (SOF_MARKERS.has(seg.marker) && seg.dataStart + 5 <= b.length) {
      height = u16be(b, seg.dataStart + 1);
      width = u16be(b, seg.dataStart + 3);
      break;
    }
  }
  return { format: 'jpeg', width, height, orientation };
}

/** Reads the Orientation tag (0x0112) from IFD0 of a TIFF/EXIF block. */
export function readTiffOrientation(t: Uint8Array): Orientation | null {
  if (t.length < 8) return null;
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return null;
  const r16 = (at: number) => (le ? t[at] | (t[at + 1] << 8) : (t[at] << 8) | t[at + 1]);
  const r32 = (at: number) =>
    (le ? t[at] | (t[at + 1] << 8) | (t[at + 2] << 16) | (t[at + 3] << 24) : (t[at] << 24) | (t[at + 1] << 16) | (t[at + 2] << 8) | t[at + 3]) >>> 0;
  if (r16(2) !== 42) return null;
  const ifd = r32(4);
  if (ifd + 2 > t.length) return null;
  const count = r16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > t.length) return null;
    if (r16(e) === 0x0112) {
      const v = r16(e + 8);
      return isOrientation(v) ? v : null;
    }
  }
  return null;
}

/**
 * Lists metadata containers found in an encoded image: EXIF, XMP, IPTC, text chunks, embedded
 * thumbnails. Used by tests to prove that exports carry none of them.
 */
export function findMetadata(b: Uint8Array): string[] {
  const found: string[] = [];
  const format = sniffFormat(b);
  if (format === 'jpeg') {
    for (const seg of jpegSegments(b)) {
      if (seg.marker === 0xe1) {
        const head = ascii(b, seg.dataStart, 29);
        found.push(head.startsWith('Exif') ? 'jpeg:exif' : head.startsWith('http://ns.adobe.com/xap') ? 'jpeg:xmp' : 'jpeg:app1');
      } else if (seg.marker === 0xed) found.push('jpeg:iptc');
      else if (seg.marker === 0xfe) found.push('jpeg:comment');
      else if (seg.marker >= 0xe3 && seg.marker <= 0xef) found.push(`jpeg:app${seg.marker - 0xe0}`);
    }
  } else if (format === 'png') {
    let p = 8;
    while (p + 8 <= b.length) {
      const len = u32be(b, p);
      const type = ascii(b, p + 4, 4);
      if (['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'].includes(type)) found.push(`png:${type}`);
      if (type === 'IEND') break;
      p += 12 + len;
    }
  } else if (format === 'webp') {
    let p = 12;
    while (p + 8 <= b.length) {
      const type = ascii(b, p, 4);
      const len = u32le(b, p + 4);
      if (type === 'EXIF' || type === 'XMP ') found.push(`webp:${type.trim()}`);
      p += 8 + len + (len & 1);
    }
  }
  // Belt and braces: a raw EXIF header anywhere in the file (e.g. an embedded thumbnail).
  for (let i = 0; i + 6 <= b.length; i++) {
    if (b[i] === 0x45 && b[i + 1] === 0x78 && b[i + 2] === 0x69 && b[i + 3] === 0x66 && b[i + 4] === 0 && b[i + 5] === 0) {
      if (!found.some((f) => f.endsWith('exif') || f.endsWith('EXIF') || f.endsWith('eXIf'))) found.push('raw:exif');
      break;
    }
  }
  return found;
}
