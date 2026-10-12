"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, streamChatApi } from "@/lib/client/api";
import { clearConnection, connectionLabel, hostOf, loadConnection, saveConnection, type SavedConnection } from "@/lib/client/connection";
import {
  loadConversations,
  newConversation,
  newId,
  saveConversations,
  titleFrom,
  type ChatSettings,
  type Conversation,
  type Message,
} from "@/lib/client/conversations";
import { conversationToJson, conversationToMarkdown, download, safeFilename } from "@/lib/client/export";
import { remove, writeJson } from "@/lib/client/storage";
import { ChatSettingsPanel } from "./ChatSettingsPanel";
import { Composer } from "./Composer";
import { ConnectionDialog } from "./ConnectionDialog";
import { DownloadIcon, GearIcon, MenuIcon } from "./Icons";
import { MessageItem } from "./MessageItem";
import { Sidebar } from "./Sidebar";

type Status = "unknown" | "ok" | "error";

const EXAMPLE_PROMPTS = [
  "Explain what a large language model is, in simple terms.",
  "Write a short, friendly email asking a colleague for feedback on a draft.",
  "Give me five ideas for a team lunch that work for vegetarians.",
  "Write a Python function that checks whether a word is a palindrome.",
];

function probeStorage(): boolean {
  const ok = writeJson("session", "model-testing.probe", 1);
  remove("session", "model-testing.probe");
  return ok;
}

function initialState() {
  const connection = loadConnection();
  const stored = loadConversations();
  const conversations = stored.length ? stored : [newConversation()];
  const latest = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return { connection, conversations, activeId: latest.id, storageAvailable: probeStorage() };
}

export function ChatApp() {
  const [init] = useState(initialState);
  const [connection, setConnection] = useState<SavedConnection | null>(init.connection);
  const [storageAvailable, setStorageAvailable] = useState(init.storageAvailable);
  // Opens automatically when no connection is saved (onboarding).
  const [dialog, setDialog] = useState({ open: !init.connection, key: 0 });
  const [status, setStatus] = useState<Status>("unknown");
  const [conversations, setConversations] = useState<Conversation[]>(init.conversations);
  const [activeId, setActiveId] = useState(init.activeId);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const exportRef = useRef<HTMLDetailsElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const generating = generatingId !== null;

  // Persist conversations (never credentials): immediately when idle, at most once a second
  // while a reply is streaming, and when the page is being closed or reloaded.
  const lastSave = useRef(0);
  const latest = useRef(conversations);
  useEffect(() => {
    latest.current = conversations;
    const save = () => {
      lastSave.current = Date.now();
      saveConversations(conversations);
    };
    if (!generating) return save();
    const t = setTimeout(save, Math.max(0, 1000 - (Date.now() - lastSave.current)));
    return () => clearTimeout(t);
  }, [conversations, generating]);
  useEffect(() => {
    const onHide = () => saveConversations(latest.current);
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // Keep the newest content in view if the user is already near the bottom.
  const lastContent = active?.messages.at(-1)?.content;
  useEffect(() => {
    const el = threadRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 200) el.scrollTop = el.scrollHeight;
  }, [lastContent, active?.messages.length]);

  const openDialog = useCallback(() => setDialog((d) => ({ open: true, key: d.key + 1 })), []);

  const updateConv = (id: string, fn: (c: Conversation) => Conversation) =>
    setConversations((list) => list.map((c) => (c.id === id ? fn(c) : c)));
  const updateMsg = (convId: string, msgId: string, fn: (m: Message) => Message) =>
    updateConv(convId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)) }));

  async function generate(conv: Conversation, history: Message[]) {
    if (!connection) return openDialog();
    const now = new Date().toISOString();
    const assistant: Message = {
      id: newId(),
      role: "assistant",
      content: "",
      createdAt: now,
      feedback: null,
      model: connection.model,
      host: hostOf(connection.baseUrl),
    };
    updateConv(conv.id, (c) => ({ ...c, messages: [...history, assistant], updatedAt: now }));

    const controller = new AbortController();
    abortRef.current = controller;
    setGeneratingId(assistant.id);
    const payload = history.filter((m) => !m.error && (m.role === "user" || m.content)).map(({ role, content }) => ({ role, content }));
    const s = conv.settings;
    const options = {
      system: s.systemPrompt.trim() || undefined,
      temperature: s.temperature ?? undefined,
      maxTokens: s.maxTokens ?? undefined,
    };

    try {
      for await (const ev of streamChatApi(connection, payload, options, controller.signal)) {
        if (ev.type === "text") updateMsg(conv.id, assistant.id, (m) => ({ ...m, content: m.content + ev.text }));
        else updateMsg(conv.id, assistant.id, (m) => ({ ...m, metadata: ev.metadata, model: ev.metadata.model ?? m.model }));
      }
      setStatus("ok");
    } catch (e) {
      if (controller.signal.aborted) {
        updateMsg(conv.id, assistant.id, (m) => ({ ...m, stopped: true }));
      } else {
        const error =
          e instanceof ApiError
            ? { code: e.error.code, message: e.error.message, detail: e.error.detail, field: e.error.field }
            : { code: "network" as const, message: "The reply was interrupted. Please try again." };
        updateMsg(conv.id, assistant.id, (m) => ({ ...m, error }));
        setStatus("error");
      }
    } finally {
      abortRef.current = null;
      setGeneratingId(null);
    }
  }

  function send(text: string) {
    if (!active || generating) return;
    if (!connection) return openDialog();
    const user: Message = { id: newId(), role: "user", content: text, createdAt: new Date().toISOString() };
    // Drop a trailing error card: the user moved on.
    const kept = active.messages.filter((m, i) => !(m.error && i === active.messages.length - 1));
    const history = [...kept, user];
    const title = active.messages.length === 0 && active.title === "New chat" ? titleFrom(text) : active.title;
    updateConv(active.id, (c) => ({ ...c, title, messages: history }));
    void generate(active, history);
  }

  function lastUserIndex(c: Conversation) {
    for (let i = c.messages.length - 1; i >= 0; i--) if (c.messages[i].role === "user") return i;
    return -1;
  }

  function regenerate() {
    if (!active || generating) return;
    const idx = lastUserIndex(active);
    if (idx === -1) return;
    void generate(active, active.messages.slice(0, idx + 1));
  }

  function editLast(text: string) {
    if (!active || generating) return;
    const idx = lastUserIndex(active);
    if (idx === -1) return;
    const history = [...active.messages.slice(0, idx), { ...active.messages[idx], content: text, createdAt: new Date().toISOString() }];
    updateConv(active.id, (c) => ({ ...c, messages: history }));
    void generate(active, history);
  }

  function stop() {
    abortRef.current?.abort();
  }

  function newChat() {
    setSidebarOpen(false);
    if (active && active.messages.length === 0) {
      document.getElementById("composer")?.focus();
      return;
    }
    const c = newConversation(active?.settings);
    setConversations((list) => [c, ...list]);
    setActiveId(c.id);
  }

  function deleteConv(id: string) {
    if (generatingId && active?.id === id) stop();
    const rest = conversations.filter((c) => c.id !== id);
    if (rest.length === 0) {
      const c = newConversation();
      setConversations([c]);
      setActiveId(c.id);
    } else {
      setConversations(rest);
      if (id === activeId) setActiveId([...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].id);
    }
  }

  function updateSettings(settings: ChatSettings) {
    if (active) updateConv(active.id, (c) => ({ ...c, settings }));
  }

  function exportAs(kind: "md" | "json") {
    if (!active) return;
    exportRef.current?.removeAttribute("open");
    const lastAssistant = [...active.messages].reverse().find((m) => m.role === "assistant");
    const ctx = {
      model: lastAssistant?.model ?? connection?.model ?? "",
      host: lastAssistant?.host ?? (connection ? hostOf(connection.baseUrl) : ""),
    };
    const name = safeFilename(active.title);
    if (kind === "json") download(`${name}.json`, conversationToJson(active, ctx), "application/json");
    else download(`${name}.md`, conversationToMarkdown(active, ctx), "text/markdown");
  }

  function onSaveConnection(c: SavedConnection, tested: boolean) {
    setStorageAvailable(saveConnection(c));
    setConnection(c);
    setStatus(tested ? "ok" : "unknown");
    setDialog((d) => ({ ...d, open: false }));
  }

  function onClearConnection() {
    stop();
    clearConnection();
    setConnection(null);
    setStatus("unknown");
    openDialog();
  }

  const statusText = status === "ok" ? "Connected" : status === "error" ? "Connection problem" : connection ? "Not tested" : "Not connected";
  const dotClass = status === "ok" ? "bg-green-600" : status === "error" ? "bg-red-600" : "bg-zinc-400";
  const lastIdx = (active?.messages.length ?? 0) - 1;
  const lastUser = active ? lastUserIndex(active) : -1;

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={active?.id ?? null}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNew={newChat}
        onSelect={(id) => {
          setActiveId(id);
          setSidebarOpen(false);
        }}
        onRename={(id, title) => updateConv(id, (c) => ({ ...c, title }))}
        onDelete={deleteConv}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 hover:bg-zinc-100 md:hidden dark:hover:bg-zinc-800" aria-label="Open conversations">
            <MenuIcon />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" data-testid="connection-label" title={connection ? connectionLabel(connection) : undefined}>
              {connection ? connectionLabel(connection) : "No connection"}
            </p>
          </div>
          <button
            type="button"
            onClick={openDialog}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:hover:bg-zinc-800"
            aria-label={`Connection status: ${statusText}. Open connection settings`}
            data-testid="connection-status"
            data-status={status}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} aria-hidden="true" />
            <span className="hidden sm:inline">{statusText}</span>
          </button>
          <details ref={exportRef} className="relative shrink-0">
            <summary
              className="flex cursor-pointer list-none items-center gap-1 rounded-lg p-2 text-sm hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden"
              aria-label="Export conversation"
            >
              <DownloadIcon />
              <span className="hidden sm:inline">Export</span>
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              <button type="button" onClick={() => exportAs("md")} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Export as Markdown
              </button>
              <button type="button" onClick={() => exportAs("json")} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Export as JSON
              </button>
            </div>
          </details>
          <button type="button" onClick={openDialog} className="shrink-0 rounded-lg p-2 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none dark:hover:bg-zinc-800" aria-label="Connection settings" title="Connection settings">
            <GearIcon />
          </button>
        </header>

        <main ref={threadRef} className="flex-1 overflow-y-auto" aria-busy={generating}>
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {active && active.messages.length === 0 ? (
              <div className="py-10 text-center">
                <h1 className="text-2xl font-semibold">What would you like to try?</h1>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Type a message below, or start with one of these examples.</p>
                <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p)}
                      disabled={!connection}
                      className="rounded-xl border border-zinc-200 p-4 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              active?.messages.map((m, i) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  streaming={m.id === generatingId}
                  busy={generating}
                  canRegenerate={m.role === "assistant" && i === lastIdx}
                  canEdit={m.role === "user" && i === lastUser}
                  onFeedback={(v) => updateMsg(active.id, m.id, (msg) => ({ ...msg, feedback: msg.feedback === v ? null : v }))}
                  onRegenerate={regenerate}
                  onEdit={editLast}
                  onOpenConnection={openDialog}
                />
              ))
            )}
          </div>
        </main>

        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          {active && <ChatSettingsPanel key={active.id} settings={active.settings} onChange={updateSettings} />}
          <Composer generating={generating} disabled={!connection} onSend={send} onStop={stop} />
          {!storageAvailable && (
            <p className="mt-2 text-center text-xs text-amber-800 dark:text-amber-300">Your browser is blocking storage: chats and connection will be lost when you reload.</p>
          )}
        </div>
      </div>

      {dialog.open && (
        <ConnectionDialog
          key={dialog.key}
          initial={connection}
          canClose={!!connection}
          storageAvailable={storageAvailable}
          onSave={onSaveConnection}
          onClose={() => setDialog((d) => ({ ...d, open: false }))}
          onClear={onClearConnection}
        />
      )}
    </div>
  );
}
