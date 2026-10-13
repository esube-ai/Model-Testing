"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { CloseIcon } from "./Icons";

/** Shared class strings so controls look the same everywhere. */
export const cls = {
  focus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
  iconButton:
    "inline-flex items-center justify-center rounded-lg p-1.5 text-muted hover:bg-raised hover:text-ink disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  primary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
  secondary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  danger:
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500",
  input:
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  label: "block text-sm font-medium text-ink",
  hint: "mt-1 text-xs text-muted",
  menuItem:
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-raised focus-visible:bg-raised focus-visible:outline-none",
};

/** Close a popover when clicking outside it or pressing Escape. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [ref, open, onClose]);
}

interface ModalProps {
  title: string;
  description?: string;
  /** False during onboarding, when the dialog must be completed. */
  closable?: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  testId?: string;
}

/** An accessible modal built on the native <dialog> element (focus trap, Escape, backdrop). */
export function Modal({ title, description, closable = true, onClose, children, width = "32rem", testId }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-desc` : undefined}
      data-testid={testId}
      className="m-auto max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl"
      style={{ width: `min(${width}, calc(100vw - 1.5rem))` }}
      onCancel={(e) => {
        e.preventDefault();
        if (closable) onClose();
      }}
      onClick={(e) => {
        if (closable && e.target === ref.current) onClose();
      }}
    >
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={`${id}-title`} className="font-serif text-xl">
              {title}
            </h2>
            {description && (
              <p id={`${id}-desc`} className="mt-1 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          {closable && (
            <button type="button" onClick={onClose} className={cls.iconButton} aria-label={`Close ${title}`}>
              <CloseIcon />
            </button>
          )}
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Keyboard shortcut label for this platform, e.g. "⌘K" or "Ctrl+K". */
export function shortcutLabel(keys: string): string {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return mac ? keys.replace(/Mod\+/g, "⌘").replace(/Shift\+/g, "⇧") : keys.replace(/Mod\+/g, "Ctrl+");
}
