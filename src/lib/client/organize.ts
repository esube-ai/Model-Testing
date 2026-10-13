import type { Conversation } from "./conversations";

export interface SearchResult {
  conversation: Conversation;
  /** Text around the first match, for display. */
  snippet: string;
}

const SNIPPET = 60;

/**
 * Find chats whose title or messages contain every word of the query (case-insensitive).
 * Most recently updated first.
 */
export function searchConversations(conversations: Conversation[], query: string): SearchResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const results: SearchResult[] = [];
  for (const c of conversations) {
    const texts = [c.title, ...c.messages.map((m) => m.content)];
    const all = texts.join("\n").toLowerCase();
    if (!words.every((w) => all.includes(w))) continue;
    let snippet = "";
    for (const t of texts.slice(1)) {
      const i = t.toLowerCase().indexOf(words[0]);
      if (i !== -1) {
        const start = Math.max(0, i - SNIPPET / 2);
        snippet = `${start > 0 ? "…" : ""}${t.slice(start, start + SNIPPET).replace(/\s+/g, " ").trim()}${start + SNIPPET < t.length ? "…" : ""}`;
        break;
      }
    }
    results.push({ conversation: c, snippet });
  }
  return results.sort((a, b) => b.conversation.updatedAt.localeCompare(a.conversation.updatedAt));
}

export interface DateGroup {
  label: string;
  conversations: Conversation[];
}

/** Sidebar groups: Today, Yesterday, Previous 7 days, Previous 30 days, then by month. */
export function groupByDate(conversations: Conversation[], now = new Date()): DateGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups = new Map<string, Conversation[]>();
  const sorted = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const c of sorted) {
    const t = new Date(c.updatedAt).getTime();
    let label: string;
    if (t >= startOfToday) label = "Today";
    else if (t >= startOfToday - day) label = "Yesterday";
    else if (t >= startOfToday - 7 * day) label = "Previous 7 days";
    else if (t >= startOfToday - 30 * day) label = "Previous 30 days";
    else label = new Date(t).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    groups.set(label, [...(groups.get(label) ?? []), c]);
  }
  return [...groups].map(([label, list]) => ({ label, conversations: list }));
}
