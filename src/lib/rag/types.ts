/** A file attached to a conversation. Its text lives in chunks, stored in the browser. */
export interface RagDoc {
  id: string;
  conversationId: string;
  name: string;
  size: number;
  type: string;
  createdAt: string;
  chunkCount: number;
  charCount: number;
}

export interface RagChunk {
  id: string;
  docId: string;
  conversationId: string;
  /** Position of the chunk within its document. */
  index: number;
  text: string;
  /** PDF page the chunk came from, when known. */
  page?: number;
  /** Embedding vectors, keyed by "<host>|<embedding model>". */
  vectors?: Record<string, number[]>;
}

/** A piece of extracted text, optionally tied to a PDF page. */
export interface Segment {
  text: string;
  page?: number;
}

/** A cited excerpt shown under an answer and included in exports. */
export interface Source {
  n: number;
  docName: string;
  page?: number;
  excerpt: string;
}
