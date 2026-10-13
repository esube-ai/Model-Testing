import type { Connection } from "@/lib/harness/types";
import { ApiError, embedApi } from "@/lib/client/api";
import { hostOf } from "@/lib/client/connections";
import { newId } from "@/lib/client/conversations";
import { chunkSegments } from "./chunk";
import { extractSegments, FileError } from "./extract";
import { buildRagMessage } from "./prompt";
import { CONTEXT_BUDGET_CHARS, selectChunks } from "./select";
import { fileStore } from "./store";
import type { RagChunk, RagDoc, Source } from "./types";

export { ACCEPT, FileError } from "./extract";
export { fileStore } from "./store";
export type { RagDoc, Source } from "./types";

export const MAX_FILES_PER_CHAT = 20;
export const MAX_CHARS_PER_CHAT = 2_000_000;
/** Chunks sent per embeddings request to this app's server. */
const EMBED_REQUEST_SIZE = 128;
const MAX_EMBED_INPUT = 8000;

/** Read, split and store a file for a conversation. Throws FileError with a friendly message. */
export async function attachFile(conversationId: string, file: File, existing: RagDoc[]): Promise<RagDoc> {
  if (existing.length >= MAX_FILES_PER_CHAT) {
    throw new FileError(`A chat can have up to ${MAX_FILES_PER_CHAT} files. Remove one or start a new chat.`);
  }
  const segments = await extractSegments(file);
  const pieces = chunkSegments(segments);
  const charCount = pieces.reduce((n, p) => n + p.text.length, 0);
  const used = existing.reduce((n, d) => n + d.charCount, 0);
  if (used + charCount > MAX_CHARS_PER_CHAT) {
    throw new FileError(`“${file.name}” would put more text in this chat than the app can handle. Start a new chat for it.`);
  }
  const doc: RagDoc = {
    id: newId(),
    conversationId,
    name: file.name,
    size: file.size,
    type: file.type,
    createdAt: new Date().toISOString(),
    chunkCount: pieces.length,
    charCount,
  };
  const chunks: RagChunk[] = pieces.map((p, index) => ({
    id: `${doc.id}:${index}`,
    docId: doc.id,
    conversationId,
    index,
    text: p.text,
    ...(p.page ? { page: p.page } : {}),
  }));
  await fileStore.addDoc(doc, chunks);
  return doc;
}

export interface RetrievalResult {
  /** The message to send to the model in place of the user's question. */
  content: string;
  sources: Source[];
  /** Shown to the tester when semantic search was requested but couldn't be used. */
  notice?: string;
}

interface RetrieveOptions {
  connection: Connection;
  /** Embedding model for semantic search; blank for keyword search only. */
  embeddingModel?: string;
  signal?: AbortSignal;
  onStatus?: (status: string) => void;
}

/**
 * Find the parts of the files in `scopes` (a chat and, if it's in one, its project) that
 * are relevant to `question` and build the message to send. Returns null when there are
 * no files.
 */
export async function retrieveContext(scopes: string[], question: string, options: RetrieveOptions): Promise<RetrievalResult | null> {
  const docs = (await Promise.all(scopes.map((s) => fileStore.listDocs(s)))).flat();
  if (docs.length === 0) return null;
  const chunks = (await Promise.all(scopes.map((s) => fileStore.listChunks(s)))).flat();
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  const embeddingModel = options.embeddingModel?.trim();
  let notice: string | undefined;
  let queryVector: number[] | undefined;
  let vectorKey: string | undefined;

  if (embeddingModel && total > CONTEXT_BUDGET_CHARS) {
    if (options.connection.format !== "openai") {
      notice = "Semantic search needs an OpenAI-compatible provider, so keyword search was used.";
    } else {
      vectorKey = `${hostOf(options.connection.baseUrl)}|${embeddingModel}`;
      try {
        const missing = chunks.filter((c) => !c.vectors?.[vectorKey!]);
        if (missing.length) options.onStatus?.("Preparing your files for semantic search…");
        for (let i = 0; i < missing.length; i += EMBED_REQUEST_SIZE) {
          const batch = missing.slice(i, i + EMBED_REQUEST_SIZE);
          const vectors = await embedApi(options.connection, embeddingModel, batch.map((c) => c.text.slice(0, MAX_EMBED_INPUT)), options.signal);
          batch.forEach((c, j) => (c.vectors = { ...c.vectors, [vectorKey!]: vectors[j] }));
          await fileStore.saveChunks(batch);
        }
        [queryVector] = await embedApi(options.connection, embeddingModel, [question.slice(0, MAX_EMBED_INPUT)], options.signal);
      } catch (e) {
        if (options.signal?.aborted) throw e;
        queryVector = undefined;
        const reason = e instanceof ApiError ? e.error.message : "it failed";
        notice = `Semantic search didn't work (${reason}), so keyword search was used. Check the embedding model in Chat settings.`;
      }
    }
  }

  options.onStatus?.("Searching your files…");
  const selection = selectChunks(chunks, question, { queryVector, vectorKey });
  return { ...buildRagMessage(question, selection, docs), notice };
}
