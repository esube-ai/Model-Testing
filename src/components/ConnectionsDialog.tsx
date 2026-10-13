"use client";

import { useId, useState } from "react";
import type { ApiFormat, ConnectionField, HarnessErrorJSON } from "@/lib/harness";
import { ApiError, listModelsApi, testConnectionApi } from "@/lib/client/api";
import { FORMAT_OPTIONS, hostOf, isHttpUrl, type ConnectionsState, type ProviderConnection } from "@/lib/client/connections";
import { newId } from "@/lib/client/ids";
import { CloseIcon, EyeIcon, EyeOffIcon, PlusIcon } from "./Icons";
import { cls, Modal } from "./ui";

export type ConnectionStatus = "unknown" | "ok" | "error";

interface Props {
  state: ConnectionsState;
  statuses: Record<string, ConnectionStatus>;
  storageAvailable: boolean;
  /** Start straight in the "add connection" form (first launch). */
  onboarding: boolean;
  /** Open this connection's form directly. */
  editId?: string;
  onSave: (state: ConnectionsState) => void;
  onStatus: (connectionId: string, status: ConnectionStatus) => void;
  onClearAll: () => void;
  onClose: () => void;
}

const FIELD_LABEL: Record<ConnectionField, string> = { baseUrl: "API base URL", apiKey: "API key", format: "API format", model: "Model name" };
const URL_PLACEHOLDER: Record<ApiFormat, string> = { openai: "https://api.example.com/v1", anthropic: "https://api.anthropic.com" };
const MODEL_PLACEHOLDER: Record<ApiFormat, string> = { openai: "e.g. gpt-4o-mini or llama-3.1-8b-instruct", anthropic: "e.g. claude-sonnet-5-5" };

const dot: Record<ConnectionStatus, string> = { ok: "bg-green-600", error: "bg-red-600", unknown: "bg-zinc-400" };
const statusText: Record<ConnectionStatus, string> = { ok: "Connected", error: "Problem", unknown: "Not tested" };

export function ConnectionsDialog(props: Props) {
  const { state, statuses, onboarding, onSave, onClose, onClearAll } = props;
  const initial = props.editId ? state.connections.find((c) => c.id === props.editId) ?? null : null;
  const [editing, setEditing] = useState<ProviderConnection | "new" | null>(onboarding ? "new" : initial);
  const closable = !onboarding || state.connections.length > 0;

  function saveConnection(conn: ProviderConnection, remember: boolean) {
    const exists = state.connections.some((c) => c.id === conn.id);
    const connections = exists ? state.connections.map((c) => (c.id === conn.id ? conn : c)) : [...state.connections, conn];
    onSave({ remember, connections });
    // Opened for a single connection (onboarding, or from an error card): done after saving.
    if (onboarding || props.editId) onClose();
    else setEditing(null);
  }

  if (editing) {
    return (
      <Modal
        title={editing === "new" ? (state.connections.length ? "Add a connection" : "Connect a model") : `Edit ${editing.name}`}
        description={
          state.connections.length === 0
            ? "Welcome! Enter the details your model provider gave you to get started."
            : "Connection details for a model provider. You can add as many as you like."
        }
        closable={closable}
        onClose={() => (onboarding || props.editId ? onClose() : setEditing(null))}
        width="34rem"
        testId="connection-dialog"
      >
        <ConnectionForm
          initial={editing === "new" ? null : editing}
          remember={state.remember}
          storageAvailable={props.storageAvailable}
          onSave={saveConnection}
          onStatus={props.onStatus}
          onCancel={state.connections.length && !onboarding && !props.editId ? () => setEditing(null) : undefined}
        />
      </Modal>
    );
  }

  return (
    <Modal title="Connections" description="Model providers this app can talk to. Pick between their models in the message box." onClose={onClose} width="36rem" testId="connection-dialog">
      <ul className="space-y-2" data-testid="connection-list">
        {state.connections.map((c) => {
          const status = statuses[c.id] ?? "unknown";
          return (
            <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[status]}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted">
                  {hostOf(c.baseUrl)} · {FORMAT_OPTIONS.find((f) => f.value === c.format)?.label} · {c.models.length} {c.models.length === 1 ? "model" : "models"} · {statusText[status]}
                </p>
              </div>
              <button type="button" className={cls.secondary} onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                Edit
              </button>
              <button
                type="button"
                className={cls.iconButton}
                aria-label={`Delete ${c.name}`}
                onClick={() => {
                  if (window.confirm(`Remove the connection “${c.name}” and its key from this browser?`)) {
                    onSave({ ...state, connections: state.connections.filter((x) => x.id !== c.id) });
                  }
                }}
              >
                <CloseIcon />
              </button>
            </li>
          );
        })}
        {state.connections.length === 0 && <li className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No connections yet.</li>}
      </ul>
      <button type="button" className={`${cls.secondary} mt-3 w-full`} onClick={() => setEditing("new")}>
        <PlusIcon /> Add connection
      </button>

      <div className="mt-5 space-y-3 border-t border-line pt-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={state.remember} onChange={(e) => onSave({ ...state, remember: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          Remember on this device
        </label>
        <p className={`text-xs ${state.remember ? "font-medium text-amber-800 dark:text-amber-300" : "text-muted"}`}>
          {state.remember
            ? "Your keys are kept in this browser — anyone using this browser could see them."
            : "Off: keys are forgotten when you close this tab. On: anyone using this browser could see them."}
        </p>
        {state.connections.length > 0 && (
          <div>
            <button type="button" className={cls.danger} onClick={onClearAll}>
              Clear saved connections
            </button>
            <p className={cls.hint}>Removes every saved key and connection from this browser.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

type TestState = { status: "idle" } | { status: "testing" } | { status: "ok"; latencyMs: number } | { status: "error"; error: HarnessErrorJSON };
type ModelsState = { status: "idle" } | { status: "loading" } | { status: "loaded"; models: string[] } | { status: "unavailable"; reason: string };

interface FormProps {
  initial: ProviderConnection | null;
  remember: boolean;
  storageAvailable: boolean;
  onSave: (conn: ProviderConnection, remember: boolean) => void;
  onStatus: (connectionId: string, status: ConnectionStatus) => void;
  onCancel?: () => void;
}

function ConnectionForm({ initial, remember: initialRemember, storageAvailable, onSave, onStatus, onCancel }: FormProps) {
  const ids = useId();
  const [id] = useState(initial?.id ?? newId());
  const [name, setName] = useState(initial?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [urlTouched, setUrlTouched] = useState(false);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [format, setFormat] = useState<ApiFormat>(initial?.format ?? "openai");
  const [models, setModels] = useState<string[]>(initial?.models ?? []);
  const [typed, setTyped] = useState("");
  const [remember, setRemember] = useState(initialRemember);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [available, setAvailable] = useState<ModelsState>({ status: "idle" });
  const [filter, setFilter] = useState("");

  const urlValid = isHttpUrl(baseUrl);
  const urlError = urlTouched && baseUrl.trim() !== "" && !urlValid ? "Enter a web address starting with https:// (or http://)." : null;
  const badField = test.status === "error" ? test.error.field : undefined;
  /** Models including one typed but not yet added with the Add button. */
  const allModels = typed.trim() && !models.includes(typed.trim()) ? [...models, typed.trim()] : models;
  const canTest = urlValid && allModels.length > 0 && test.status !== "testing";
  const current = (): ProviderConnection => ({ id, name: name.trim() || hostOf(baseUrl.trim()), baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), format, models: allModels });

  const invalidate = () => setTest({ status: "idle" });

  function addModel(m: string) {
    const v = m.trim();
    if (v && !models.includes(v)) setModels([...models, v]);
    setTyped("");
    invalidate();
  }
  function toggleModel(m: string) {
    setModels(models.includes(m) ? models.filter((x) => x !== m) : [...models, m]);
    invalidate();
  }

  async function runTest() {
    setUrlTouched(true);
    if (!canTest) return;
    setTest({ status: "testing" });
    const conn = current();
    const result = await testConnectionApi({ baseUrl: conn.baseUrl, apiKey: conn.apiKey, format, model: conn.models[0] });
    setTest(result.ok ? { status: "ok", latencyMs: result.latencyMs } : { status: "error", error: result.error });
    if (initial) onStatus(id, result.ok ? "ok" : "error");
  }

  async function loadModels() {
    setUrlTouched(true);
    if (!urlValid) return;
    setAvailable({ status: "loading" });
    try {
      const list = await listModelsApi({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), format, model: "" });
      if (list && list.length) {
        setAvailable({ status: "loaded", models: list });
        if (models.length === 0) setModels([list[0]]);
        invalidate();
      } else {
        setAvailable({ status: "unavailable", reason: "This provider doesn't share a list of models. Type the model name instead." });
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.error.message : "Something went wrong.";
      setAvailable({ status: "unavailable", reason: `Couldn't load models: ${message} You can type the model name instead.` });
    }
  }

  function save(tested: boolean) {
    const conn = current();
    onStatus(id, tested ? "ok" : "unknown");
    onSave(conn, remember);
  }

  const border = (field: ConnectionField, extraBad = false) => (extraBad || badField === field ? "border-red-600 dark:border-red-400" : "");
  const hint = (key: string, text: string) => (
    <p id={`${ids}-${key}-hint`} className={cls.hint}>
      {text}
    </p>
  );
  const shown = available.status === "loaded" ? available.models.filter((m) => m.toLowerCase().includes(filter.toLowerCase())) : [];

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (test.status === "ok") save(true);
      }}
    >
      <div>
        <label htmlFor={`${ids}-name`} className={cls.label}>
          Name <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={baseUrl ? hostOf(baseUrl) : "e.g. OpenAI or Office server"} className={`mt-1 ${cls.input}`} />
        {hint("name", "How this connection is labelled in the model picker.")}
      </div>

      <div>
        <label htmlFor={`${ids}-url`} className={cls.label}>
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
          onChange={(e) => {
            setBaseUrl(e.target.value);
            invalidate();
          }}
          onBlur={() => setUrlTouched(true)}
          aria-invalid={!!urlError || badField === "baseUrl"}
          aria-describedby={`${ids}-url-hint${urlError ? ` ${ids}-url-error` : ""}`}
          className={`mt-1 ${cls.input} ${border("baseUrl", !!urlError)}`}
        />
        {urlError && (
          <p id={`${ids}-url-error`} className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">
            {urlError}
          </p>
        )}
        {hint("url", "The web address your model provider gave you.")}
      </div>

      <div>
        <label htmlFor={`${ids}-key`} className={cls.label}>
          API key
        </label>
        <div className="relative mt-1">
          <input
            id={`${ids}-key`}
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              invalidate();
            }}
            aria-invalid={badField === "apiKey"}
            aria-describedby={`${ids}-key-hint`}
            className={`${cls.input} pr-11 ${border("apiKey")}`}
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            aria-label={showKey ? "Hide API key" : "Show API key"}
            aria-pressed={showKey}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {showKey ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {hint("key", "The secret password-like code from your provider's dashboard. Leave blank if none is needed.")}
      </div>

      <div>
        <label htmlFor={`${ids}-format`} className={cls.label}>
          API format
        </label>
        <select
          id={`${ids}-format`}
          value={format}
          onChange={(e) => {
            setFormat(e.target.value as ApiFormat);
            setAvailable({ status: "idle" });
            invalidate();
          }}
          aria-invalid={badField === "format"}
          aria-describedby={`${ids}-format-hint`}
          className={`mt-1 ${cls.input} ${border("format")}`}
        >
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {hint("format", "How the provider expects to be spoken to. Most use OpenAI-compatible; pick Anthropic for Anthropic's API.")}
      </div>

      <fieldset>
        <legend className={cls.label}>Models</legend>
        {models.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Models in the picker">
            {models.map((m) => (
              <li key={m} className="flex items-center gap-1 rounded-full bg-raised py-0.5 pr-1 pl-3 text-sm">
                {m}
                <button type="button" className={cls.iconButton} onClick={() => toggleModel(m)} aria-label={`Remove model ${m}`}>
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex gap-2">
          <label htmlFor={`${ids}-model`} className="sr-only">
            Model name
          </label>
          <input
            id={`${ids}-model`}
            value={typed}
            autoComplete="off"
            spellCheck={false}
            placeholder={MODEL_PLACEHOLDER[format]}
            onChange={(e) => {
              setTyped(e.target.value);
              invalidate();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addModel(typed);
              }
            }}
            aria-invalid={badField === "model"}
            aria-describedby={`${ids}-model-hint`}
            className={`min-w-0 ${cls.input} ${border("model")}`}
          />
          <button type="button" className={cls.secondary} onClick={() => addModel(typed)} disabled={!typed.trim()}>
            Add
          </button>
          <button type="button" className={cls.secondary} onClick={loadModels} disabled={available.status === "loading"}>
            {available.status === "loading" ? "Loading…" : "Load models"}
          </button>
        </div>
        {available.status === "unavailable" && <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{available.reason}</p>}
        {available.status === "loaded" && (
          <div className="mt-2 rounded-lg border border-line">
            {available.models.length > 8 && (
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter models…" aria-label="Filter models" className="w-full rounded-t-lg border-b border-line bg-surface px-3 py-2 text-sm focus:outline-none" />
            )}
            <ul className="max-h-48 overflow-y-auto p-1" aria-label="Available models">
              {shown.map((m) => (
                <li key={m}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-raised">
                    <input type="checkbox" checked={models.includes(m)} onChange={() => toggleModel(m)} className="h-4 w-4 accent-[var(--accent)]" />
                    {m}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {hint("model", "Which models to offer in the picker. Click “Load models” to choose from your provider's list, or type a name and press Add.")}
      </fieldset>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Remember on this device
        </label>
        <p className={`mt-1 text-xs ${remember ? "font-medium text-amber-800 dark:text-amber-300" : "text-muted"}`}>
          {remember
            ? "Your keys will be kept in this browser — anyone using this browser could see them."
            : "Off: keys are forgotten when you close this tab. On: anyone using this browser could see them."}
        </p>
        {!storageAvailable && <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">Your browser is blocking storage, so connections will only last until you reload the page.</p>}
      </div>

      <div role="status" aria-live="polite" className="min-h-[1.25rem]">
        {test.status === "testing" && <p className="text-sm text-muted">Testing connection…</p>}
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
                <p className="mt-1 text-xs break-words">{test.error.detail}</p>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={runTest} disabled={!canTest} className={cls.secondary}>
            Test connection
          </button>
          <button type="submit" disabled={test.status !== "ok"} className={cls.primary}>
            Save
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="px-2 text-sm text-muted hover:text-ink">
              Cancel
            </button>
          )}
        </div>
        <button type="button" onClick={() => save(false)} disabled={!urlValid || allModels.length === 0} className="text-sm text-accent underline disabled:cursor-not-allowed disabled:opacity-50">
          Save anyway
        </button>
      </div>
    </form>
  );
}
