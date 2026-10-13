import type { ChatMetadata, ConnectionField, HarnessErrorCode, ImageMime } from "@/lib/harness";
import type { Source } from "@/lib/rag/types";
import type { ModelRef } from "./connections";
import { newId } from "./ids";
import { readJson, writeJson } from "./storage";

export { newId } from "./ids";

export const CONVERSATIONS_KEY = "model-testing.conversations";

export interface ChatSettings {
  systemPrompt: string;
  temperature: number | null;
  maxTokens: number | null;
  /** Embedding model for semantic search over attached files; blank = keyword search only. */
  embeddingModel?: string;
}

export const DEFAULT_SETTINGS: ChatSettings = { systemPrompt: "", temperature: null, maxTokens: null };

export interface MessageError {
  code: HarnessErrorCode;
  message: string;
  detail?: string;
  field?: ConnectionField;
}

/** A picture attached to a user message. The image itself is stored in IndexedDB. */
export interface ImageRef {
  id: string;
  mime: ImageMime;
  name: string;
  width: number;
  height: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** User only: pictures sent with the message. */
  images?: ImageRef[];
  /** Assistant only: the user message this replies to (several replies per turn in Compare). */
  turnId?: string;
  /** Assistant only: which connection and model wrote the reply. */
  modelRef?: ModelRef;
  /** Assistant only. */
  feedback?: "up" | "down" | null;
  /** Display name of the model and host (kept even if the connection is later removed). */
  model?: string;
  host?: string;
  metadata?: ChatMetadata;
  /** Assistant only: the model's reasoning ("thinking"), when it returns any. */
  reasoning?: string;
  /** Assistant only: file excerpts that were sent with the question, for citations. */
  sources?: Source[];
  /** Assistant only: a note about how files were searched (e.g. semantic search fell back). */
  notice?: string;
  /** Assistant only, while preparing: what's happening before the reply starts. */
  progress?: string;
  stopped?: boolean;
  error?: MessageError;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  settings: ChatSettings;
  messages: Message[];
  /** Models selected in the picker; more than one means Compare mode. */
  models?: ModelRef[];
  pinned?: boolean;
  projectId?: string;
}

export function newConversation(settings: ChatSettings = DEFAULT_SETTINGS, extra: Partial<Conversation> = {}): Conversation {
  const now = new Date().toISOString();
  return { id: newId(), title: "New chat", createdAt: now, updatedAt: now, settings: { ...settings }, messages: [], ...extra };
}

export function loadConversations(): Conversation[] {
  const list = readJson<Conversation[]>("local", CONVERSATIONS_KEY);
  return Array.isArray(list) ? list.filter((c) => c && typeof c.id === "string" && Array.isArray(c.messages)) : [];
}

/** Persist conversations (never contains credentials). Returns false if storage is unavailable. */
export function saveConversations(list: Conversation[]): boolean {
  return writeJson("local", CONVERSATIONS_KEY, list);
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 40 ? `${t.slice(0, 40)}…` : t || "New chat";
}
