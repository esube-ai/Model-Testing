"use client";

import { useState } from "react";
import type { Message } from "@/lib/client/conversations";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import { EditIcon, RefreshIcon, ThumbDownIcon, ThumbUpIcon } from "./Icons";

interface Props {
  message: Message;
  streaming: boolean;
  busy: boolean;
  canRegenerate: boolean;
  canEdit: boolean;
  onFeedback: (value: "up" | "down") => void;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
  onOpenConnection: () => void;
}

const iconButton =
  "rounded-md p-1.5 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

export function MessageItem({ message, streaming, busy, canRegenerate, canEdit, onFeedback, onRegenerate, onEdit, onOpenConnection }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  if (message.role === "user") {
    return (
      <div className="group flex flex-col items-end" data-testid="user-message">
        {editing ? (
          <form
            className="w-full max-w-[85%] space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              setEditing(false);
              onEdit(draft.trim());
            }}
          >
            <label htmlFor={`edit-${message.id}`} className="sr-only">
              Edit message
            </label>
            <textarea
              id={`edit-${message.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              className="w-full rounded-xl border border-zinc-300 bg-white p-3 text-base text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                Save &amp; send
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-zinc-100 px-4 py-2.5 dark:bg-zinc-800">{message.content}</div>
            <div className="mt-1 flex gap-1">
              <CopyButton text={message.content} label="Copy message" />
              {canEdit && (
                <button
                  type="button"
                  className={iconButton}
                  disabled={busy}
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(true);
                  }}
                  aria-label="Edit and resend"
                  title="Edit and resend"
                >
                  <EditIcon />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  if (message.error) {
    const err = message.error;
    const showSettings = !!err.field || err.code === "host_not_allowed";
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200" data-testid="error-message">
        <p className="font-medium">{err.message}</p>
        {err.detail && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs">Technical details</summary>
            <p className="mt-1 break-words text-xs">{err.detail}</p>
          </details>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onRegenerate} disabled={busy} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50 dark:bg-red-600">
            Retry
          </button>
          {showSettings && (
            <button type="button" onClick={onOpenConnection} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900">
              Open connection settings
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group" data-testid="assistant-message">
      {message.content ? (
        <Markdown text={message.content} streaming={streaming} />
      ) : streaming ? (
        <p className="text-zinc-500 dark:text-zinc-400" aria-label="Waiting for reply">
          <span className="inline-block animate-pulse">●●●</span>
        </p>
      ) : null}
      {message.stopped && <p className="mt-2 text-xs text-zinc-600 italic dark:text-zinc-400">Stopped early.</p>}
      {!streaming && (
        <div className="mt-1 flex items-center gap-1">
          <CopyButton text={message.content} label="Copy message" />
          <button
            type="button"
            className={`${iconButton} ${message.feedback === "up" ? "text-green-700 dark:text-green-400" : ""}`}
            aria-label="Good response"
            aria-pressed={message.feedback === "up"}
            title="Good response"
            onClick={() => onFeedback("up")}
          >
            <ThumbUpIcon />
          </button>
          <button
            type="button"
            className={`${iconButton} ${message.feedback === "down" ? "text-red-700 dark:text-red-400" : ""}`}
            aria-label="Bad response"
            aria-pressed={message.feedback === "down"}
            title="Bad response"
            onClick={() => onFeedback("down")}
          >
            <ThumbDownIcon />
          </button>
          {canRegenerate && (
            <button type="button" className={iconButton} onClick={onRegenerate} disabled={busy} aria-label="Regenerate response" title="Regenerate response">
              <RefreshIcon />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
