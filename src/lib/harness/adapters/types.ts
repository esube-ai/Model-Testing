import type { HarnessErrorCode } from "../errors";
import type { SseEvent } from "../http";
import type { ApiFormat, ChatMessage, ChatOptions, Usage } from "../types";

export interface ParsedResponse {
  text: string;
  reasoning?: string;
  model?: string;
  finishReason?: string;
  usage: Usage;
}

export interface StreamDelta {
  text?: string;
  reasoning?: string;
  model?: string;
  finishReason?: string;
  usage?: Usage;
  done?: boolean;
  error?: { code: HarnessErrorCode; detail: string };
}

/**
 * How earlier assistant reasoning is sent back to the provider:
 *  - "when-available": with the messages that have it (default)
 *  - "always": on every assistant message, empty when none was saved
 *  - "never": not at all
 */
export type ReasoningReplay = "when-available" | "always" | "never";

/**
 * Everything format-specific lives behind this interface. Supporting a third API format
 * means writing one more object that implements it and adding it to `adapters` in index.ts.
 */
export interface ProviderAdapter {
  format: ApiFormat;
  headers(apiKey: string): Record<string, string>;
  chatBody(model: string, messages: ChatMessage[], options: ChatOptions, stream: boolean, replay: ReasoningReplay): unknown;
  /**
   * Optional. Given a rejected request's error body, return the replay mode to retry with,
   * or null to give up. Lets one adapter serve providers that require reasoning to be sent
   * back and providers that refuse it.
   */
  replayFallback?(errorBody: string, current: ReasoningReplay): ReasoningReplay | null;
  /** Returns null when the JSON doesn't look like this format's chat response. */
  parseResponse(json: unknown): ParsedResponse | null;
  /** Returns null when the event isn't recognised as this format. */
  parseStreamEvent(event: SseEvent): StreamDelta | null;
  /** Returns null when the JSON doesn't look like a model list. */
  parseModels(json: unknown): string[] | null;
  /** Optional: formats without an embeddings API leave these out. */
  embeddingsBody?(model: string, inputs: string[]): unknown;
  /** Returns null when the JSON doesn't look like an embeddings response. */
  parseEmbeddings?(json: unknown, count: number): number[][] | null;
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
