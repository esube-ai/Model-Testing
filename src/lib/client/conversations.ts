import type { ChatMetadata, ConnectionField, HarnessErrorCode } from "@/lib/harness";
import { readJson, writeJson } from "./storage";

export const CONVERSATIONS_KEY = "model-testing.conversations";

export interface ChatSettings {
  systemPrompt: string;
  temperature: number | null;
  maxTokens: number | null;
}

export const DEFAULT_SETTINGS: ChatSettings = { systemPrompt: "", temperature: null, maxTokens: null };

export interface MessageError {
  code: HarnessErrorCode;
  message: string;
  detail?: string;
  field?: ConnectionField;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Assistant only. */
  feedback?: "up" | "down" | null;
  model?: string;
  host?: string;
  metadata?: ChatMetadata;
  /** Assistant only: the model's reasoning ("thinking"), when it returns any. */
  reasoning?: string;
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
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

export function newConversation(settings: ChatSettings = DEFAULT_SETTINGS): Conversation {
  const now = new Date().toISOString();
  return { id: newId(), title: "New chat", createdAt: now, updatedAt: now, settings: { ...settings }, messages: [] };
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
