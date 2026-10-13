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
      className="inline-flex items-center gap-1 rounded-md p-1.5 text-muted hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus:outline-none"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {showText && <span>{copied ? "Copied" : "Copy"}</span>}
    </button>
  );
}
