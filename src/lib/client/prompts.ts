import { newId } from "./ids";
import { readJson, writeJson } from "./storage";

/** Reusable prompts, inserted with the "/" menu in the message box. */
export const PROMPTS_KEY = "model-testing.prompts";

export interface SavedPrompt {
  id: string;
  title: string;
  content: string;
}

export const DEFAULT_PROMPTS: SavedPrompt[] = [
  { id: "default-summarize", title: "Summarize", content: "Summarize the following in five bullet points:\n\n" },
  { id: "default-explain", title: "Explain simply", content: "Explain this as if I'm new to the topic, using a short example:\n\n" },
  { id: "default-proofread", title: "Proofread", content: "Proofread this text. Fix grammar and spelling, keep my tone, and list what you changed:\n\n" },
  { id: "default-critique", title: "Find weaknesses", content: "Act as a critical reviewer. What are the three biggest weaknesses in this, and how would you fix them?\n\n" },
];

export function loadPrompts(): SavedPrompt[] {
  const list = readJson<SavedPrompt[]>("local", PROMPTS_KEY);
  if (!Array.isArray(list)) return DEFAULT_PROMPTS;
  return list.filter((p) => p && typeof p.id === "string" && typeof p.title === "string" && typeof p.content === "string");
}

export function savePrompts(list: SavedPrompt[]): boolean {
  return writeJson("local", PROMPTS_KEY, list);
}

export function newPrompt(title: string, content: string): SavedPrompt {
  return { id: newId(), title: title.trim() || "Untitled prompt", content };
}

/** Prompts whose title or text contains every word of the query. */
export function filterPrompts(list: SavedPrompt[], query: string): SavedPrompt[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((p) => {
    const hay = `${p.title} ${p.content}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
