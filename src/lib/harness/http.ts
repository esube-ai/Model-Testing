import { HarnessError, errorFromStatus } from "./errors";
import { MAX_RESPONSE_BYTES } from "./security";
import { safeLog } from "./redact";

export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 500;
const MAX_RETRY_DELAY_MS = 10_000;

/**
 * Combines the caller's cancel signal with an inactivity timeout. `touch()` restarts the
 * timer, so a stream that keeps producing chunks never times out, but a silent one does.
 */
export class RequestGuard {
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  reason: "timeout" | "cancelled" | null = null;
  private readonly onUserAbort = () => this.abort("cancelled");

  constructor(
    private readonly userSignal: AbortSignal | undefined,
    private readonly timeoutMs: number,
  ) {
    if (userSignal?.aborted) this.abort("cancelled");
    else userSignal?.addEventListener("abort", this.onUserAbort, { once: true });
    this.touch();
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  touch(): void {
    if (this.reason) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.abort("timeout"), this.timeoutMs);
  }

  abort(reason: "timeout" | "cancelled"): void {
    if (this.reason) return;
    this.reason = reason;
    clearTimeout(this.timer);
    this.controller.abort();
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.userSignal?.removeEventListener("abort", this.onUserAbort);
  }

  /** Convert whatever was thrown while this guard was active into a HarnessError. */
  toError(e: unknown, apiKey: string): HarnessError {
    if (e instanceof HarnessError) return e;
    if (this.reason === "cancelled") return new HarnessError("cancelled", "Request cancelled by the user.", { apiKey });
    if (this.reason === "timeout") {
      return new HarnessError("timeout", `No response from the provider within ${Math.round(this.timeoutMs / 1000)}s.`, { apiKey });
    }
    return networkError(e, apiKey);
  }
}

function networkError(e: unknown, apiKey: string): HarnessError {
  const err = e as { message?: string; cause?: { code?: string; message?: string } };
  const cause = err?.cause?.code || err?.cause?.message || "";
  const detail = `Network request failed: ${err?.message ?? String(e)}${cause ? ` (${cause})` : ""}`;
  return new HarnessError("network", detail, { apiKey });
}

export interface FetchOptions {
  apiKey: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  retryBaseMs?: number;
}

/**
 * fetch with timeout, cancellation and retries (exponential backoff on 429 and 5xx, max
 * 3 attempts). Resolves with an OK response plus the guard that keeps watching it; the
 * caller must call guard.dispose() when done reading.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: FetchOptions,
): Promise<{ response: Response; guard: RequestGuard }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = opts.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;

  for (let attempt = 1; ; attempt++) {
    const guard = new RequestGuard(opts.signal, timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: guard.signal, redirect: "error" });
    } catch (e) {
      guard.dispose();
      throw guard.toError(e, opts.apiKey);
    }

    if (response.ok) return { response, guard };

    let body = "";
    try {
      body = await readLimited(response, 64 * 1024, guard, opts.apiKey);
    } catch (e) {
      const err = guard.toError(e, opts.apiKey);
      if (err.code === "cancelled" || err.code === "timeout") {
        guard.dispose();
        throw err;
      }
    }
    guard.dispose();

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw errorFromStatus(response.status, body, opts.apiKey);
    }
    const delay = retryDelay(response.headers.get("retry-after"), base, attempt);
    safeLog("warn", opts.apiKey, `[harness] provider returned HTTP ${response.status}; retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
    await sleep(delay, opts.signal, opts.apiKey);
  }
}

function retryDelay(retryAfter: string | null, base: number, attempt: number): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  const jitter = Math.random() * base * 0.25;
  return Math.min(base * 2 ** (attempt - 1) + jitter, MAX_RETRY_DELAY_MS);
}

function sleep(ms: number, signal: AbortSignal | undefined, apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new HarnessError("cancelled", "Request cancelled by the user.", { apiKey }));
    const onAbort = () => {
      clearTimeout(t);
      reject(new HarnessError("cancelled", "Request cancelled by the user.", { apiKey }));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Read a response body as text, enforcing a byte limit. */
export async function readLimited(response: Response, maxBytes: number, guard: RequestGuard, apiKey: string): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      guard.touch();
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new HarnessError("response_too_large", `Response exceeded ${maxBytes} bytes.`, { apiKey });
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (e) {
    throw guard.toError(e, apiKey);
  }
}

export interface SseEvent {
  event?: string;
  data: string;
}

/** Parse a Server-Sent Events body into events, enforcing the total size limit. */
export async function* parseSse(response: Response, guard: RequestGuard, apiKey: string): AsyncGenerator<SseEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let total = 0;
  let event: string | undefined;
  let data: string[] = [];

  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        throw guard.toError(e, apiKey);
      }
      if (chunk.done) break;
      guard.touch();
      total += chunk.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new HarnessError("response_too_large", `Stream exceeded ${MAX_RESPONSE_BYTES} bytes.`, { apiKey });
      }
      buffer += decoder.decode(chunk.value, { stream: true });

      let nl: number;
      while ((nl = buffer.search(/\r\n|\r|\n/)) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + (buffer.slice(nl, nl + 2) === "\r\n" ? 2 : 1));
        if (line === "") {
          if (data.length) yield { event, data: data.join("\n") };
          event = undefined;
          data = [];
          continue;
        }
        if (line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
    }
    if (data.length) yield { event, data: data.join("\n") };
  } finally {
    await reader.cancel().catch(() => {});
  }
}
