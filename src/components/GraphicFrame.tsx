"use client";

import { useState, type ReactNode } from "react";
import { CopyButton } from "./CopyButton";

/** A graphic with a "Show code" toggle; used for SVG and Mermaid diagrams. */
export function GraphicFrame({ label, code, children }: { label: string; code: string; children: ReactNode }) {
  const [showCode, setShowCode] = useState(false);
  return (
    <figure className="overflow-hidden rounded-lg border border-line font-sans" data-testid="graphic">
      <div className="flex items-center justify-between border-b border-line px-3 py-1 text-xs text-muted">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => setShowCode((s) => !s)} className="rounded-md px-2 py-1 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent focus:outline-none">
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
        <div className="overflow-x-auto bg-white p-3">{children}</div>
      )}
    </figure>
  );
}
