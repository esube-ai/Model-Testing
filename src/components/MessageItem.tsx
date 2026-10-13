"use client";

import { useState } from "react";
import type { Message } from "@/lib/client/conversations";
import { ImageThumb } from "./Composer";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import { CheckIcon, EditIcon, RefreshIcon, ThumbDownIcon, ThumbUpIcon } from "./Icons";
import { cls } from "./ui";

interface UserProps {
  message: Message;
  canEdit: boolean;
  busy: boolean;
  onEdit: (text: string) => void;
}

/** The tester's message: a soft bubble, with any pictures above the text. */
export function UserMessage({ message, canEdit, busy, onEdit }: UserProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  return (
    <div className="group flex flex-col items-end" data-testid="user-message">
      {message.images && message.images.length > 0 && (
        <div className="mb-2 flex flex-wrap justify-end gap-2">
          {message.images.map((img) => (
            <ImageThumb key={img.id} image={img} size="h-28 w-28 sm:h-36 sm:w-36" />
          ))}
        </div>
      )}
      {editing ? (
        <form
          className="w-full max-w-[85%] space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim() && !message.images?.length) return;
            setEditing(false);
            onEdit(draft.trim());
          }}
        >
          <label htmlFor={`edit-${message.id}`} className="sr-only">
            Edit message
          </label>
          <textarea id={`edit-${message.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus className={`${cls.input} text-base`} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className={cls.secondary}>
              Cancel
            </button>
            <button type="submit" className={cls.primary}>
              Save &amp; send
            </button>
          </div>
        </form>
      ) : (
        <>
          {message.content && <div className="max-w-[85%] rounded-2xl bg-raised px-4 py-2.5 whitespace-pre-wrap break-words">{message.content}</div>}
          <div className="mt-1 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            {message.content && <CopyButton text={message.content} label="Copy message" />}
            {canEdit && (
              <button
                type="button"
                className={cls.iconButton}
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

interface ReplyProps {
  message: Message;
  streaming: boolean;
  busy: boolean;
  canRegenerate: boolean;
  /** Shown in Compare mode: a card with the model name on top. */
  variant?: "single" | "card";
  /** Label for the model that wrote this reply. */
  modelLabel?: string;
  onFeedback: (value: "up" | "down") => void;
  onRegenerate: () => void;
  onOpenConnection: () => void;
  /** Compare mode: keep chatting with just this model. */
  onContinueWith?: () => void;
}

export function AssistantMessage(props: ReplyProps) {
  const { message, streaming, busy, canRegenerate, variant = "single", modelLabel } = props;
  const card = variant === "card";

  const body = message.error ? (
    <ErrorCard message={message} busy={busy} onRetry={props.onRegenerate} onOpenConnection={props.onOpenConnection} />
  ) : (
    <>
      {message.reasoning && (
        <details className="mb-3 rounded-lg border border-line px-3 py-2 text-sm" data-testid="reasoning">
          <summary className="cursor-pointer text-muted select-none">{streaming && !message.content ? "Thinking…" : "Reasoning"}</summary>
          <p className="mt-2 whitespace-pre-wrap break-words text-muted">{message.reasoning}</p>
        </details>
      )}
      {message.content ? (
        <div className="reply-text">
          <Markdown text={message.content} streaming={streaming} />
        </div>
      ) : streaming ? (
        message.progress ? (
          <p className="animate-pulse text-sm text-muted" role="status">
            {message.progress}
          </p>
        ) : (
          <p className="text-muted" aria-label="Waiting for reply">
            <span className="inline-block animate-pulse">●●●</span>
          </p>
        )
      ) : null}
      {message.stopped && <p className="mt-2 text-xs text-muted italic">Stopped early.</p>}
      {message.notice && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">{message.notice}</p>}
      {message.sources && message.sources.length > 0 && (
        <details className="mt-3 rounded-lg border border-line px-3 py-2 text-sm" data-testid="sources">
          <summary className="cursor-pointer text-muted select-none">Sources from your files ({message.sources.length})</summary>
          <ol className="mt-2 space-y-2">
            {message.sources.map((s) => (
              <li key={s.n}>
                <p className="font-medium">
                  [{s.n}] {s.docName}
                  {s.page ? `, page ${s.page}` : ""}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-muted">{s.excerpt}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );

  const actions = !streaming && !message.error && (
    <div className="mt-2 flex flex-wrap items-center gap-0.5">
      <CopyButton text={message.content} label="Copy response" />
      <button
        type="button"
        className={`${cls.iconButton} ${message.feedback === "up" ? "text-green-700 dark:text-green-400" : ""}`}
        aria-label="Good response"
        aria-pressed={message.feedback === "up"}
        title="Good response"
        onClick={() => props.onFeedback("up")}
      >
        <ThumbUpIcon />
      </button>
      <button
        type="button"
        className={`${cls.iconButton} ${message.feedback === "down" ? "text-red-700 dark:text-red-400" : ""}`}
        aria-label="Bad response"
        aria-pressed={message.feedback === "down"}
        title="Bad response"
        onClick={() => props.onFeedback("down")}
      >
        <ThumbDownIcon />
      </button>
      {canRegenerate && (
        <button type="button" className={cls.iconButton} onClick={props.onRegenerate} disabled={busy} aria-label="Regenerate response" title="Regenerate response">
          <RefreshIcon />
        </button>
      )}
      {!card && modelLabel && <span className="ml-2 truncate text-xs text-muted">{modelLabel}</span>}
      {card && props.onContinueWith && (
        <button type="button" className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-raised hover:text-ink" onClick={props.onContinueWith} disabled={busy}>
          <CheckIcon /> Continue with this model
        </button>
      )}
    </div>
  );

  if (card) {
    return (
      <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-4" data-testid="assistant-message" aria-label={`Reply from ${modelLabel ?? "model"}`}>
        <header className="mb-3 truncate border-b border-line pb-2 text-sm font-medium" title={modelLabel}>
          {modelLabel}
        </header>
        <div className="min-w-0 flex-1">{body}</div>
        {actions}
      </article>
    );
  }
  return (
    <div className="group" data-testid="assistant-message">
      {body}
      {actions}
    </div>
  );
}

function ErrorCard({ message, busy, onRetry, onOpenConnection }: { message: Message; busy: boolean; onRetry: () => void; onOpenConnection: () => void }) {
  const err = message.error!;
  const showSettings = !!err.field || err.code === "host_not_allowed";
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200" data-testid="error-message">
      <p className="font-medium">{err.message}</p>
      {err.detail && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs">Technical details</summary>
          <p className="mt-1 text-xs break-words">{err.detail}</p>
        </details>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} disabled={busy} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50 dark:bg-red-600">
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
