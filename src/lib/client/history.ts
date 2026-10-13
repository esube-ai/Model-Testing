import { sameRef, type ModelRef } from "./connections";
import type { ImageRef, Message } from "./conversations";

/** A user message and the replies to it (one per model in Compare mode). */
export interface Turn {
  user: Message;
  replies: Message[];
}

/**
 * Group messages into turns. Replies belong to the user message before them; older chats
 * without `turnId` group the same way.
 */
export function toTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === "user") turns.push({ user: m, replies: [] });
    else if (turns.length) turns[turns.length - 1].replies.push(m);
  }
  return turns;
}

const usable = (m: Message) => !m.error && !!m.content;
/** Replies from before multiple connections existed have no modelRef: treat them as this model's. */
const isFrom = (m: Message, ref: ModelRef | undefined) => (m.modelRef ? sameRef(m.modelRef, ref) : true);

/** The history message shape before images are loaded from storage. */
export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  images?: ImageRef[];
}

/**
 * The conversation as one model should see it. In Compare mode every model continues its
 * own thread: for each earlier turn it gets its own reply, or, if it didn't answer that
 * turn, the first good reply from another model. Failed replies are left out.
 */
export function historyFor(messages: Message[], ref: ModelRef | undefined): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  for (const { user, replies } of toTurns(messages)) {
    out.push({ role: "user", content: user.content, ...(user.images?.length ? { images: user.images } : {}) });
    const reply = replies.find((r) => usable(r) && isFrom(r, ref)) ?? replies.find(usable);
    // Reasoning only goes back to the model that produced it.
    if (reply) out.push({ role: "assistant", content: reply.content, ...(reply.reasoning && isFrom(reply, ref) ? { reasoning: reply.reasoning } : {}) });
  }
  return out;
}
