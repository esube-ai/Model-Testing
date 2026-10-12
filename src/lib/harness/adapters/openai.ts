import { isObject, num, parseModelList, type ProviderAdapter, type StreamDelta } from "./types";

/** OpenAI Chat Completions API (and compatible servers). */
export const openaiAdapter: ProviderAdapter = {
  format: "openai",

  headers(apiKey) {
    const h: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    if (apiKey) h.authorization = `Bearer ${apiKey}`;
    return h;
  },

  chatBody(model, messages, options, stream) {
    const msgs = options.system ? [{ role: "system", content: options.system }, ...messages] : messages;
    const body: Record<string, unknown> = { model, messages: msgs, stream };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    return body;
  },

  parseResponse(json) {
    if (!isObject(json) || !Array.isArray(json.choices)) return null;
    const choice = json.choices[0];
    if (!isObject(choice) || !isObject(choice.message)) return null;
    const content = choice.message.content;
    if (typeof content !== "string" && content !== null) return null;
    const usage = isObject(json.usage) ? json.usage : {};
    return {
      text: content ?? "",
      model: typeof json.model === "string" ? json.model : undefined,
      finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : undefined,
      usage: { inputTokens: num(usage.prompt_tokens), outputTokens: num(usage.completion_tokens) },
    };
  },

  parseStreamEvent(event) {
    if (event.data.trim() === "[DONE]") return { done: true };
    let json: unknown;
    try {
      json = JSON.parse(event.data);
    } catch {
      return null;
    }
    if (!isObject(json)) return null;
    if (isObject(json.error)) {
      const message = typeof json.error.message === "string" ? json.error.message : JSON.stringify(json.error);
      return { error: { code: "server_error", detail: `Provider sent an error mid-stream: ${message}` } };
    }
    if (!Array.isArray(json.choices)) return null;
    const delta: StreamDelta = {};
    if (typeof json.model === "string") delta.model = json.model;
    const choice = json.choices[0];
    if (isObject(choice)) {
      if (isObject(choice.delta) && typeof choice.delta.content === "string") delta.text = choice.delta.content;
      if (typeof choice.finish_reason === "string") delta.finishReason = choice.finish_reason;
    }
    if (isObject(json.usage)) {
      delta.usage = { inputTokens: num(json.usage.prompt_tokens), outputTokens: num(json.usage.completion_tokens) };
    }
    return delta;
  },

  parseModels: parseModelList,
};
