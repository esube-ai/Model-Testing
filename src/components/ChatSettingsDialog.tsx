"use client";

import { useId } from "react";
import { Modal } from "./ui";
import type { ChatSettings } from "@/lib/client/conversations";

interface Props {
  settings: ChatSettings;
  onChange: (settings: ChatSettings) => void;
  onClose: () => void;
  /** Shown when the chat is in a project, whose instructions are added first. */
  projectName?: string;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function ChatSettingsDialog({ settings, onChange, onClose, projectName }: Props) {
  const id = useId();

  function numberOrNull(value: string, parse: (v: string) => number): number | null {
    if (value.trim() === "") return null;
    const n = parse(value);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <Modal title="Chat settings" description="These apply to this chat only." onClose={onClose} width="36rem" testId="settings-dialog">
      {projectName && <p className="mb-4 rounded-lg bg-raised px-3 py-2 text-sm">This chat is in the project “{projectName}”. The project&apos;s instructions are added before this chat&apos;s system prompt.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
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
            <p className="mt-1 text-xs text-muted">Background instructions the model follows for the whole chat.</p>
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
            <p className="mt-1 text-xs text-muted">Lower (0) = focused and predictable; higher (1+) = more creative. Blank uses the default.</p>
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
            <p className="mt-1 text-xs text-muted">The longest reply allowed (roughly ¾ of a word per token). Blank uses the default.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-embed`} className="block text-sm font-medium">
              Semantic search model (optional)
            </label>
            <input
              id={`${id}-embed`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={settings.embeddingModel ?? ""}
              placeholder="e.g. text-embedding-3-small"
              onChange={(e) => onChange({ ...settings, embeddingModel: e.target.value })}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-muted">
              For attached files. Blank uses keyword search. Enter your provider&apos;s embedding model to also match by meaning (OpenAI-compatible providers only).
            </p>
          </div>
        </div>
    </Modal>
  );
}
