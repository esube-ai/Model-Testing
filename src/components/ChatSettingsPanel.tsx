"use client";

import { useId, useState } from "react";
import type { ChatSettings } from "@/lib/client/conversations";

interface Props {
  settings: ChatSettings;
  onChange: (settings: ChatSettings) => void;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

export function ChatSettingsPanel({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  function numberOrNull(value: string, parse: (v: string) => number): number | null {
    if (value.trim() === "") return null;
    const n = parse(value);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <div className="mb-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {open ? "▾" : "▸"} Chat settings
      </button>
      {open && (
        <div id={`${id}-panel`} className="mt-2 grid gap-4 rounded-xl border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-700">
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-system`} className="block text-sm font-medium">
              System prompt
            </label>
            <textarea
              id={`${id}-system`}
              rows={3}
              value={settings.systemPrompt}
              onChange={(e) => onChange({ ...settings, systemPrompt: e.target.value })}
              placeholder="e.g. You are a friendly assistant for our support team."
              className={inputClass}
            />
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Background instructions the model follows for the whole chat.</p>
          </div>
          <div>
            <label htmlFor={`${id}-temp`} className="block text-sm font-medium">
              Temperature
            </label>
            <input
              id={`${id}-temp`}
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={settings.temperature ?? ""}
              placeholder="Default"
              onChange={(e) => onChange({ ...settings, temperature: numberOrNull(e.target.value, parseFloat) })}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Lower (0) = focused and predictable; higher (1+) = more creative. Blank uses the default.</p>
          </div>
          <div>
            <label htmlFor={`${id}-max`} className="block text-sm font-medium">
              Max tokens
            </label>
            <input
              id={`${id}-max`}
              type="number"
              min={1}
              step={1}
              value={settings.maxTokens ?? ""}
              placeholder="Default"
              onChange={(e) => onChange({ ...settings, maxTokens: numberOrNull(e.target.value, (v) => parseInt(v, 10)) })}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">The longest reply allowed (roughly ¾ of a word per token). Blank uses the default.</p>
          </div>
        </div>
      )}
    </div>
  );
}
