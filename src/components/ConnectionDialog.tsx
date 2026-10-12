"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ApiFormat, ConnectionField, HarnessErrorJSON } from "@/lib/harness";
import { FORMAT_OPTIONS, isHttpUrl, type SavedConnection } from "@/lib/client/connection";
import { ApiError, listModelsApi, testConnectionApi } from "@/lib/client/api";
import { CloseIcon, EyeIcon, EyeOffIcon } from "./Icons";

interface Props {
  initial: SavedConnection | null;
  canClose: boolean;
  storageAvailable: boolean;
  onSave: (connection: SavedConnection, tested: boolean) => void;
  onClose: () => void;
  onClear: () => void;
}

type TestState = { status: "idle" } | { status: "testing" } | { status: "ok"; latencyMs: number } | { status: "error"; error: HarnessErrorJSON };
type ModelsState = { status: "idle" } | { status: "loading" } | { status: "loaded"; models: string[] } | { status: "unavailable"; reason: string };

const FIELD_LABEL: Record<ConnectionField, string> = {
  baseUrl: "API base URL",
  apiKey: "API key",
  format: "API format",
  model: "Model name",
};

const URL_PLACEHOLDER: Record<ApiFormat, string> = {
  openai: "https://api.example.com/v1",
  anthropic: "https://api.anthropic.com",
};

const MODEL_PLACEHOLDER: Record<ApiFormat, string> = {
  openai: "e.g. gpt-4o-mini or llama-3.1-8b-instruct",
  anthropic: "e.g. claude-sonnet-5-5",
};

const inputClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400";
const borderOk = "border-zinc-300 dark:border-zinc-600";
const borderBad = "border-red-600 dark:border-red-400";

export function ConnectionDialog({ initial, canClose, storageAvailable, onSave, onClose, onClear }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const ids = useId();
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [urlTouched, setUrlTouched] = useState(false);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [format, setFormat] = useState<ApiFormat>(initial?.format ?? "openai");
  const [model, setModel] = useState(initial?.model ?? "");
  const [manualModel, setManualModel] = useState(false);
  const [remember, setRemember] = useState(initial?.remember ?? false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [models, setModels] = useState<ModelsState>({ status: "idle" });

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const urlValid = isHttpUrl(baseUrl);
  const urlError = urlTouched && baseUrl.trim() !== "" && !urlValid ? "Enter a web address starting with https:// (or http://)." : null;
  const canTest = urlValid && model.trim() !== "" && test.status !== "testing";
  const badField = test.status === "error" ? test.error.field : undefined;
  const current = (): SavedConnection => ({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), format, model: model.trim(), remember });

  // Any change to the connection invalidates the last test.
  function changed<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setTest({ status: "idle" });
    };
  }
  const changeUrl = changed(setBaseUrl);
  const changeKey = changed(setApiKey);
  const changeModel = changed(setModel);
  const changeFormat = changed((v: ApiFormat) => {
    setFormat(v);
    setModels({ status: "idle" });
  });

  async function runTest() {
    setUrlTouched(true);
    if (!canTest) return;
    setTest({ status: "testing" });
    const result = await testConnectionApi(current());
    setTest(result.ok ? { status: "ok", latencyMs: result.latencyMs } : { status: "error", error: result.error });
  }

  async function loadModels() {
    setUrlTouched(true);
    if (!urlValid) return;
    setModels({ status: "loading" });
    try {
      const list = await listModelsApi(current());
      if (list && list.length) {
        setModels({ status: "loaded", models: list });
        setManualModel(false);
        if (!list.includes(model.trim())) changeModel(list[0]);
      } else {
        setModels({ status: "unavailable", reason: "This provider doesn't share a list of models. Type the model name instead." });
        setManualModel(true);
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.error.message : "Something went wrong.";
      setModels({ status: "unavailable", reason: `Couldn't load models: ${message} You can type the model name instead.` });
      setManualModel(true);
    }
  }

  const hint = (id: string, text: string) => (
    <p id={`${ids}-${id}-hint`} className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
      {text}
    </p>
  );
  const showSelect = models.status === "loaded" && !manualModel;

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${ids}-title`}
      className="m-auto w-[min(32rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl bg-white p-0 text-zinc-900 shadow-xl dark:bg-zinc-900 dark:text-zinc-100"
      onCancel={(e) => {
        e.preventDefault();
        if (canClose) onClose();
      }}
    >
      <form
        className="space-y-5 p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (test.status === "ok") onSave(current(), true);
        }}
        noValidate
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={`${ids}-title`} className="text-lg font-semibold">
              Connection
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {canClose ? "Connection details for the model you're testing." : "Welcome! Enter the details your model provider gave you to get started."}
            </p>
          </div>
          {canClose && (
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:hover:bg-zinc-800" aria-label="Close connection settings">
              <CloseIcon />
            </button>
          )}
        </div>

        <div>
          <label htmlFor={`${ids}-url`} className="block text-sm font-medium">
            API base URL
          </label>
          <input
            id={`${ids}-url`}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={baseUrl}
            placeholder={URL_PLACEHOLDER[format]}
            onChange={(e) => changeUrl(e.target.value)}
            onBlur={() => setUrlTouched(true)}
            aria-invalid={!!urlError || badField === "baseUrl"}
            aria-describedby={`${ids}-url-hint ${urlError ? `${ids}-url-error` : ""}`}
            className={`mt-1 ${inputClass} ${urlError || badField === "baseUrl" ? borderBad : borderOk}`}
          />
          {urlError && (
            <p id={`${ids}-url-error`} className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">
              {urlError}
            </p>
          )}
          {hint("url", "The web address your model provider gave you.")}
        </div>

        <div>
          <label htmlFor={`${ids}-key`} className="block text-sm font-medium">
            API key
          </label>
          <div className="relative mt-1">
            <input
              id={`${ids}-key`}
              type={showKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => changeKey(e.target.value)}
              aria-invalid={badField === "apiKey"}
              aria-describedby={`${ids}-key-hint`}
              className={`${inputClass} pr-11 ${badField === "apiKey" ? borderBad : borderOk}`}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              aria-label={showKey ? "Hide API key" : "Show API key"}
              aria-pressed={showKey}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-zinc-600 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {showKey ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {hint("key", "The secret password-like code from your provider's dashboard. Leave blank if none is needed.")}
        </div>

        <div>
          <label htmlFor={`${ids}-format`} className="block text-sm font-medium">
            API format
          </label>
          <select
            id={`${ids}-format`}
            value={format}
            onChange={(e) => changeFormat(e.target.value as ApiFormat)}
            aria-invalid={badField === "format"}
            aria-describedby={`${ids}-format-hint`}
            className={`mt-1 ${inputClass} ${badField === "format" ? borderBad : borderOk}`}
          >
            {FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hint("format", "How the provider expects to be spoken to. Most use OpenAI-compatible; pick Anthropic for Anthropic's API.")}
        </div>

        <div>
          <label htmlFor={`${ids}-model`} className="block text-sm font-medium">
            Model name
          </label>
          <div className="mt-1 flex gap-2">
            {showSelect ? (
              <select
                id={`${ids}-model`}
                value={model}
                onChange={(e) => changeModel(e.target.value)}
                aria-invalid={badField === "model"}
                aria-describedby={`${ids}-model-hint`}
                className={`${inputClass} min-w-0 ${badField === "model" ? borderBad : borderOk}`}
              >
                {models.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${ids}-model`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={model}
                placeholder={MODEL_PLACEHOLDER[format]}
                onChange={(e) => changeModel(e.target.value)}
                aria-invalid={badField === "model"}
                aria-describedby={`${ids}-model-hint`}
                className={`${inputClass} min-w-0 ${badField === "model" ? borderBad : borderOk}`}
              />
            )}
            <button
              type="button"
              onClick={loadModels}
              disabled={models.status === "loading"}
              className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none disabled:opacity-60 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              {models.status === "loading" ? "Loading…" : "Load models"}
            </button>
          </div>
          {models.status === "unavailable" && <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{models.reason}</p>}
          {models.status === "loaded" && (
            <button type="button" onClick={() => setManualModel((m) => !m)} className="mt-1 text-xs text-blue-700 underline dark:text-blue-300">
              {manualModel ? "Choose from the list" : "Type a different name"}
            </button>
          )}
          {hint("model", "Which model to chat with. Click “Load models” to pick from a list, or type its name.")}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-zinc-400 accent-blue-600" />
            Remember on this device
          </label>
          <p className={`mt-1 text-xs ${remember ? "font-medium text-amber-800 dark:text-amber-300" : "text-zinc-600 dark:text-zinc-400"}`}>
            {remember
              ? "Your key will be kept in this browser — anyone using this browser could see it."
              : "Off: the key is forgotten when you close this tab. On: anyone using this browser could see it."}
          </p>
          {!storageAvailable && (
            <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">
              Your browser is blocking storage, so this connection will only last until you reload the page.
            </p>
          )}
        </div>

        <div role="status" aria-live="polite" className="min-h-[1.25rem]">
          {test.status === "testing" && <p className="text-sm text-zinc-700 dark:text-zinc-300">Testing connection…</p>}
          {test.status === "ok" && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
              ✓ Connected! The model replied in {(test.latencyMs / 1000).toFixed(1)}s. You can save now.
            </p>
          )}
          {test.status === "error" && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300" data-testid="connection-error">
              <p className="font-medium">{test.error.message}</p>
              {test.error.field && <p className="mt-1">Likely problem: the {FIELD_LABEL[test.error.field]} field.</p>}
              {test.error.detail && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs">Technical details</summary>
                  <p className="mt-1 break-words text-xs">{test.error.detail}</p>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runTest}
              disabled={!canTest}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              Test connection
            </button>
            <button
              type="submit"
              disabled={test.status !== "ok"}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
            >
              Save
            </button>
          </div>
          <button
            type="button"
            onClick={() => onSave(current(), false)}
            disabled={!urlValid || !model.trim()}
            className="text-sm text-blue-700 underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300"
          >
            Save anyway
          </button>
        </div>

        {initial && (
          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 focus:outline-none dark:text-red-400 dark:hover:bg-red-950"
            >
              Clear saved connection
            </button>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Removes the saved key and connection details from this browser.</p>
          </div>
        )}
      </form>
    </dialog>
  );
}
