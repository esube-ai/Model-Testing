import type { ApiFormat, Connection } from "@/lib/harness/types";
import { readJson, remove, writeJson } from "./storage";

export const CONNECTION_KEY = "model-testing.connection";

export interface SavedConnection extends Connection {
  remember: boolean;
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}

function isSaved(v: unknown): v is SavedConnection {
  const c = v as SavedConnection | null;
  return !!c && typeof c.baseUrl === "string" && typeof c.apiKey === "string" && typeof c.model === "string" && (c.format === "openai" || c.format === "anthropic");
}

/** Load the saved connection: localStorage when "Remember" was on, otherwise sessionStorage. */
export function loadConnection(): SavedConnection | null {
  const local = readJson<SavedConnection>("local", CONNECTION_KEY);
  if (isSaved(local)) return { ...local, remember: true };
  const session = readJson<SavedConnection>("session", CONNECTION_KEY);
  if (isSaved(session)) return { ...session, remember: false };
  return null;
}

/** Save to exactly one place. Returns false if storage is unavailable (connection then lives in memory only). */
export function saveConnection(c: SavedConnection): boolean {
  const value: SavedConnection = { baseUrl: c.baseUrl, apiKey: c.apiKey, format: c.format, model: c.model, remember: c.remember };
  if (c.remember) {
    remove("session", CONNECTION_KEY);
    return writeJson("local", CONNECTION_KEY, value);
  }
  remove("local", CONNECTION_KEY);
  return writeJson("session", CONNECTION_KEY, value);
}

export function clearConnection(): void {
  remove("local", CONNECTION_KEY);
  remove("session", CONNECTION_KEY);
}

/** "my-model · api.example.com" — never includes the key. */
export function connectionLabel(c: Pick<Connection, "model" | "baseUrl">): string {
  return `${c.model || "no model"} · ${hostOf(c.baseUrl)}`;
}

export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export const FORMAT_OPTIONS: { value: ApiFormat; label: string }[] = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "anthropic", label: "Anthropic" },
];
