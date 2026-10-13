import { isObject, num, parseModelList, type ProviderAdapter, type StreamDelta } from "./types";

/** Reasoning text, which servers name `reasoning_content` (most) or `reasoning` (some). */
function reasoningOf(msg: Record<string, unknown>): string | undefined {
  const r = msg.reasoning_content ?? msg.reasoning;
  return typeof r === "string" && r ? r : undefined;
}

/** OpenAI Chat Completions API (and compatible servers). */
export const openaiAdapter: ProviderAdapter = {
  format: "openai",

  headers(apiKey) {
    const h: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    if (apiKey) h.authorization = `Bearer ${apiKey}`;
    return h;
  },

  chatBody(model, messages, options, stream, replay) {
    const history = messages.map((m) => {
      if (m.role === "user" && m.images?.length) {
        const parts: unknown[] = m.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.data}` } }));
        if (m.content) parts.push({ type: "text", text: m.content });
        return { role: m.role, content: parts };
      }
      if (m.role !== "assistant" || replay === "never") return { role: m.role, content: m.content };
      if (replay === "always") return { role: m.role, content: m.content, reasoning_content: m.reasoning ?? "" };
      return m.reasoning ? { role: m.role, content: m.content, reasoning_content: m.reasoning } : { role: m.role, content: m.content };
    });
    const msgs = options.system ? [{ role: "system", content: options.system }, ...history] : history;
    const body: Record<string, unknown> = { model, messages: msgs, stream };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    return body;
  },

  /**
   * Reasoning models disagree about `reasoning_content` in requests: some require it on
   * every earlier assistant message, others reject it. Adjust once based on the error.
   */
  replayFallback(errorBody, current) {
    if (current !== "when-available" || !/reasoning_content/i.test(errorBody)) return null;
    return /missing|required/i.test(errorBody) ? "always" : "never";
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
      reasoning: reasoningOf(choice.message),
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
      if (isObject(choice.delta)) delta.reasoning = reasoningOf(choice.delta);
      if (typeof choice.finish_reason === "string") delta.finishReason = choice.finish_reason;
    }
    if (isObject(json.usage)) {
      delta.usage = { inputTokens: num(json.usage.prompt_tokens), outputTokens: num(json.usage.completion_tokens) };
    }
    return delta;
  },

  parseModels: parseModelList,

  embeddingsBody(model, inputs) {
    return { model, input: inputs, encoding_format: "float" };
  },

  parseEmbeddings(json, count) {
    if (!isObject(json) || !Array.isArray(json.data) || json.data.length !== count) return null;
    const out: number[][] = new Array(count);
    for (const [i, item] of json.data.entries()) {
      if (!isObject(item) || !Array.isArray(item.embedding) || !item.embedding.every((n) => typeof n === "number")) return null;
      const index = typeof item.index === "number" ? item.index : i;
      if (index < 0 || index >= count) return null;
      out[index] = item.embedding as number[];
    }
    return out.every(Boolean) ? out : null;
  },
};
