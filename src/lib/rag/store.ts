import type { RagChunk, RagDoc } from "./types";

/**
 * Attached files live in this browser's IndexedDB, separate from conversations and
 * credentials. If IndexedDB is unavailable (e.g. some private modes), an in-memory store is
 * used instead, so files work until the page is reloaded.
 */
const DB_NAME = "model-testing-files";
/** v1: docs, chunks. v2: images (pictures attached to messages). */
const DB_VERSION = 2;

/** A picture attached to a message, stored as a Blob. */
export interface StoredImage {
  id: string;
  conversationId: string;
  blob: Blob;
}

interface Backend {
  docs(conversationId: string): Promise<RagDoc[]>;
  chunks(conversationId: string): Promise<RagChunk[]>;
  add(doc: RagDoc, chunks: RagChunk[]): Promise<void>;
  deleteDoc(docId: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  putChunks(chunks: RagChunk[]): Promise<void>;
  putImage(image: StoredImage): Promise<void>;
  getImage(id: string): Promise<StoredImage | undefined>;
  persistent: boolean;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function openIndexedDb(): Promise<Backend> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const d = req.result;
      if (event.oldVersion < 1) {
        d.createObjectStore("docs", { keyPath: "id" }).createIndex("conversationId", "conversationId");
        const chunks = d.createObjectStore("chunks", { keyPath: "id" });
        chunks.createIndex("conversationId", "conversationId");
        chunks.createIndex("docId", "docId");
      }
      if (event.oldVersion < 2) {
        d.createObjectStore("images", { keyPath: "id" }).createIndex("conversationId", "conversationId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });

  const byIndex = <T,>(store: string, index: string, key: string) =>
    request(db.transaction(store).objectStore(store).index(index).getAll(key) as IDBRequest<T[]>);

  /** Delete the keys an index returns for `key` from the store, inside an open transaction. */
  const deleteByIndex = async (tx: IDBTransaction, store: string, index: string, key: string) => {
    const os = tx.objectStore(store);
    const keys = await request(os.index(index).getAllKeys(key));
    keys.forEach((k) => os.delete(k));
  };

  return {
    persistent: true,
    docs: (id) => byIndex<RagDoc>("docs", "conversationId", id),
    chunks: (id) => byIndex<RagChunk>("chunks", "conversationId", id),
    async add(doc, chunks) {
      const tx = db.transaction(["docs", "chunks"], "readwrite");
      tx.objectStore("docs").put(doc);
      const os = tx.objectStore("chunks");
      chunks.forEach((c) => os.put(c));
      await done(tx);
    },
    async deleteDoc(docId) {
      const tx = db.transaction(["docs", "chunks"], "readwrite");
      tx.objectStore("docs").delete(docId);
      await deleteByIndex(tx, "chunks", "docId", docId);
      await done(tx);
    },
    async deleteConversation(id) {
      const tx = db.transaction(["docs", "chunks", "images"], "readwrite");
      await deleteByIndex(tx, "docs", "conversationId", id);
      await deleteByIndex(tx, "chunks", "conversationId", id);
      await deleteByIndex(tx, "images", "conversationId", id);
      await done(tx);
    },
    async putImage(image) {
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").put(image);
      await done(tx);
    },
    getImage: (id) => request(db.transaction("images").objectStore("images").get(id) as IDBRequest<StoredImage | undefined>),
    async putChunks(chunks) {
      const tx = db.transaction("chunks", "readwrite");
      const os = tx.objectStore("chunks");
      chunks.forEach((c) => os.put(c));
      await done(tx);
    },
  };
}

function memoryBackend(): Backend {
  const docs = new Map<string, RagDoc>();
  const chunks = new Map<string, RagChunk>();
  const images = new Map<string, StoredImage>();
  return {
    persistent: false,
    docs: async (id) => [...docs.values()].filter((d) => d.conversationId === id),
    chunks: async (id) => [...chunks.values()].filter((c) => c.conversationId === id),
    async add(doc, list) {
      docs.set(doc.id, doc);
      list.forEach((c) => chunks.set(c.id, c));
    },
    async deleteDoc(docId) {
      docs.delete(docId);
      for (const [k, c] of chunks) if (c.docId === docId) chunks.delete(k);
    },
    async deleteConversation(id) {
      for (const [k, d] of docs) if (d.conversationId === id) docs.delete(k);
      for (const [k, c] of chunks) if (c.conversationId === id) chunks.delete(k);
      for (const [k, img] of images) if (img.conversationId === id) images.delete(k);
    },
    async putImage(image) {
      images.set(image.id, image);
    },
    getImage: async (id) => images.get(id),
    async putChunks(list) {
      list.forEach((c) => chunks.set(c.id, c));
    },
  };
}

let backend: Promise<Backend> | null = null;

function getBackend(): Promise<Backend> {
  backend ??= (async () => {
    try {
      if (typeof indexedDB === "undefined") throw new Error("no IndexedDB");
      return await openIndexedDb();
    } catch {
      return memoryBackend();
    }
  })();
  return backend;
}

const byCreated = (a: RagDoc, b: RagDoc) => a.createdAt.localeCompare(b.createdAt);

export const fileStore = {
  /** False when files are only kept in memory for this page. */
  isPersistent: async () => (await getBackend()).persistent,
  listDocs: async (conversationId: string) => (await (await getBackend()).docs(conversationId)).sort(byCreated),
  listChunks: async (conversationId: string) => (await getBackend()).chunks(conversationId),
  addDoc: async (doc: RagDoc, chunks: RagChunk[]) => (await getBackend()).add(doc, chunks),
  deleteDoc: async (docId: string) => (await getBackend()).deleteDoc(docId),
  deleteConversation: async (conversationId: string) => (await getBackend()).deleteConversation(conversationId),
  saveChunks: async (chunks: RagChunk[]) => (await getBackend()).putChunks(chunks),
  putImage: async (image: StoredImage) => (await getBackend()).putImage(image),
  getImage: async (id: string) => (await getBackend()).getImage(id),
};
