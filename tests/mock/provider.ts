/**
 * Local mock model provider used by the Vitest and Playwright suites. It speaks both the
 * OpenAI Chat Completions format (/v1/chat/completions, /v1/models) and the Anthropic
 * Messages format (/v1/messages, /v1/models with anthropic-version header).
 *
 * Behaviour is selected by the model name:
 *   (anything)     normal reply "Hello! You said: <last message>"
 *   missing-model  404 model not found
 *   flaky-429      first request on this server -> 429, then success
 *   always-500     always 500
 *   slow           waits 3s before responding
 *   wrong-shape    200 with the *other* format's response body
 *   html           200 with an HTML page
 *   reasoning-model   (OpenAI format) returns `reasoning_content` and, like some reasoning
 *                     models, rejects requests whose earlier assistant messages lack it
 *   strict-reasoner   (OpenAI format) returns `reasoning_content` but rejects it in requests
 * A last user message containing "long story" streams many slow chunks (for Stop tests),
 * and one containing "rich demo" replies with every supported content type (RICH_DEMO).
 * Paths prefixed with /nomodels have no model-list endpoint.
 * POST /v1/embeddings returns deterministic "semantic" vectors (see mockEmbedding); the
 * embedding model "missing-embed" returns 404.
 *
 * Run standalone: `node tests/mock/provider.ts [port]`
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export const VALID_KEY = "test-key-SECRET-abc123XYZ987";
export const MOCK_MODELS = ["mock-model", "mock-model-large"];

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Reply exercising tables, task lists, math, diagrams, SVG, images, HTML and XSS attempts. */
export const RICH_DEMO = [
  "## Rich demo",
  "",
  "| Name | Score |",
  "|------|------:|",
  "| Alpha | 1 |",
  "| Beta | 2 |",
  "",
  "- [x] done item",
  "- [ ] open item",
  "",
  "This is ~~wrong~~ right. Euler: $e^{i\\pi} + 1 = 0$",
  "",
  "$$",
  "\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}",
  "$$",
  "",
  "```mermaid",
  "graph TD",
  "  A[Start] --> B[Finish]",
  "```",
  "",
  "```svg",
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="teal"/></svg>',
  "```",
  "",
  `![tiny pixel](data:image/png;base64,${PNG_1PX})`,
  "",
  "<details><summary>Click for more</summary>Hidden <b>details</b></details>",
  "",
  '<img src="x" onerror="window.__xss = 1">',
  "",
  "<script>window.__xss = 2</script>",
  "",
  "[bad link](javascript:window.__xss=3)",
].join("\n");

export interface MockProvider {
  url: string;
  port: number;
  requests: { method: string; path: string; headers: http.IncomingHttpHeaders; body: string }[];
  /** Number of requests whose client disconnected before the response finished. */
  aborted: () => number;
  close: () => Promise<void>;
}

/** Words the mock embedding model treats as meaning the same thing. */
const SYNONYMS: Record<string, string> = {
  car: "vehicle", cars: "vehicle", automobile: "vehicle", automobiles: "vehicle", vehicles: "vehicle",
  upkeep: "maintenance", servicing: "maintenance", service: "maintenance",
  cost: "price", costs: "price", prices: "price", pricing: "price",
};

/** Deterministic bag-of-words embedding (64 dims) that maps synonyms together. */
export function mockEmbedding(text: string): number[] {
  const vec = new Array(64).fill(0);
  for (const raw of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const word = SYNONYMS[raw] ?? raw;
    let h = 2166136261;
    for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    vec[(h >>> 0) % 64] += 1;
  }
  const norm = Math.hypot(...vec) || 1;
  return vec.map((v) => v / norm);
}

interface Body {
  model?: string;
  stream?: boolean;
  messages?: { role: string; content: string; reasoning_content?: unknown }[];
}

export async function startMockProvider(port = 0): Promise<MockProvider> {
  const requests: MockProvider["requests"] = [];
  let abortedCount = 0;
  let flakyCount = 0;

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      requests.push({ method: req.method ?? "", path: req.url ?? "", headers: req.headers, body: raw });
      let finished = false;
      res.on("finish", () => (finished = true));
      res.on("close", () => {
        if (!finished) abortedCount++;
      });
      void handle(req, res, raw).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
  });

  async function handle(req: http.IncomingMessage, res: http.ServerResponse, raw: string) {
    let path = (req.url ?? "/").split("?")[0];
    let modelsSupported = true;
    if (path.startsWith("/nomodels")) {
      modelsSupported = false;
      path = path.slice("/nomodels".length);
    }
    const isAnthropic = path === "/v1/messages" || (path === "/v1/models" && !!req.headers["anthropic-version"]);
    const key = isAnthropic ? req.headers["x-api-key"] : String(req.headers.authorization ?? "").replace(/^Bearer /, "");

    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const error = (status: number, type: string, message: string) =>
      isAnthropic ? json(status, { type: "error", error: { type, message } }) : json(status, { error: { message, type, code: type } });

    const known =
      path === "/v1/chat/completions" || path === "/v1/messages" || path === "/v1/embeddings" || (path === "/v1/models" && modelsSupported);
    if (!known) return json(404, { error: "Not found" });
    if (key !== VALID_KEY) {
      // Deliberately echo the key, like some real providers do, to test redaction.
      return error(401, "authentication_error", `Incorrect API key provided: ${String(key)}`);
    }
    if (path === "/v1/models") {
      return json(200, isAnthropic
        ? { data: MOCK_MODELS.map((id) => ({ type: "model", id, display_name: id })), has_more: false }
        : { object: "list", data: MOCK_MODELS.map((id) => ({ id, object: "model" })) });
    }

    if (path === "/v1/embeddings") {
      let req: { model?: string; input?: string[] } = {};
      try {
        req = JSON.parse(raw);
      } catch {
        return error(400, "invalid_request_error", "Invalid JSON");
      }
      if (req.model === "missing-embed") return error(404, "not_found_error", `The model \`${req.model}\` does not exist`);
      const inputs = Array.isArray(req.input) ? req.input : [];
      return json(200, { object: "list", model: req.model, data: inputs.map((t, index) => ({ object: "embedding", index, embedding: mockEmbedding(String(t)) })) });
    }

    let body: Body = {};
    try {
      body = JSON.parse(raw) as Body;
    } catch {
      return error(400, "invalid_request_error", "Invalid JSON");
    }
    const model = body.model ?? "";
    if (model === "missing-model") return error(404, "not_found_error", `The model \`${model}\` does not exist`);
    if (model === "always-500") return error(500, "api_error", "Internal server error");
    if (model === "flaky-429" && flakyCount++ === 0) {
      res.setHeader("retry-after", "0");
      return error(429, "rate_limit_error", "Rate limit reached");
    }
    if (model === "slow") await sleep(3000);
    const isReasoner = !isAnthropic && (model === "reasoning-model" || model === "strict-reasoner");
    if (!isAnthropic && model === "reasoning-model") {
      const idx = body.messages?.findIndex((m) => m.role === "assistant" && typeof m.reasoning_content !== "string") ?? -1;
      if (idx !== -1) {
        return json(400, { error: { code: "missing_required_parameter", message: `Missing required parameter: 'messages[${idx}].reasoning_content'. This model needs the reasoning of every earlier assistant message: send back the 'reasoning_content' returned with that message.`, param: `messages[${idx}].reasoning_content`, type: "invalid_request_error" } });
      }
    }
    if (!isAnthropic && model === "strict-reasoner" && body.messages?.some((m) => "reasoning_content" in m)) {
      return json(400, { error: { message: "Unrecognized request argument supplied: reasoning_content", type: "invalid_request_error", param: null, code: null } });
    }
    if (model === "html") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<html><body>Welcome to my website</body></html>");
    }

    const last = body.messages?.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const long = last.includes("long story");
    const reply = long
      ? Array.from({ length: 200 }, (_, i) => `word${i} `).join("")
      : last.includes("rich demo")
        ? RICH_DEMO
        : `Hello! You said: ${last}`;
    const asAnthropic = model === "wrong-shape" ? !isAnthropic : isAnthropic;
    const reasoning = isReasoner ? `Thinking about: ${last}. ` : "";

    if (!body.stream || model === "wrong-shape") {
      return json(200, asAnthropic
        ? { id: "msg_1", type: "message", role: "assistant", model, content: [{ type: "text", text: reply }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 7 } }
        : { id: "chatcmpl-1", object: "chat.completion", model, choices: [{ index: 0, message: { role: "assistant", content: reply, ...(reasoning ? { reasoning_content: reasoning } : {}) }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 7 } });
    }

    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const send = (data: unknown, event?: string) => {
      if (res.destroyed) return;
      res.write(`${event ? `event: ${event}\n` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
    };
    const chunks = reply.match(/\S+\s*/g) ?? [reply];
    // Long echoes (e.g. questions with file excerpts) stream quickly so tests stay fast.
    const delay = long ? 100 : chunks.length > 100 ? 1 : 20;

    if (isAnthropic) {
      send({ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model, content: [], usage: { input_tokens: 5, output_tokens: 1 } } }, "message_start");
      send({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, "content_block_start");
      send({ type: "ping" }, "ping");
      for (const c of chunks) {
        if (res.destroyed) return;
        send({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: c } }, "content_block_delta");
        await sleep(delay);
      }
      send({ type: "content_block_stop", index: 0 }, "content_block_stop");
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: chunks.length } }, "message_delta");
      send({ type: "message_stop" }, "message_stop");
    } else {
      for (const r of reasoning.match(/\S+\s*/g) ?? []) {
        send({ id: "chatcmpl-1", object: "chat.completion.chunk", model, choices: [{ index: 0, delta: { reasoning_content: r }, finish_reason: null }] });
        await sleep(delay);
      }
      for (const c of chunks) {
        if (res.destroyed) return;
        send({ id: "chatcmpl-1", object: "chat.completion.chunk", model, choices: [{ index: 0, delta: { content: c }, finish_reason: null }] });
        await sleep(delay);
      }
      send({ id: "chatcmpl-1", object: "chat.completion.chunk", model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: chunks.length } });
      send("[DONE]");
    }
    res.end();
  }

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const actualPort = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${actualPort}`,
    port: actualPort,
    requests,
    aborted: () => abortedCount,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 4010);
  void startMockProvider(port).then((p) => console.log(`Mock provider listening on ${p.url}`));
}
