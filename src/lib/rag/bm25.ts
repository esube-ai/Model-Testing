const STOPWORDS = new Set(
  (
    "a an and are as at be but by for from has have he her his i if in into is it its me my of on or our she so " +
    "that the their them then there these they this to was we were what when where which who why will with you your " +
    "do does did can could would should about how not no yes than too very just also any all"
  ).split(" "),
);

/** Very light stemming so "costs"/"cost" and "running"/"run" match. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Lowercase words and numbers (any script), without accents or common stopwords. */
export function tokenize(text: string): string[] {
  const words = text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.filter((w) => !STOPWORDS.has(w) && (w.length > 1 || /\d/.test(w))).map(stem);
}

/** Okapi BM25 keyword ranking over a small, in-memory set of documents. */
export class Bm25 {
  private readonly tfs: Map<string, number>[];
  private readonly lengths: number[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(
    docs: string[],
    private readonly k1 = 1.2,
    private readonly b = 0.75,
  ) {
    this.tfs = docs.map((d) => {
      const tf = new Map<string, number>();
      for (const t of tokenize(d)) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return tf;
    });
    this.lengths = this.tfs.map((tf) => [...tf.values()].reduce((a, b) => a + b, 0));
    this.avgLength = this.lengths.reduce((a, b) => a + b, 0) / Math.max(1, docs.length) || 1;
  }

  /** One score per document, in input order. 0 means no query word appears. */
  scores(query: string): number[] {
    const n = this.tfs.length;
    const terms = [...new Set(tokenize(query))];
    return this.tfs.map((tf, i) => {
      let score = 0;
      for (const term of terms) {
        const f = tf.get(term);
        if (!f) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * this.lengths[i]) / this.avgLength)));
      }
      return score;
    });
  }
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
