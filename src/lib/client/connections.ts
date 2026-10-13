import type { ApiFormat, Connection } from "@/lib/harness/types";
import { newId } from "./ids";
import { readJson, remove, writeJson } from "./storage";

/**
 * Several provider connections, each with the models the tester wants in the model picker.
 * Keys stay in this browser: sessionStorage by default (gone when the tab closes), or
 * localStorage when "Remember on this device" is on. They're never stored with chats.
 */
export const CONNECTIONS_KEY = "model-testing.connections";
/** The single-connection format used before multiple connections existed. */
const LEGACY_KEY = "model-testing.connection";

export interface ProviderConnection {
  id: string;
  /** Display name, e.g. "OpenAI" or "Office vLLM". */
  name: string;
  baseUrl: string;
  apiKey: string;
  format: ApiFormat;
  /** Models offered in the picker for this connection. */
  models: string[];
}

export interface ConnectionsState {
  remember: boolean;
  connections: ProviderConnection[];
}

/** One model on one connection: what the picker selects and what replies are tagged with. */
export interface ModelRef {
  connectionId: string;
  model: string;
}

export const EMPTY_STATE: ConnectionsState = { remember: false, connections: [] };

export const FORMAT_OPTIONS: { value: ApiFormat; label: string }[] = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "anthropic", label: "Anthropic" },
];

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}

export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

function isConnection(v: unknown): v is ProviderConnection {
  const c = v as ProviderConnection | null;
  return (
    !!c &&
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    typeof c.baseUrl === "string" &&
    typeof c.apiKey === "string" &&
    (c.format === "openai" || c.format === "anthropic") &&
    Array.isArray(c.models) &&
    c.models.every((m) => typeof m === "string")
  );
}

function parseState(raw: unknown, remember: boolean): ConnectionsState | null {
  const s = raw as { connections?: unknown } | null;
  if (!s || !Array.isArray(s.connections)) return null;
  return { remember, connections: s.connections.filter(isConnection) };
}

/** Convert the old single saved connection, if any, into the new format. */
function migrateLegacy(): ConnectionsState | null {
  for (const kind of ["local", "session"] as const) {
    const old = readJson<{ baseUrl?: unknown; apiKey?: unknown; format?: unknown; model?: unknown }>(kind, LEGACY_KEY);
    if (old && typeof old.baseUrl === "string" && typeof old.apiKey === "string" && (old.format === "openai" || old.format === "anthropic")) {
      const model = typeof old.model === "string" ? old.model : "";
      const state: ConnectionsState = {
        remember: kind === "local",
        connections: [{ id: newId(), name: hostOf(old.baseUrl), baseUrl: old.baseUrl, apiKey: old.apiKey, format: old.format, models: model ? [model] : [] }],
      };
      remove(kind, LEGACY_KEY);
      saveConnections(state);
      return state;
    }
  }
  return null;
}

export function loadConnections(): ConnectionsState {
  return (
    parseState(readJson("local", CONNECTIONS_KEY), true) ??
    parseState(readJson("session", CONNECTIONS_KEY), false) ??
    migrateLegacy() ??
    EMPTY_STATE
  );
}

/** Save to exactly one storage area. Returns false if storage is unavailable. */
export function saveConnections(state: ConnectionsState): boolean {
  const value = { connections: state.connections };
  if (state.remember) {
    remove("session", CONNECTIONS_KEY);
    return writeJson("local", CONNECTIONS_KEY, value);
  }
  remove("local", CONNECTIONS_KEY);
  return writeJson("session", CONNECTIONS_KEY, value);
}

/** Remove every saved connection and key from this browser. */
export function clearConnections(): void {
  for (const kind of ["local", "session"] as const) {
    remove(kind, CONNECTIONS_KEY);
    remove(kind, LEGACY_KEY);
  }
}

export const refKey = (ref: ModelRef) => `${ref.connectionId}::${ref.model}`;
export const sameRef = (a?: ModelRef, b?: ModelRef) => !!a && !!b && a.connectionId === b.connectionId && a.model === b.model;

/** Every model on every connection, in picker order. */
export function allModels(state: ConnectionsState): ModelRef[] {
  return state.connections.flatMap((c) => c.models.map((model) => ({ connectionId: c.id, model })));
}

/** The harness connection for a model, or null if its connection was removed. */
export function resolveRef(state: ConnectionsState, ref: ModelRef): { connection: Connection; source: ProviderConnection } | null {
  const source = state.connections.find((c) => c.id === ref.connectionId);
  if (!source) return null;
  return { connection: { baseUrl: source.baseUrl, apiKey: source.apiKey, format: source.format, model: ref.model }, source };
}

/** Keep only selections that still exist; fall back to the first available model. */
export function validRefs(state: ConnectionsState, refs: ModelRef[] | undefined): ModelRef[] {
  const available = allModels(state);
  const kept = (refs ?? []).filter((r) => available.some((a) => sameRef(a, r)));
  return kept.length ? kept : available.slice(0, 1);
}

/** "my-model · api.example.com" — never includes the key. */
export function modelLabel(state: ConnectionsState, ref: ModelRef): string {
  const source = state.connections.find((c) => c.id === ref.connectionId);
  return source ? `${ref.model} · ${source.name}` : ref.model;
}
