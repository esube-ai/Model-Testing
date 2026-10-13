"use client";

import { useState } from "react";
import type { Conversation } from "@/lib/client/conversations";
import { searchConversations } from "@/lib/client/organize";
import { SearchIcon } from "./Icons";
import { cls, Modal } from "./ui";

interface Props {
  conversations: Conversation[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Search every chat's title and messages. Arrow keys move, Enter opens. */
export function SearchDialog({ conversations, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const results = query.trim()
    ? searchConversations(conversations, query)
    : [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8).map((conversation) => ({ conversation, snippet: "" }));

  return (
    <Modal title="Search chats" onClose={onClose} width="36rem" testId="search-dialog">
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
          <SearchIcon />
        </span>
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (results.length) setIndex((i) => (i + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
            } else if (e.key === "Enter" && results[index]) {
              e.preventDefault();
              onSelect(results[index].conversation.id);
            }
          }}
          placeholder="Search titles and messages…"
          aria-label="Search chats"
          aria-controls="search-results"
          className={`${cls.input} pl-10 text-base`}
        />
      </div>
      <p className="mt-3 mb-1 text-xs font-medium text-muted">{query.trim() ? `${results.length} ${results.length === 1 ? "result" : "results"}` : "Recent chats"}</p>
      <ul id="search-results" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto">
        {results.map((r, i) => (
          <li key={r.conversation.id}>
            <button
              type="button"
              role="option"
              aria-selected={i === index}
              onClick={() => onSelect(r.conversation.id)}
              onMouseEnter={() => setIndex(i)}
              className={`${cls.menuItem} flex-col items-start gap-0.5 ${i === index ? "bg-raised" : ""}`}
            >
              <span className="w-full truncate font-medium">{r.conversation.title}</span>
              {r.snippet && <span className="w-full truncate text-xs text-muted">{r.snippet}</span>}
            </button>
          </li>
        ))}
        {query.trim() && results.length === 0 && <li className="px-3 py-4 text-sm text-muted">No chats match “{query}”.</li>}
      </ul>
    </Modal>
  );
}
