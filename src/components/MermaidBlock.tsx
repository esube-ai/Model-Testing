"use client";

import { useEffect, useState } from "react";
import { GraphicFrame } from "./GraphicFrame";

let counter = 0;

/**
 * Renders a ```mermaid diagram. Mermaid is large, so it is loaded only when a diagram
 * appears, and only once the reply has finished streaming. "strict" security mode
 * sanitizes labels and disables click handlers/scripts in diagrams. Diagrams sit on a light
 * panel in both colour schemes, so the default theme is used.
 */
export function MermaidBlock({ code, streaming }: { code: string; streaming: boolean }) {
  const [result, setResult] = useState<{ code: string; svg: string | null } | null>(null);

  useEffect(() => {
    if (streaming) return;
    let cancelled = false;
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
        await mermaid.parse(code);
        const { svg } = await mermaid.render(`mermaid-${++counter}`, code);
        if (!cancelled) setResult({ code, svg });
      } catch {
        if (!cancelled) setResult({ code, svg: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, streaming]);

  const ready = result && result.code === code;
  if (streaming || !ready || !result.svg) {
    return (
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {ready && !result.svg ? "mermaid — couldn't draw this diagram, showing its code" : "mermaid diagram"}
        </div>
        <pre className="overflow-x-auto p-3 text-sm">
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  return (
    <GraphicFrame label="mermaid diagram" code={code}>
      <div className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full" data-testid="mermaid" dangerouslySetInnerHTML={{ __html: result.svg }} />
    </GraphicFrame>
  );
}
