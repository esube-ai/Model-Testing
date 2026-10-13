"use client";

import { useState } from "react";
import { newPrompt, type SavedPrompt } from "@/lib/client/prompts";
import { PlusIcon } from "./Icons";
import { cls, Modal } from "./ui";

interface Props {
  prompts: SavedPrompt[];
  onChange: (prompts: SavedPrompt[]) => void;
  onClose: () => void;
}

/** Add, edit and delete saved prompts. Type "/" in the message box to use them. */
export function PromptLibraryDialog({ prompts, onChange, onClose }: Props) {
  const [editing, setEditing] = useState<SavedPrompt | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  function edit(p: SavedPrompt | null) {
    setEditing(p ?? newPrompt("", ""));
    setTitle(p?.title ?? "");
    setContent(p?.content ?? "");
  }

  if (editing) {
    const isNew = !prompts.some((p) => p.id === editing.id);
    return (
      <Modal title={isNew ? "New prompt" : "Edit prompt"} onClose={() => setEditing(null)} width="34rem" testId="prompt-dialog">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!content.trim()) return;
            const updated = { ...editing, title: title.trim() || "Untitled prompt", content };
            onChange(isNew ? [...prompts, updated] : prompts.map((p) => (p.id === updated.id ? updated : p)));
            setEditing(null);
          }}
        >
          <div>
            <label htmlFor="prompt-title" className={cls.label}>
              Title
            </label>
            <input id="prompt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summarize" className={`mt-1 ${cls.input}`} autoFocus />
            <p className={cls.hint}>Shown in the “/” menu. Type part of it after “/” to find it.</p>
          </div>
          <div>
            <label htmlFor="prompt-content" className={cls.label}>
              Prompt
            </label>
            <textarea id="prompt-content" value={content} onChange={(e) => setContent(e.target.value)} rows={6} className={`mt-1 ${cls.input}`} />
            <p className={cls.hint}>Inserted into the message box, ready to finish and send.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={cls.secondary} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="submit" className={cls.primary} disabled={!content.trim()}>
              Save prompt
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal title="Prompt library" description="Reusable prompts. Type / in the message box to insert one." onClose={onClose} width="36rem" testId="prompt-dialog">
      <ul className="space-y-2">
        {prompts.map((p) => (
          <li key={p.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.title}</p>
              <p className="line-clamp-2 text-sm whitespace-pre-wrap text-muted">{p.content}</p>
            </div>
            <button type="button" className={cls.secondary} onClick={() => edit(p)} aria-label={`Edit prompt ${p.title}`}>
              Edit
            </button>
            <button type="button" className={cls.danger} onClick={() => onChange(prompts.filter((x) => x.id !== p.id))} aria-label={`Delete prompt ${p.title}`}>
              Delete
            </button>
          </li>
        ))}
        {prompts.length === 0 && <li className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No saved prompts.</li>}
      </ul>
      <button type="button" className={`${cls.secondary} mt-3 w-full`} onClick={() => edit(null)}>
        <PlusIcon /> New prompt
      </button>
    </Modal>
  );
}
