import { HarnessError, IMAGE_MIME_TYPES, type ChatMessage, type ChatOptions, type Connection, type ImagePart } from "@/lib/harness";
import { validateConnection } from "@/lib/harness/security";
import { safeLog } from "@/lib/harness/redact";

/** Below Vercel's 4.5 MB request limit; leaves room for a few pictures. */
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGES_PER_REQUEST = 12;
/** Base64 length of a ~2 MB image. */
const MAX_IMAGE_BASE64 = 2_800_000;
const MAX_MESSAGES = 500;

/** Read and parse the JSON body of a request to one of our routes, with a size limit. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_REQUEST_BYTES) throw tooLong();
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) throw tooLong();
  try {
    const json = JSON.parse(text);
    if (json && typeof json === "object" && !Array.isArray(json)) return json as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HarnessError("invalid_input", "Request body must be a JSON object.");
}

function tooLong() {
  return new HarnessError("invalid_input", "Request body too large.", { message: "This conversation is too long to send. Start a new chat." });
}

export function parseConnection(body: Record<string, unknown>): Connection {
  return validateConnection(body.connection);
}

export function parseMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_MESSAGES) {
    throw new HarnessError("invalid_input", "messages must be a non-empty array.", { message: "There is no message to send." });
  }
  let imageCount = 0;
  return input.map((m) => {
    const msg = (m ?? {}) as Record<string, unknown>;
    if ((msg.role !== "user" && msg.role !== "assistant") || typeof msg.content !== "string") {
      throw new HarnessError("invalid_input", "Each message needs a role of user/assistant and string content.");
    }
    if (msg.role === "user" && Array.isArray(msg.images) && msg.images.length) {
      const images = parseImages(msg.images);
      imageCount += images.length;
      if (imageCount > MAX_IMAGES_PER_REQUEST) {
        throw new HarnessError("invalid_input", "Too many images.", { message: "This chat has too many pictures to send. Start a new chat." });
      }
      return { role: msg.role, content: msg.content, images };
    }
    const reasoning = msg.role === "assistant" && typeof msg.reasoning === "string" && msg.reasoning ? msg.reasoning : undefined;
    return reasoning ? { role: msg.role, content: msg.content, reasoning } : { role: msg.role, content: msg.content };
  });
}

function parseImages(input: unknown[]): ImagePart[] {
  if (input.length > MAX_IMAGES_PER_MESSAGE) {
    throw new HarnessError("invalid_input", "Too many images in one message.", { message: `Send at most ${MAX_IMAGES_PER_MESSAGE} pictures per message.` });
  }
  return input.map((raw) => {
    const img = (raw ?? {}) as Record<string, unknown>;
    const mime = img.mime;
    const data = img.data;
    if (
      typeof mime !== "string" ||
      !(IMAGE_MIME_TYPES as readonly string[]).includes(mime) ||
      typeof data !== "string" ||
      data.length === 0 ||
      data.length > MAX_IMAGE_BASE64 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
    ) {
      throw new HarnessError("invalid_input", "Invalid image.", { message: "One of the pictures couldn't be sent. Try a PNG or JPEG under 2 MB." });
    }
    return { mime: mime as ImagePart["mime"], data };
  });
}

export function parseOptions(input: unknown): Pick<ChatOptions, "system" | "temperature" | "maxTokens"> {
  const o = (input ?? {}) as Record<string, unknown>;
  const out: Pick<ChatOptions, "system" | "temperature" | "maxTokens"> = {};
  if (typeof o.system === "string" && o.system.trim()) out.system = o.system;
  if (typeof o.temperature === "number" && Number.isFinite(o.temperature)) out.temperature = Math.min(2, Math.max(0, o.temperature));
  if (typeof o.maxTokens === "number" && Number.isInteger(o.maxTokens) && o.maxTokens > 0) out.maxTokens = Math.min(o.maxTokens, 1_000_000);
  return out;
}

/** JSON error response. Never includes the key: HarnessError details are redacted at creation. */
export function errorResponse(e: unknown, apiKey: string | undefined, route: string): Response {
  const err = e instanceof HarnessError ? e : new HarnessError("network", e instanceof Error ? e.message : String(e), { apiKey });
  if (err.code !== "cancelled") safeLog("error", apiKey, `[${route}] ${err.code}: ${err.detail}`);
  const status = err.code === "invalid_input" || err.code === "unsupported" ? 400 : err.code === "host_not_allowed" ? 403 : 502;
  return Response.json({ error: err.toJSON() }, { status, headers: { "cache-control": "no-store" } });
}

/** Best-effort extraction of the key for redaction when the body failed validation. */
export function keyOf(body: Record<string, unknown> | undefined): string | undefined {
  const c = body?.connection as Record<string, unknown> | undefined;
  return typeof c?.apiKey === "string" ? c.apiKey : undefined;
}
