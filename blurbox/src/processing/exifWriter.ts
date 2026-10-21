import { jpegSegments } from './imageInfo';

export interface ExifFields {
  orientation?: number;
  make?: string;
  model?: string;
  /** Decimal degrees; written as a GPS IFD. */
  gps?: { latitude: number; longitude: number };
}

type Entry = { tag: number; type: number; count: number; value: Uint8Array };

const SHORT = 3;
const LONG = 4;
const ASCII = 2;
const RATIONAL = 5;

function short(v: number): Uint8Array {
  return new Uint8Array([v >> 8, v & 0xff]);
}
function long(v: number): Uint8Array {
  return new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
}
function asciiz(s: string): Uint8Array {
  return new Uint8Array([...s].map((c) => c.charCodeAt(0) & 0x7f).concat(0));
}
function rationals(values: [number, number][]): Uint8Array {
  const out = new Uint8Array(values.length * 8);
  values.forEach(([n, d], i) => {
    out.set(long(n), i * 8);
    out.set(long(d), i * 8 + 4);
  });
  return out;
}
function dms(deg: number): [number, number][] {
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = Math.round(((a - d) * 60 - m) * 60 * 100);
  return [[d, 1], [m, 1], [s, 100]];
}

/** Serialises IFD entries (big-endian) starting at `offset` within the TIFF block. */
function writeIfd(entries: Entry[], offset: number, nextIfd = 0): Uint8Array {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  const headLen = 2 + sorted.length * 12 + 4;
  let extra = 0;
  for (const e of sorted) if (e.value.length > 4) extra += e.value.length + (e.value.length & 1);
  const out = new Uint8Array(headLen + extra);
  out.set(short(sorted.length), 0);
  let dataAt = offset + headLen;
  sorted.forEach((e, i) => {
    const p = 2 + i * 12;
    out.set(short(e.tag), p);
    out.set(short(e.type), p + 2);
    out.set(long(e.count), p + 4);
    if (e.value.length <= 4) out.set(e.value, p + 8);
    else {
      out.set(long(dataAt), p + 8);
      out.set(e.value, dataAt - offset);
      dataAt += e.value.length + (e.value.length & 1);
    }
  });
  out.set(long(nextIfd), headLen - 4);
  return out;
}

/** Builds a big-endian TIFF block holding the given EXIF fields. */
export function buildExifTiff(fields: ExifFields): Uint8Array {
  const ifd0: Entry[] = [];
  if (fields.orientation) ifd0.push({ tag: 0x0112, type: SHORT, count: 1, value: short(fields.orientation) });
  if (fields.make) ifd0.push({ tag: 0x010f, type: ASCII, count: fields.make.length + 1, value: asciiz(fields.make) });
  if (fields.model) ifd0.push({ tag: 0x0110, type: ASCII, count: fields.model.length + 1, value: asciiz(fields.model) });
  let gpsBlock: Uint8Array = new Uint8Array(0);
  if (fields.gps) ifd0.push({ tag: 0x8825, type: LONG, count: 1, value: long(0) }); // patched below
  const header = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8]);
  let ifd0Bytes = writeIfd(ifd0, 8);
  if (fields.gps) {
    const gpsOffset = 8 + ifd0Bytes.length;
    const g = fields.gps;
    gpsBlock = writeIfd(
      [
        { tag: 0x0000, type: 1, count: 4, value: new Uint8Array([2, 3, 0, 0]) },
        { tag: 0x0001, type: ASCII, count: 2, value: asciiz(g.latitude >= 0 ? 'N' : 'S').slice(0, 2) },
        { tag: 0x0002, type: RATIONAL, count: 3, value: rationals(dms(g.latitude)) },
        { tag: 0x0003, type: ASCII, count: 2, value: asciiz(g.longitude >= 0 ? 'E' : 'W').slice(0, 2) },
        { tag: 0x0004, type: RATIONAL, count: 3, value: rationals(dms(g.longitude)) },
      ],
      gpsOffset,
    );
    const idx = ifd0.findIndex((e) => e.tag === 0x8825);
    ifd0[idx] = { ...ifd0[idx], value: long(gpsOffset) };
    ifd0Bytes = writeIfd(ifd0, 8);
  }
  const out = new Uint8Array(header.length + ifd0Bytes.length + gpsBlock.length);
  out.set(header, 0);
  out.set(ifd0Bytes, header.length);
  out.set(gpsBlock, header.length + ifd0Bytes.length);
  return out;
}

/** Inserts an APP1 "Exif" segment right after SOI (and after APP0/JFIF if present). */
export function insertJpegExif(jpeg: Uint8Array, fields: ExifFields): Uint8Array<ArrayBuffer> {
  const tiff = buildExifTiff(fields);
  const payloadLen = 6 + tiff.length;
  const app1 = new Uint8Array(4 + payloadLen);
  app1.set([0xff, 0xe1, ((payloadLen + 2) >> 8) & 0xff, (payloadLen + 2) & 0xff], 0);
  app1.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
  app1.set(tiff, 10);
  let at = 2;
  for (const seg of jpegSegments(jpeg)) {
    if (seg.marker === 0xe0) at = seg.end;
    break;
  }
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, at), 0);
  out.set(app1, at);
  out.set(jpeg.subarray(at), at + app1.length);
  return out;
}
