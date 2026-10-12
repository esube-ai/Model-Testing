import type { HarnessErrorCode } from "../errors";
import type { SseEvent } from "../http";
import type { ApiFormat, ChatMessage, ChatOptions, Usage } from "../types";

export interface ParsedResponse {
  text: string;
  model?: string;
  finishReason?: string;
  usage: Usage;
}

export interface StreamDelta {
  text?: string;
  model?: string;
  finishReason?: string;
  usage?: Usage;
  done?: boolean;
  error?: { code: HarnessErrorCode; detail: string };
}

/**
 * Everything format-specific lives behind this interface. Supporting a third API format
 * means writing one more object that implements it and adding it to `adapters` in index.ts.
 */
export interface ProviderAdapter {
  format: ApiFormat;
  headers(apiKey: string): Record<string, string>;
  chatBody(model: string, messages: ChatMessage[], options: ChatOptions, stream: boolean): unknown;
  /** Returns null when the JSON doesn't look like this format's chat response. */
  parseResponse(json: unknown): ParsedResponse | null;
  /** Returns null when the event isn't recognised as this format. */
  parseStreamEvent(event: SseEvent): StreamDelta | null;
  /** Returns null when the JSON doesn't look like a model list. */
  parseModels(json: unknown): string[] | null;
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function parseModelList(json: unknown): string[] | null {
  if (!isObject(json) || !Array.isArray(json.data)) return null;
  const ids = json.data.map((m) => (isObject(m) && typeof m.id === "string" ? m.id : null)).filter((id): id is string => !!id);
  return ids;
}
