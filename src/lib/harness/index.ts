import { anthropicAdapter } from "./adapters/anthropic";
import { openaiAdapter } from "./adapters/openai";
import type { ProviderAdapter } from "./adapters/types";
import { HarnessError, type HarnessErrorJSON } from "./errors";
import { fetchWithRetry, parseSse, readLimited, type RequestGuard } from "./http";
import { buildEndpoint, MAX_RESPONSE_BYTES, validateConnection } from "./security";
import type { ApiFormat, ChatEvent, ChatMessage, ChatMetadata, ChatOptions, Connection, Usage } from "./types";

export * from "./types";
export { HarnessError, isHarnessError, type HarnessErrorCode, type HarnessErrorJSON, type ConnectionField } from "./errors";

const adapters: Record<ApiFormat, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
};

const FORMAT_LABEL: Record<ApiFormat, string> = { openai: "OpenAI-compatible", anthropic: "Anthropic" };

function mergeUsage(a: Usage, b?: Usage): Usage {
  if (!b) return a;
  return {
    inputTokens: b.inputTokens ?? a.inputTokens,
    outputTokens: b.outputTokens ?? a.outputTokens,
  };
}

/** Explain a wrong-format response, naming the format it actually looks like when we can tell. */
function badFormat(adapter: ProviderAdapter, sample: string, apiKey: string, json?: unknown): HarnessError {
  let hint = "";
  if (json !== undefined) {
    const other = Object.values(adapters).find((a) => a !== adapter && a.parseResponse(json));
    if (other) hint = ` It looks like an ${FORMAT_LABEL[other.format]} response; try switching the API format.`;
  }
  return new HarnessError(
    "bad_format",
    `Expected a ${FORMAT_LABEL[adapter.format]} response but got: ${sample.slice(0, 300) || "(empty)"}.${hint}`,
    { apiKey },
  );
}

/**
 * Send a chat request and yield normalized events: zero or more `text` chunks followed by
 * exactly one `done` event with usage/metadata. Throws HarnessError on failure.
 */
export async function* streamChat(
  connectionInput: Connection,
  messages: ChatMessage[],
  options: ChatOptions = {},
): AsyncGenerator<ChatEvent> {
  const connection = validateConnection(connectionInput);
  const { apiKey } = connection;
  if (!connection.model) {
    throw new HarnessError("invalid_input", "model is empty.", { message: "Enter a model name in connection settings." });
  }
  const adapter = adapters[connection.format];
  const stream = options.stream ?? true;
  const started = Date.now();

  const { response, guard } = await fetchWithRetry(
    buildEndpoint(connection, "chat"),
    {
      method: "POST",
      headers: adapter.headers(apiKey),
      body: JSON.stringify(adapter.chatBody(connection.model, messages, options, stream)),
    },
    { apiKey, signal: options.signal, timeoutMs: options.timeoutMs, retryBaseMs: options.retryBaseMs },
  );

  const metadata: ChatMetadata = { usage: {}, latencyMs: 0, format: connection.format, model: connection.model };
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (stream && contentType.includes("text/event-stream")) {
      yield* readStream(adapter, response, guard, apiKey, metadata);
    } else {
      const parsed = await readJson(adapter, response, guard, apiKey);
      metadata.model = parsed.model ?? metadata.model;
      metadata.finishReason = parsed.finishReason;
      metadata.usage = parsed.usage;
      if (parsed.text) yield { type: "text", text: parsed.text };
    }
    metadata.latencyMs = Date.now() - started;
    yield { type: "done", metadata };
  } finally {
    // Covers the consumer stopping early (e.g. user pressed Stop): abort the upstream request.
    guard.abort("cancelled");
    guard.dispose();
  }
}

async function* readStream(
  adapter: ProviderAdapter,
  response: Response,
  guard: RequestGuard,
  apiKey: string,
  metadata: ChatMetadata,
): AsyncGenerator<ChatEvent> {
  let recognized = 0;
  for await (const event of parseSse(response, guard, apiKey)) {
    const delta = adapter.parseStreamEvent(event);
    if (!delta) {
      if (recognized === 0) {
        let json: unknown;
        try {
          json = JSON.parse(event.data);
        } catch {
          /* not JSON */
        }
        throw badFormat(adapter, event.data, apiKey, json);
      }
      continue;
    }
    recognized++;
    if (delta.error) throw new HarnessError(delta.error.code, delta.error.detail, { apiKey });
    if (delta.model) metadata.model = delta.model;
    if (delta.finishReason) metadata.finishReason = delta.finishReason;
    metadata.usage = mergeUsage(metadata.usage, delta.usage);
    if (delta.text) yield { type: "text", text: delta.text };
    if (delta.done) break;
  }
  if (recognized === 0) throw badFormat(adapter, "an empty stream", apiKey);
  if (guard.reason === "cancelled") throw guard.toError(null, apiKey);
}

async function readJson(adapter: ProviderAdapter, response: Response, guard: RequestGuard, apiKey: string) {
  const text = await readLimited(response, MAX_RESPONSE_BYTES, guard, apiKey);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw badFormat(adapter, text, apiKey);
  }
  const parsed = adapter.parseResponse(json);
  if (!parsed) throw badFormat(adapter, text, apiKey, json);
  return parsed;
}

export type TestConnectionResult =
  | { ok: true; latencyMs: number; model?: string }
  | { ok: false; error: HarnessErrorJSON };

/** Make one minimal, non-streaming request to check the connection details work. */
export async function testConnection(connection: Connection, options: Pick<ChatOptions, "signal" | "timeoutMs" | "retryBaseMs"> = {}): Promise<TestConnectionResult> {
  try {
    let metadata: ChatMetadata | undefined;
    const events = streamChat(connection, [{ role: "user", content: "Reply with the single word: OK" }], {
      ...options,
      stream: false,
      timeoutMs: options.timeoutMs ?? 30_000,
      // Anthropic requires max_tokens. For OpenAI-compatible servers it is left out, because
      // some newer models reject `max_tokens`.
      maxTokens: connection.format === "anthropic" ? 8 : undefined,
    });
    for await (const ev of events) if (ev.type === "done") metadata = ev.metadata;
    return { ok: true, latencyMs: metadata?.latencyMs ?? 0, model: metadata?.model };
  } catch (e) {
    const err = e instanceof HarnessError ? e : new HarnessError("network", String(e), { apiKey: connection.apiKey });
    return { ok: false, error: err.toJSON() };
  }
}

/**
 * Fetch the provider's model list. Returns null when the provider doesn't offer one
 * (endpoint missing or not in the expected shape). Throws HarnessError for other failures
 * such as a bad key or unreachable host.
 */
export async function listModels(connectionInput: Connection, options: Pick<ChatOptions, "signal" | "timeoutMs" | "retryBaseMs"> = {}): Promise<string[] | null> {
  const connection = validateConnection(connectionInput);
  const adapter = adapters[connection.format];
  let result: Awaited<ReturnType<typeof fetchWithRetry>>;
  try {
    result = await fetchWithRetry(
      buildEndpoint(connection, "models"),
      { method: "GET", headers: adapter.headers(connection.apiKey) },
      { apiKey: connection.apiKey, signal: options.signal, timeoutMs: options.timeoutMs ?? 15_000, retryBaseMs: options.retryBaseMs },
    );
  } catch (e) {
    if (e instanceof HarnessError && (e.status === 404 || e.status === 405 || e.status === 501)) return null;
    throw e;
  }
  const { response, guard } = result;
  try {
    const text = await readLimited(response, MAX_RESPONSE_BYTES, guard, connection.apiKey);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return null;
    }
    const models = adapter.parseModels(json);
    return models ? [...new Set(models)].sort() : null;
  } finally {
    guard.dispose();
  }
}
