"use client";

import { useState } from "react";
import type { Conversation } from "@/lib/client/conversations";
import { CloseIcon, EditIcon, PlusIcon, TrashIcon } from "./Icons";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ conversations, activeId, open, onClose, onNew, onSelect, onRename, onDelete }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const sorted = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />}
      <nav
        aria-label="Conversations"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-zinc-200 bg-zinc-50 transition-transform md:static md:z-auto md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-900 ${open ? "translate-x-0" : "-translate-x-full max-md:invisible"}`}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            type="button"
            onClick={onNew}
            className="flex flex-1 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-800"
          >
            <PlusIcon /> New chat
          </button>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-zinc-200 md:hidden dark:hover:bg-zinc-800" aria-label="Close sidebar">
            <CloseIcon />
          </button>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3" data-testid="conversation-list">
          {sorted.map((c) => (
            <li key={c.id}>
              {renaming === c.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onRename(c.id, draft.trim() || c.title);
                    setRenaming(null);
                  }}
                >
                  <label htmlFor={`rename-${c.id}`} className="sr-only">
                    Conversation name
                  </label>
                  <input
                    id={`rename-${c.id}`}
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                      onRename(c.id, draft.trim() || c.title);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                    className="w-full rounded-lg border border-blue-500 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </form>
              ) : (
                <div className={`group flex items-center rounded-lg ${c.id === activeId ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60"}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={c.id === activeId ? "page" : undefined}
                    className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                  >
                    {c.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(c.title);
                      setRenaming(c.id);
                    }}
                    className="rounded-md p-1.5 text-zinc-600 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:text-zinc-400 dark:hover:text-zinc-100"
                    aria-label={`Rename "${c.title}"`}
                    title="Rename"
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete "${c.title}"? This can't be undone.`)) onDelete(c.id);
                    }}
                    className="mr-1 rounded-md p-1.5 text-zinc-600 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:text-zinc-400 dark:hover:text-red-400"
                    aria-label={`Delete "${c.title}"`}
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
