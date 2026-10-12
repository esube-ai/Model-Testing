import { HarnessError, streamChat, type ChatEvent } from "@/lib/harness";
import { safeLog } from "@/lib/harness/redact";
import { errorResponse, keyOf, parseConnection, parseMessages, parseOptions, readBody } from "@/lib/server/api";

export const runtime = "nodejs";
// Long streamed replies need time. 300s is the Vercel Hobby maximum (with Fluid compute).
export const maxDuration = 300;

/**
 * POST { connection, messages, options } -> newline-delimited JSON stream of
 * { type: "text", text } ... { type: "done", metadata } or { type: "error", error }.
 * Errors that happen before the first chunk are returned as a JSON error response instead.
 */
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown> | undefined;
  let apiKey: string | undefined;
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

  let events: AsyncGenerator<ChatEvent>;
  let first: IteratorResult<ChatEvent>;
  try {
    body = await readBody(request);
    apiKey = keyOf(body);
    const connection = parseConnection(body);
    events = streamChat(connection, parseMessages(body.messages), { ...parseOptions(body.options), signal: abort.signal });
    first = await events.next();
  } catch (e) {
    return errorResponse(e, apiKey ?? keyOf(body), "api/chat");
  }

  const encoder = new TextEncoder();
  const line = (v: unknown) => encoder.encode(JSON.stringify(v) + "\n");
  let pending: IteratorResult<ChatEvent> | null = first;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = pending ?? (await events.next());
        pending = null;
        if (result.done) return controller.close();
        controller.enqueue(line(result.value));
      } catch (e) {
        const err = e instanceof HarnessError ? e : new HarnessError("network", String(e), { apiKey });
        if (err.code !== "cancelled") safeLog("error", apiKey, `[api/chat] ${err.code}: ${err.detail}`);
        controller.enqueue(line({ type: "error", error: err.toJSON() }));
        controller.close();
      }
    },
    cancel() {
      // Browser disconnected or user pressed Stop: abort the upstream provider request.
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
