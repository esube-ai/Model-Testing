"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ACCEPT } from "@/lib/rag/extract";
import { PaperclipIcon, SendIcon, StopIcon } from "./Icons";

interface Props {
  generating: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttach: (files: File[]) => void;
}

export function Composer({ generating, disabled, onSend, onStop, onAttach }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Grow with content, up to a limit.
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [text]);

  function submit() {
    if (generating || disabled || !text.trim()) return;
    onSend(text.trim());
    setText("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900"
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        data-testid="file-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onAttach(files);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        aria-label="Attach files"
        title="Attach files (PDF, Word, text)"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <PaperclipIcon />
      </button>
      <label htmlFor="composer" className="sr-only">
        Message
      </label>
      <textarea
        id="composer"
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={disabled ? "Set up a connection to start chatting" : "Message the model… (Enter to send, Shift+Enter for a new line)"}
        disabled={disabled}
        className="max-h-60 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-base text-zinc-900 placeholder:text-zinc-500 focus:outline-none disabled:cursor-not-allowed dark:text-zinc-100 dark:placeholder:text-zinc-400"
      />
      {generating ? (
        <button
          type="button"
          onClick={onStop}
          className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus:outline-none dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          <StopIcon /> Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
        >
          <SendIcon />
        </button>
      )}
    </form>
  );
}
