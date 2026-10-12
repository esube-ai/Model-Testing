"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "./Icons";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({ text, label, showText = false }: { text: string; label: string; showText?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copy(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      aria-label={copied ? "Copied" : label}
      title={label}
      className="inline-flex items-center gap-1 rounded-md p-1.5 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {showText && <span>{copied ? "Copied" : "Copy"}</span>}
    </button>
  );
}
