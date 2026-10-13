"use client";

import type { RagDoc } from "@/lib/rag/types";
import { CloseIcon, FileIcon } from "./Icons";

export interface PendingFile {
  id: string;
  conversationId: string;
  name: string;
  error?: string;
}

interface Props {
  files: RagDoc[];
  pending: PendingFile[];
  persistent: boolean;
  disabled: boolean;
  onRemove: (doc: RagDoc) => void;
  onDismiss: (id: string) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Files attached to the current chat, plus files still being read or that failed. */
export function AttachmentBar({ files, pending, persistent, disabled, onRemove, onDismiss }: Props) {
  if (files.length === 0 && pending.length === 0) return null;
  return (
    <div className="mb-2" data-testid="attachments">
      <ul className="flex flex-wrap gap-2" aria-label="Files in this chat">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex max-w-full items-center gap-2 rounded-lg border border-line bg-raised py-1 pr-1 pl-2 text-sm"
            data-testid="attachment"
          >
            <FileIcon />
            <span className="min-w-0 truncate font-medium" title={f.name}>
              {f.name}
            </span>
            <span className="shrink-0 text-xs text-muted">
              {formatSize(f.size)} · {f.chunkCount} {f.chunkCount === 1 ? "section" : "sections"}
            </span>
            <button
              type="button"
              onClick={() => onRemove(f)}
              disabled={disabled}
              aria-label={`Remove ${f.name}`}
              title="Remove"
              className="rounded-md p-1 text-muted hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus:outline-none disabled:opacity-40"
            >
              <CloseIcon />
            </button>
          </li>
        ))}
        {pending.map((p) =>
          p.error ? (
            <li
              key={p.id}
              role="alert"
              className="flex max-w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 py-1 pr-1 pl-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              <span className="min-w-0">{p.error}</span>
              <button
                type="button"
                onClick={() => onDismiss(p.id)}
                aria-label="Dismiss"
                className="rounded-md p-1 hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-500 focus:outline-none dark:hover:bg-red-900"
              >
                <CloseIcon />
              </button>
            </li>
          ) : (
            <li key={p.id} className="flex max-w-full items-center gap-2 rounded-lg border border-dashed border-line px-2 py-1 text-sm text-muted" role="status">
              <FileIcon />
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="shrink-0 animate-pulse text-xs">Reading…</span>
            </li>
          ),
        )}
      </ul>
      {files.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          Your questions in this chat will be answered using these files.
          {!persistent && " Your browser is blocking storage, so they'll be gone when you reload."}
        </p>
      )}
    </div>
  );
}
