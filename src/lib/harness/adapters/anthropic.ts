import type { HarnessErrorCode } from "../errors";
import { isObject, num, parseModelList, type ProviderAdapter } from "./types";

const ANTHROPIC_VERSION = "2023-06-01";
/** Anthropic requires max_tokens; used when the user leaves it blank. */
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096;

function errorCode(type: unknown): HarnessErrorCode {
  switch (type) {
    case "rate_limit_error":
      return "rate_limit";
    case "authentication_error":
    case "permission_error":
      return "auth";
    case "not_found_error":
      return "model_not_found";
    case "invalid_request_error":
      return "bad_request";
    default:
      return "server_error";
  }
}

/** Anthropic Messages API. */
export const anthropicAdapter: ProviderAdapter = {
  format: "anthropic",

  headers(apiKey) {
    const h: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "anthropic-version": ANTHROPIC_VERSION,
    };
    if (apiKey) h["x-api-key"] = apiKey;
    return h;
  },

  chatBody(model, messages, options, stream) {
    const body: Record<string, unknown> = {
      model,
      messages: messages.map(({ role, content, images }) => {
        if (role !== "user" || !images?.length) return { role, content };
        // Images first, then the text, as Anthropic recommends. Empty text blocks aren't allowed.
        const parts: unknown[] = images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.mime, data: img.data } }));
        if (content) parts.push({ type: "text", text: content });
        return { role, content: parts };
      }),
      max_tokens: options.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
      stream,
    };
    if (options.system) body.system = options.system;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    return body;
  },

  parseResponse(json) {
    if (!isObject(json) || json.type !== "message" || !Array.isArray(json.content)) return null;
    const text = json.content
      .map((block) => (isObject(block) && block.type === "text" && typeof block.text === "string" ? block.text : ""))
      .join("");
    const usage = isObject(json.usage) ? json.usage : {};
    return {
      text,
      model: typeof json.model === "string" ? json.model : undefined,
      finishReason: typeof json.stop_reason === "string" ? json.stop_reason : undefined,
      usage: { inputTokens: num(usage.input_tokens), outputTokens: num(usage.output_tokens) },
    };
  },

  parseStreamEvent(event) {
    let json: unknown;
    try {
      json = JSON.parse(event.data);
    } catch {
      return null;
    }
    if (!isObject(json) || typeof json.type !== "string") return null;
    switch (json.type) {
      case "message_start": {
        const msg = isObject(json.message) ? json.message : {};
        const usage = isObject(msg.usage) ? msg.usage : {};
        return {
          model: typeof msg.model === "string" ? msg.model : undefined,
          usage: { inputTokens: num(usage.input_tokens), outputTokens: num(usage.output_tokens) },
        };
      }
      case "content_block_start": {
        const block = isObject(json.content_block) ? json.content_block : {};
        return block.type === "text" && typeof block.text === "string" && block.text ? { text: block.text } : {};
      }
      case "content_block_delta": {
        const delta = isObject(json.delta) ? json.delta : {};
        return delta.type === "text_delta" && typeof delta.text === "string" ? { text: delta.text } : {};
      }
      case "message_delta": {
        const delta = isObject(json.delta) ? json.delta : {};
        const usage = isObject(json.usage) ? json.usage : {};
        return {
          finishReason: typeof delta.stop_reason === "string" ? delta.stop_reason : undefined,
          usage: { outputTokens: num(usage.output_tokens) },
        };
      }
      case "message_stop":
        return { done: true };
      case "content_block_stop":
      case "ping":
        return {};
      case "error": {
        const err = isObject(json.error) ? json.error : {};
        const message = typeof err.message === "string" ? err.message : JSON.stringify(err);
        return { error: { code: errorCode(err.type), detail: `Provider sent an error mid-stream: ${message}` } };
      }
      default:
        return null;
    }
  },

  parseModels: parseModelList,
};
