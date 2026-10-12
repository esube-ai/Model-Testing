import type { ChatEvent, ChatMessage, Connection, HarnessErrorJSON } from "@/lib/harness";

/** Calls to this app's own server routes. The browser never talks to the provider directly. */

export class ApiError extends Error {
  constructor(readonly error: HarnessErrorJSON) {
    super(error.message);
  }
}

function fallbackError(detail: string): HarnessErrorJSON {
  return { code: "network", message: "Couldn't reach this app's server. Check that it is still running, then try again.", detail };
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(fallbackError(String(e)));
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  try {
    const json = (await res.json()) as { error?: HarnessErrorJSON };
    if (json.error) return new ApiError(json.error);
  } catch {
    /* not JSON */
  }
  return new ApiError(fallbackError(`HTTP ${res.status}`));
}

export type TestResult = { ok: true; latencyMs: number; model?: string } | { ok: false; error: HarnessErrorJSON };

export async function testConnectionApi(connection: Connection): Promise<TestResult> {
  try {
    const res = await post("/api/test-connection", { connection });
    if (!res.ok) return { ok: false, error: (await errorFrom(res)).error };
    return (await res.json()) as TestResult;
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.error : fallbackError(String(e)) };
  }
}

export async function listModelsApi(connection: Connection): Promise<string[] | null> {
  const res = await post("/api/models", { connection });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { models: string[] | null }).models;
}

export interface ChatRequestOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Stream a chat reply. Throws ApiError on failure, AbortError when stopped. */
export async function* streamChatApi(
  connection: Connection,
  messages: ChatMessage[],
  options: ChatRequestOptions,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const res = await post("/api/chat", { connection, messages, options }, signal);
  if (!res.ok || !res.body) throw await errorFrom(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line) as ChatEvent | { type: "error"; error: HarnessErrorJSON };
      if (ev.type === "error") throw new ApiError(ev.error);
      yield ev;
    }
  }
}
