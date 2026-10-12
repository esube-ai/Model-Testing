import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { embed, HarnessError, listModels, streamChat, testConnection, type ChatEvent, type Connection } from "@/lib/harness";
import { buildEndpoint, isPrivateHost } from "@/lib/harness/security";
import { redact } from "@/lib/harness/redact";
import { startMockProvider, VALID_KEY, MOCK_MODELS, mockEmbedding, type MockProvider } from "../mock/provider";

const BAD_KEY = "sk-wrong-key-0000111122223333";
let mock: MockProvider;

// Capture everything the harness logs, to check no key ever leaks into logs.
const logged: string[] = [];
const thrown: unknown[] = [];

beforeAll(() => {
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  }
});

beforeEach(async () => {
  mock = await startMockProvider();
});

afterEach(async () => {
  delete process.env.ALLOWED_API_HOSTS;
  delete process.env.VERCEL;
  await mock.close();
});

afterAll(() => {
  vi.restoreAllMocks();
});

function conn(format: "openai" | "anthropic", model = "mock-model", apiKey = VALID_KEY, path = ""): Connection {
  const baseUrl = format === "openai" ? `${mock.url}${path}/v1` : `${mock.url}${path}`;
  return { baseUrl, apiKey, format, model };
}

async function collect(gen: AsyncGenerator<ChatEvent>) {
  const chunks: string[] = [];
  let reasoning = "";
  let done: Extract<ChatEvent, { type: "done" }> | undefined;
  for await (const ev of gen) {
    if (ev.type === "text") chunks.push(ev.text);
    else if (ev.type === "reasoning") reasoning += ev.text;
    else done = ev;
  }
  return { chunks, text: chunks.join(""), reasoning, done };
}

async function expectError(promise: Promise<unknown>): Promise<HarnessError> {
  try {
    await promise;
  } catch (e) {
    thrown.push(e);
    expect(e).toBeInstanceOf(HarnessError);
    return e as HarnessError;
  }
  throw new Error("expected an error");
}

const msgs = [{ role: "user" as const, content: "hi there" }];

describe.each(["openai", "anthropic"] as const)("streamChat (%s)", (format) => {
  it("streams text chunks and finishes with usage metadata", async () => {
    const { chunks, text, done } = await collect(streamChat(conn(format), msgs, { system: "be nice", temperature: 0.2, maxTokens: 50 }));
    expect(chunks.length).toBeGreaterThan(1);
    expect(text).toBe("Hello! You said: hi there");
    expect(done?.metadata.format).toBe(format);
    expect(done?.metadata.model).toBe("mock-model");
    expect(done?.metadata.usage.outputTokens).toBeGreaterThan(0);

    const sent = JSON.parse(mock.requests[0].body);
    expect(sent.stream).toBe(true);
    expect(sent.temperature).toBe(0.2);
    expect(sent.max_tokens).toBe(50);
    if (format === "anthropic") expect(sent.system).toBe("be nice");
    else expect(sent.messages[0]).toEqual({ role: "system", content: "be nice" });
  });

  it("supports non-streaming responses", async () => {
    const { chunks, done } = await collect(streamChat(conn(format), msgs, { stream: false }));
    expect(chunks).toEqual(["Hello! You said: hi there"]);
    expect(done?.metadata.usage).toEqual({ inputTokens: 5, outputTokens: 7 });
  });

  it("maps 401 to an auth error without leaking the key", async () => {
    const err = await expectError(collect(streamChat(conn(format, "mock-model", BAD_KEY), msgs)));
    expect(err.code).toBe("auth");
    expect(err.field).toBe("apiKey");
    expect(err.status).toBe(401);
    expect(err.detail).toContain("[REDACTED]");
  });

  it("maps 404 for an unknown model to model_not_found", async () => {
    const err = await expectError(collect(streamChat(conn(format, "missing-model"), msgs)));
    expect(err.code).toBe("model_not_found");
    expect(err.field).toBe("model");
  });

  it("maps 404 on a wrong path to bad_url", async () => {
    const err = await expectError(collect(streamChat({ ...conn(format), baseUrl: `${mock.url}/wrong/place` }, msgs)));
    expect(err.code).toBe("bad_url");
    expect(err.field).toBe("baseUrl");
  });

  it("detects a response in the other API format (wrong format selected)", async () => {
    const err = await expectError(collect(streamChat(conn(format, "wrong-shape"), msgs)));
    expect(err.code).toBe("bad_format");
    expect(err.field).toBe("format");
    expect(err.detail).toMatch(/try switching the API format/);
  });

  it("detects a non-JSON (HTML) response", async () => {
    const err = await expectError(collect(streamChat(conn(format, "html"), msgs)));
    expect(err.code).toBe("bad_format");
  });

  it("retries a 429 and then succeeds", async () => {
    const { text } = await collect(streamChat(conn(format, "flaky-429"), msgs, { retryBaseMs: 10 }));
    expect(text).toBe("Hello! You said: hi there");
    expect(mock.requests).toHaveLength(2);
  });

  it("gives up after 3 attempts on 500", async () => {
    const err = await expectError(collect(streamChat(conn(format, "always-500"), msgs, { retryBaseMs: 10 })));
    expect(err.code).toBe("server_error");
    expect(mock.requests).toHaveLength(3);
  });

  it("times out when the provider doesn't answer", async () => {
    const err = await expectError(collect(streamChat(conn(format, "slow"), msgs, { timeoutMs: 300 })));
    expect(err.code).toBe("timeout");
  });

  it("cancels mid-stream when the signal aborts", async () => {
    const controller = new AbortController();
    const received: string[] = [];
    const err = await expectError(
      (async () => {
        for await (const ev of streamChat(conn(format), [{ role: "user", content: "tell me a long story" }], { signal: controller.signal })) {
          if (ev.type === "text") received.push(ev.text);
          if (received.length === 3) controller.abort();
        }
      })(),
    );
    expect(err.code).toBe("cancelled");
    expect(received).toHaveLength(3);
    await vi.waitFor(() => expect(mock.aborted()).toBe(1));
  });

  it("stops the upstream request when the consumer stops iterating", async () => {
    const gen = streamChat(conn(format), [{ role: "user", content: "tell me a long story" }]);
    await gen.next();
    await gen.return(undefined);
    await vi.waitFor(() => expect(mock.aborted()).toBe(1));
  });

  it("listModels returns the model list when supported", async () => {
    expect(await listModels(conn(format))).toEqual(MOCK_MODELS);
  });

  it("listModels returns null when the endpoint is missing", async () => {
    expect(await listModels(conn(format, "mock-model", VALID_KEY, "/nomodels"))).toBeNull();
  });

  it("listModels throws an auth error for a bad key", async () => {
    const err = await expectError(listModels(conn(format, "mock-model", BAD_KEY)));
    expect(err.code).toBe("auth");
  });

  it("testConnection reports success and failure", async () => {
    expect(await testConnection(conn(format))).toMatchObject({ ok: true, model: "mock-model" });
    const bad = await testConnection(conn(format, "mock-model", BAD_KEY));
    expect(bad).toMatchObject({ ok: false, error: { code: "auth", field: "apiKey" } });
    expect(JSON.stringify(bad)).not.toContain(BAD_KEY);
  });
});

describe("reasoning models (reasoning_content)", () => {
  const sentMessages = (i: number) => JSON.parse(mock.requests[i].body).messages as Record<string, unknown>[];
  const turn2 = (reasoning?: string) => [
    { role: "user" as const, content: "first" },
    { role: "assistant" as const, content: "Hello! You said: first", ...(reasoning !== undefined ? { reasoning } : {}) },
    { role: "user" as const, content: "second" },
  ];

  it("streams the reasoning separately from the reply", async () => {
    const { text, reasoning } = await collect(streamChat(conn("openai", "reasoning-model"), msgs));
    expect(reasoning).toBe("Thinking about: hi there. ");
    expect(text).toBe("Hello! You said: hi there");
    // The first turn has no earlier assistant messages, so nothing extra is sent.
    expect(sentMessages(0).some((m) => "reasoning_content" in m)).toBe(false);
  });

  it("returns reasoning from non-streaming replies", async () => {
    const { text, reasoning } = await collect(streamChat(conn("openai", "reasoning-model"), msgs, { stream: false }));
    expect(reasoning).toBe("Thinking about: hi there. ");
    expect(text).toBe("Hello! You said: hi there");
  });

  it("sends earlier reasoning back on the next turn", async () => {
    const { text } = await collect(streamChat(conn("openai", "reasoning-model"), turn2("Thinking about: first. ")));
    expect(text).toBe("Hello! You said: second");
    expect(mock.requests).toHaveLength(1);
    expect(sentMessages(0)[1]).toEqual({ role: "assistant", content: "Hello! You said: first", reasoning_content: "Thinking about: first. " });
    expect(sentMessages(0)[0]).toEqual({ role: "user", content: "first" });
  });

  it("retries with empty reasoning when an older message has none saved", async () => {
    const { text } = await collect(streamChat(conn("openai", "reasoning-model"), turn2()));
    expect(text).toBe("Hello! You said: second");
    expect(mock.requests).toHaveLength(2);
    expect(sentMessages(1)[1].reasoning_content).toBe("");
  });

  it("retries without reasoning when the provider rejects the field", async () => {
    const { text } = await collect(streamChat(conn("openai", "strict-reasoner"), turn2("Thinking about: first. ")));
    expect(text).toBe("Hello! You said: second");
    expect(mock.requests).toHaveLength(2);
    expect(sentMessages(0)[1].reasoning_content).toBe("Thinking about: first. ");
    expect(sentMessages(1).some((m) => "reasoning_content" in m)).toBe(false);
  });

  it("never sends reasoning fields to the Anthropic format", async () => {
    await collect(streamChat(conn("anthropic"), turn2("some thoughts")));
    expect(sentMessages(0).every((m) => Object.keys(m).sort().join() === "content,role")).toBe(true);
  });
});

describe("embeddings", () => {
  it("returns one vector per input, in order, batching large requests", async () => {
    const inputs = Array.from({ length: 70 }, (_, i) => `text number ${i}`);
    const vectors = await embed(conn("openai"), "embed-model", inputs);
    expect(vectors).toHaveLength(70);
    expect(vectors[69]).toEqual(mockEmbedding("text number 69"));
    expect(mock.requests.map((r) => r.path)).toEqual(["/v1/embeddings", "/v1/embeddings", "/v1/embeddings"]);
    expect(JSON.parse(mock.requests[0].body)).toMatchObject({ model: "embed-model", encoding_format: "float" });
  });

  it("reports an unknown embedding model", async () => {
    const err = await expectError(embed(conn("openai"), "missing-embed", ["hi"]));
    expect(err.code).toBe("model_not_found");
  });

  it("reports a bad key without leaking it", async () => {
    const err = await expectError(embed(conn("openai", "mock-model", BAD_KEY), "embed-model", ["hi"]));
    expect(err.code).toBe("auth");
  });

  it("is unsupported for the Anthropic format, without sending a request", async () => {
    const err = await expectError(embed(conn("anthropic"), "embed-model", ["hi"]));
    expect(err.code).toBe("unsupported");
    expect(err.message).toMatch(/Keyword search is used instead/);
    expect(mock.requests).toHaveLength(0);
  });
});

describe("security", () => {
  it("rejects a host not listed in ALLOWED_API_HOSTS without sending a request", async () => {
    process.env.ALLOWED_API_HOSTS = "api.example.com, api.other.com";
    const err = await expectError(collect(streamChat(conn("openai"), msgs)));
    expect(err.code).toBe("host_not_allowed");
    expect(err.message).toContain("api.example.com");
    expect(mock.requests).toHaveLength(0);
    expect((await testConnection(conn("openai"))).ok).toBe(false);
    await expectError(listModels(conn("openai")));
  });

  it("allows a host listed in ALLOWED_API_HOSTS", async () => {
    process.env.ALLOWED_API_HOSTS = "127.0.0.1";
    expect((await collect(streamChat(conn("openai"), msgs))).text).toContain("Hello");
  });

  it("blocks local and private-network addresses when deployed on Vercel", async () => {
    process.env.VERCEL = "1";
    const err = await expectError(collect(streamChat(conn("openai"), msgs)));
    expect(err.code).toBe("host_not_allowed");
    expect(err.message).toMatch(/private-network/);
    expect(mock.requests).toHaveLength(0);
    for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.10", "169.254.169.254", "[::1]", "[fd00::1]", "[::ffff:127.0.0.1]", "0.0.0.0", "2130706433"]) {
      expect(isPrivateHost(new URL(`http://${host}/`).hostname), host).toBe(true);
    }
    for (const host of ["api.openai.com", "8.8.8.8", "172.32.0.1", "[2606:4700::1]"]) {
      expect(isPrivateHost(new URL(`http://${host}/`).hostname), host).toBe(false);
    }
  });

  it("allows local addresses when not on a hosted deployment", async () => {
    expect((await collect(streamChat(conn("openai"), msgs))).text).toContain("Hello");
  });

  it("only allows http(s) URLs", async () => {
    for (const baseUrl of ["file:///etc/passwd", "ftp://example.com", "not a url", "http://user:pw@example.com"]) {
      const err = await expectError(collect(streamChat({ ...conn("openai"), baseUrl }, msgs)));
      expect(err.code).toBe("invalid_input");
    }
  });

  it("only forwards to the chat / messages / models paths", () => {
    expect(buildEndpoint({ baseUrl: "https://api.example.com/v1/", format: "openai" }, "chat")).toBe("https://api.example.com/v1/chat/completions");
    expect(buildEndpoint({ baseUrl: "https://api.example.com/v1/chat/completions?x=1", format: "openai" }, "models")).toBe("https://api.example.com/v1/models");
    expect(buildEndpoint({ baseUrl: "https://api.anthropic.com", format: "anthropic" }, "chat")).toBe("https://api.anthropic.com/v1/messages");
    expect(buildEndpoint({ baseUrl: "https://api.anthropic.com/v1", format: "anthropic" }, "models")).toBe("https://api.anthropic.com/v1/models");
  });

  it("maps an unreachable host to a network error", async () => {
    const port = mock.port;
    await mock.close();
    const err = await expectError(collect(streamChat({ ...conn("openai"), baseUrl: `http://127.0.0.1:${port}/v1` }, msgs)));
    expect(err.code).toBe("network");
    mock = await startMockProvider();
  });

  it("redacts keys, masked echoes and auth headers", () => {
    const key = "sk-live-1234567890abcdef";
    expect(redact(`key ${key} here`, key)).toBe("key [REDACTED] here");
    expect(redact("Incorrect API key provided: sk-live-****cdef", key)).not.toContain("cdef");
    expect(redact('{"authorization": "Bearer abc.def"}')).not.toContain("abc.def");
    expect(redact("x-api-key: zzz-secret")).not.toContain("zzz-secret");
  });

  it("never exposes the key in any thrown error or log output", () => {
    expect(thrown.length).toBeGreaterThan(10);
    expect(logged.some((l) => l.includes("retrying"))).toBe(true);
    for (const e of thrown) {
      const err = e as HarnessError;
      const everything = [err.message, err.detail, String(err.stack), JSON.stringify(err), JSON.stringify(err.toJSON())].join("\n");
      expect(everything).not.toContain(VALID_KEY);
      expect(everything).not.toContain(BAD_KEY);
    }
    for (const line of logged) {
      expect(line).not.toContain(VALID_KEY);
      expect(line).not.toContain(BAD_KEY);
    }
  });
});
