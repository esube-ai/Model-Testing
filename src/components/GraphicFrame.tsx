"use client";

import { useState, type ReactNode } from "react";
import { CopyButton } from "./CopyButton";

/** A graphic with a "Show code" toggle; used for SVG and Mermaid diagrams. */
export function GraphicFrame({ label, code, children }: { label: string; code: string; children: ReactNode }) {
  const [showCode, setShowCode] = useState(false);
  return (
    <figure className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700" data-testid="graphic">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => setShowCode((s) => !s)} className="rounded-md px-2 py-1 hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:hover:bg-zinc-800">
            {showCode ? "Show image" : "Show code"}
          </button>
          <CopyButton text={code} label="Copy code" showText />
        </span>
      </div>
      {showCode ? (
        <pre className="overflow-x-auto p-3 text-sm">
          <code>{code}</code>
        </pre>
      ) : (
        <div className="overflow-x-auto bg-white p-3 dark:bg-zinc-100">{children}</div>
      )}
    </figure>
  );
}
