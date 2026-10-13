import { beforeEach, describe, expect, it } from "vitest";
import { clearConnections, loadConnections, resolveRef, saveConnections, validRefs, type ConnectionsState } from "@/lib/client/connections";
import type { Conversation, Message } from "@/lib/client/conversations";
import { historyFor, toTurns } from "@/lib/client/history";
import { groupByDate, searchConversations } from "@/lib/client/organize";
import { combinedSystemPrompt, newProject } from "@/lib/client/projects";
import { DEFAULT_PROMPTS, filterPrompts } from "@/lib/client/prompts";

/** Minimal Web Storage so the browser storage helpers work under Node. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem = (k: string) => this.map.get(k) ?? null;
  setItem = (k: string, v: string) => void this.map.set(k, v);
  removeItem = (k: string) => void this.map.delete(k);
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() };
});

const w = () => (globalThis as unknown as { window: { localStorage: MemoryStorage; sessionStorage: MemoryStorage } }).window;

describe("connections", () => {
  it("migrates the old single saved connection", () => {
    w().localStorage.setItem("model-testing.connection", JSON.stringify({ baseUrl: "https://api.example.com/v1", apiKey: "k1", format: "openai", model: "m1" }));
    const state = loadConnections();
    expect(state.remember).toBe(true);
    expect(state.connections).toHaveLength(1);
    expect(state.connections[0]).toMatchObject({ name: "api.example.com", baseUrl: "https://api.example.com/v1", apiKey: "k1", models: ["m1"] });
    expect(w().localStorage.getItem("model-testing.connection")).toBeNull();
    expect(loadConnections().connections[0].id).toBe(state.connections[0].id);
  });

  it("stores keys in session storage unless Remember is on, and clears everything", () => {
    const state: ConnectionsState = { remember: false, connections: [{ id: "a", name: "A", baseUrl: "https://a.test", apiKey: "secret", format: "openai", models: ["x"] }] };
    saveConnections(state);
    expect(w().sessionStorage.getItem("model-testing.connections")).toContain("secret");
    expect(w().localStorage.getItem("model-testing.connections")).toBeNull();
    saveConnections({ ...state, remember: true });
    expect(w().sessionStorage.getItem("model-testing.connections")).toBeNull();
    expect(loadConnections().remember).toBe(true);
    clearConnections();
    expect(loadConnections().connections).toEqual([]);
  });

  it("resolves model selections and drops ones that no longer exist", () => {
    const state: ConnectionsState = {
      remember: false,
      connections: [
        { id: "a", name: "A", baseUrl: "https://a.test/v1", apiKey: "ka", format: "openai", models: ["a1", "a2"] },
        { id: "b", name: "B", baseUrl: "https://b.test", apiKey: "kb", format: "anthropic", models: ["b1"] },
      ],
    };
    expect(resolveRef(state, { connectionId: "b", model: "b1" })?.connection).toEqual({ baseUrl: "https://b.test", apiKey: "kb", format: "anthropic", model: "b1" });
    expect(resolveRef(state, { connectionId: "gone", model: "x" })).toBeNull();
    expect(validRefs(state, [{ connectionId: "a", model: "a2" }, { connectionId: "gone", model: "x" }])).toEqual([{ connectionId: "a", model: "a2" }]);
    expect(validRefs(state, undefined)).toEqual([{ connectionId: "a", model: "a1" }]);
  });
});

const A = { connectionId: "c", model: "A" };
const B = { connectionId: "c", model: "B" };
let n = 0;
const user = (content: string, extra: Partial<Message> = {}): Message => ({ id: `u${n++}`, role: "user", content, createdAt: "", ...extra });
const reply = (content: string, modelRef?: typeof A, extra: Partial<Message> = {}): Message => ({ id: `a${n++}`, role: "assistant", content, createdAt: "", modelRef, ...extra });

describe("history for each model", () => {
  it("groups replies into turns", () => {
    const msgs = [user("q1"), reply("a", A), reply("b", B), user("q2")];
    expect(toTurns(msgs).map((t) => [t.user.content, t.replies.length])).toEqual([["q1", 2], ["q2", 0]]);
  });

  it("gives each model in Compare its own earlier replies", () => {
    const msgs = [user("q1"), reply("from A", A, { reasoning: "A thinks" }), reply("from B", B), user("q2")];
    expect(historyFor(msgs, A)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "from A", reasoning: "A thinks" },
      { role: "user", content: "q2" },
    ]);
    expect(historyFor(msgs, B)[1]).toEqual({ role: "assistant", content: "from B" });
  });

  it("uses another model's reply when this one didn't answer, without its reasoning", () => {
    const msgs = [user("q1"), reply("from A", A, { reasoning: "A thinks" }), user("q2")];
    expect(historyFor(msgs, B)[1]).toEqual({ role: "assistant", content: "from A" });
  });

  it("skips failed replies and keeps images on user messages", () => {
    const img = { id: "i", mime: "image/png" as const, name: "x.png", width: 1, height: 1 };
    const msgs = [user("look", { images: [img] }), reply("", A, { error: { code: "rate_limit", message: "busy" } }), user("again")];
    expect(historyFor(msgs, A)).toEqual([
      { role: "user", content: "look", images: [img] },
      { role: "user", content: "again" },
    ]);
  });

  it("treats replies from before multiple connections as the current model's", () => {
    const msgs = [user("q1"), reply("old reply", undefined, { reasoning: "old thinking" }), user("q2")];
    expect(historyFor(msgs, A)[1]).toEqual({ role: "assistant", content: "old reply", reasoning: "old thinking" });
  });
});

const conv = (id: string, title: string, updatedAt: string, texts: string[] = []): Conversation => ({
  id,
  title,
  createdAt: updatedAt,
  updatedAt,
  settings: { systemPrompt: "", temperature: null, maxTokens: null },
  messages: texts.map((t) => user(t)),
});

describe("organizing chats", () => {
  it("searches titles and messages for every word", () => {
    const list = [conv("1", "Trip planning", "2026-10-01T10:00:00Z", ["Best beaches in Portugal"]), conv("2", "Budget", "2026-10-02T10:00:00Z", ["Quarterly numbers"])];
    expect(searchConversations(list, "portugal beaches").map((r) => r.conversation.id)).toEqual(["1"]);
    expect(searchConversations(list, "portugal beaches")[0].snippet).toContain("Portugal");
    expect(searchConversations(list, "budget").map((r) => r.conversation.id)).toEqual(["2"]);
    expect(searchConversations(list, "  ")).toEqual([]);
  });

  it("groups by date", () => {
    const now = new Date(2026, 9, 13, 15, 0);
    const at = (daysAgo: number) => new Date(2026, 9, 13 - daysAgo, 12, 0).toISOString();
    const groups = groupByDate([conv("t", "t", at(0)), conv("y", "y", at(1)), conv("w", "w", at(4)), conv("m", "m", at(20)), conv("o", "o", at(90))], now);
    expect(groups.map((g) => g.label).slice(0, 4)).toEqual(["Today", "Yesterday", "Previous 7 days", "Previous 30 days"]);
    expect(groups).toHaveLength(5);
  });
});

describe("prompts and projects", () => {
  it("filters prompts by title or text", () => {
    expect(filterPrompts(DEFAULT_PROMPTS, "proof").map((p) => p.title)).toEqual(["Proofread"]);
    expect(filterPrompts(DEFAULT_PROMPTS, "")).toHaveLength(DEFAULT_PROMPTS.length);
  });

  it("puts project instructions before the chat's system prompt", () => {
    const p = { ...newProject("Research"), instructions: "Answer in French." };
    expect(combinedSystemPrompt(p, "Be brief.")).toBe("Answer in French.\n\nBe brief.");
    expect(combinedSystemPrompt(undefined, "  ")).toBeUndefined();
  });
});
