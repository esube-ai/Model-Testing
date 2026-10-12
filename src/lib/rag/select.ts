import { Bm25, cosine } from "./bm25";
import type { RagChunk } from "./types";

/** Characters of file text added to one message (roughly 3,000 tokens). */
export const CONTEXT_BUDGET_CHARS = 12_000;
export const TOP_K = 8;
/** Reciprocal Rank Fusion constant: how strongly the top ranks dominate. */
const RRF_K = 60;

export interface Selection {
  /** "all": everything fit, so every chunk is included. "search": the best matches. */
  mode: "all" | "search";
  chunks: RagChunk[];
}

export interface SelectOptions {
  budgetChars?: number;
  topK?: number;
  /** Embedding of the question; chunks need `vectors[vectorKey]` to take part. */
  queryVector?: number[];
  vectorKey?: string;
}

/**
 * Pick which chunks to send with a question. Small attachments are sent whole, so
 * questions like "summarize this file" work. Otherwise chunks are ranked by BM25 keyword
 * score and, when embeddings are available, by cosine similarity; the two rankings are
 * merged with Reciprocal Rank Fusion. If nothing matches at all, the beginning of each file
 * is used.
 */
export function selectChunks(chunks: RagChunk[], question: string, options: SelectOptions = {}): Selection {
  const budget = options.budgetChars ?? CONTEXT_BUDGET_CHARS;
  const topK = options.topK ?? TOP_K;
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  if (total <= budget) return { mode: "all", chunks };

  const fused = new Map<number, number>();
  const addRanking = (scores: number[]) => {
    scores
      .map((score, i) => ({ score, i }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .forEach(({ i }, rank) => fused.set(i, (fused.get(i) ?? 0) + 1 / (RRF_K + rank + 1)));
  };
  addRanking(new Bm25(chunks.map((c) => c.text)).scores(question));
  const { queryVector, vectorKey } = options;
  if (queryVector && vectorKey) {
    addRanking(chunks.map((c) => (c.vectors?.[vectorKey] ? Math.max(0, cosine(queryVector, c.vectors[vectorKey])) : 0)));
  }

  let order = [...fused.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => i);
  if (order.length === 0) {
    // No match: fall back to the start of each document.
    order = chunks.map((c, i) => ({ c, i })).sort((a, b) => a.c.index - b.c.index).map(({ i }) => i);
  }

  const picked: RagChunk[] = [];
  let used = 0;
  for (const i of order) {
    if (picked.length >= topK) break;
    const chunk = chunks[i];
    if (used + chunk.text.length > budget && picked.length > 0) continue;
    picked.push(chunk);
    used += chunk.text.length;
  }
  return { mode: "search", chunks: picked };
}
