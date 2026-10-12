import type { Segment } from "./types";

export const CHUNK_SIZE = 1200;
export const CHUNK_OVERLAP = 150;

/** Tidy extracted text: unify newlines, trim line ends, collapse runs of blank lines. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Break text that is too long for one chunk into sentence- or hard-sized pieces. */
function splitLong(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const pieces: string[] = [];
  let current = "";
  for (const sentence of text.split(/(?<=[.!?。])\s+/)) {
    if (sentence.length > size) {
      if (current) pieces.push(current);
      current = "";
      for (let i = 0; i < sentence.length; i += size) pieces.push(sentence.slice(i, i + size));
      continue;
    }
    if (current && current.length + 1 + sentence.length > size) {
      pieces.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** The last `overlap` characters of a chunk, starting at a word boundary. */
function tail(text: string, overlap: number): string {
  if (overlap <= 0 || text.length <= overlap) return overlap > 0 ? text : "";
  const cut = text.slice(-overlap);
  const space = cut.indexOf(" ");
  return space === -1 ? cut : cut.slice(space + 1);
}

/**
 * Split extracted text into overlapping chunks of about `size` characters, keeping
 * paragraphs together where possible. Chunks never span two pages, so page numbers stay
 * accurate for citations.
 */
export function chunkSegments(segments: Segment[], size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): Segment[] {
  const chunks: Segment[] = [];
  for (const segment of segments) {
    const text = normalizeText(segment.text);
    if (!text) continue;
    const parts = text.split(/\n\s*\n/).flatMap((p) => splitLong(p.trim(), size)).filter(Boolean);
    let current = "";
    let fresh = true; // current holds only overlap carried from the previous chunk
    const flush = () => {
      if (current && !fresh) chunks.push({ text: current, page: segment.page });
    };
    for (const part of parts) {
      if (current && current.length + 2 + part.length > size && !fresh) {
        flush();
        current = tail(current, overlap);
        fresh = true;
      }
      current = current ? `${current}\n\n${part}` : part;
      fresh = false;
    }
    flush();
  }
  return chunks;
}
