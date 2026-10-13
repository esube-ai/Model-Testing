"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, ImagePart } from "@/lib/harness/types";
import { ApiError, streamChatApi } from "@/lib/client/api";
import {
  clearConnections,
  EMPTY_STATE,
  hostOf,
  loadConnections,
  modelLabel,
  resolveRef,
  saveConnections,
  validRefs,
  type ConnectionsState,
  type ModelRef,
} from "@/lib/client/connections";
import { loadConversations, newConversation, newId, saveConversations, titleFrom, type ChatSettings, type Conversation, type ImageRef, type Message } from "@/lib/client/conversations";
import { conversationToJson, conversationToMarkdown, download, safeFilename } from "@/lib/client/export";
import { historyFor, toTurns, type HistoryMessage } from "@/lib/client/history";
import { loadImageParts, savePicture } from "@/lib/client/images";
import { combinedSystemPrompt, loadProjects, newProject, projectScope, saveProjects, type Project } from "@/lib/client/projects";
import { loadPrompts, savePrompts, type SavedPrompt } from "@/lib/client/prompts";
import { readJson, remove, writeJson } from "@/lib/client/storage";
import { attachFile, FileError, fileStore, retrieveContext, type RagDoc, type RetrievalResult } from "@/lib/rag";
import { AttachmentBar, type PendingFile } from "./AttachmentBar";
import { ChatSettingsDialog } from "./ChatSettingsDialog";
import { Composer, type ComposerHandle } from "./Composer";
import { ConnectionsDialog, type ConnectionStatus } from "./ConnectionsDialog";
import { DownloadIcon, FolderIcon, LogoMark, MenuIcon, SlidersIcon } from "./Icons";
import { AssistantMessage, UserMessage } from "./MessageItem";
import { ModelPicker } from "./ModelPicker";
import { ProjectsList, ProjectView } from "./ProjectViews";
import { PromptLibraryDialog } from "./PromptLibraryDialog";
import { SearchDialog } from "./SearchDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { Sidebar } from "./Sidebar";
import { cls, useDismiss } from "./ui";

type View = { kind: "chat" } | { kind: "projects" } | { kind: "project"; id: string };
type Dialog =
  | null
  | { kind: "connections"; onboarding?: boolean; editId?: string }
  | { kind: "search" }
  | { kind: "prompts" }
  | { kind: "shortcuts" }
  | { kind: "settings" };

const LAST_MODELS_KEY = "model-testing.lastModels";
/** Pictures sent per request; older ones are replaced by a note to stay within size limits. */
const MAX_IMAGES_IN_REQUEST = 8;

const SUGGESTIONS = [
  { label: "Explain", prompt: "Explain what a large language model is, in simple terms." },
  { label: "Write", prompt: "Write a short, friendly email asking a colleague for feedback on a draft." },
  { label: "Brainstorm", prompt: "Give me five ideas for a team lunch that work for vegetarians." },
  { label: "Code", prompt: "Write a Python function that checks whether a word is a palindrome." },
];

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Working late?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function probeStorage(): boolean {
  const ok = writeJson("session", "model-testing.probe", 1);
  remove("session", "model-testing.probe");
  return ok;
}

const isWide = () => typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 768px)").matches;

function initialState() {
  const conns = loadConnections();
  const stored = loadConversations();
  const conversations = stored.length ? stored : [newConversation()];
  const latest = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    conns,
    conversations,
    activeId: latest.id,
    projects: loadProjects(),
    prompts: loadPrompts(),
    lastModels: readJson<ModelRef[]>("local", LAST_MODELS_KEY) ?? [],
    storageAvailable: probeStorage(),
    sidebarOpen: isWide(),
  };
}

/** Load pictures for the request, keeping only the most recent ones. */
async function toPayload(history: HistoryMessage[]): Promise<ChatMessage[]> {
  let budget = MAX_IMAGES_IN_REQUEST;
  const out: ChatMessage[] = new Array(history.length);
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    let images: ImagePart[] | undefined;
    let content = m.content;
    if (m.images?.length) {
      const take = m.images.slice(0, Math.max(0, budget));
      budget -= take.length;
      images = take.length ? await loadImageParts(take) : undefined;
      const omitted = m.images.length - (images?.length ?? 0);
      if (omitted > 0) content = `${content}${content ? "\n\n" : ""}[${omitted} earlier picture${omitted === 1 ? "" : "s"} not included]`;
    }
    out[i] = { role: m.role, content, ...(m.reasoning ? { reasoning: m.reasoning } : {}), ...(images?.length ? { images } : {}) };
  }
  return out;
}

export function ChatApp() {
  const [init] = useState(initialState);
  const [conns, setConns] = useState<ConnectionsState>(init.conns);
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({});
  const [storageAvailable, setStorageAvailable] = useState(init.storageAvailable);
  const [dialog, setDialog] = useState<Dialog>(init.conns.connections.length ? null : { kind: "connections", onboarding: true });
  const [conversations, setConversations] = useState<Conversation[]>(init.conversations);
  const [activeId, setActiveId] = useState(init.activeId);
  const [view, setView] = useState<View>({ kind: "chat" });
  const [projects, setProjects] = useState<Project[]>(init.projects);
  const [prompts, setPrompts] = useState<SavedPrompt[]>(init.prompts);
  const [lastModels, setLastModels] = useState<ModelRef[]>(init.lastModels);
  const [sidebarOpen, setSidebarOpen] = useState(init.sidebarOpen);
  const [generatingIds, setGeneratingIds] = useState<string[]>([]);
  const [files, setFiles] = useState<{ scope: string; docs: RagDoc[] }>({ scope: "", docs: [] });
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [filesPersistent, setFilesPersistent] = useState(true);
  const [dragging, setDragging] = useState(false);
  /** Id for a chat that will be started from a project page (its pictures are stored under it). */
  const [draftId, setDraftId] = useState(newId);
  const [exportOpen, setExportOpen] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const exportRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  /** The visible message box (a callback ref, so it can be used outside render). */
  const [composerHandle, setComposerHandle] = useState<ComposerHandle | null>(null);
  const closeExport = useCallback(() => setExportOpen(false), []);
  useDismiss(exportRef, exportOpen, closeExport);

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const activeRefs = useMemo(() => validRefs(conns, active?.models ?? lastModels), [conns, active?.models, lastModels]);
  const generating = generatingIds.length > 0;
  const openProject = view.kind === "project" ? projects.find((p) => p.id === view.id) : undefined;
  const chatProject = projects.find((p) => p.id === active?.projectId);
  const fileScope = view.kind === "project" ? projectScope(view.id) : view.kind === "chat" ? (active?.id ?? "") : "";
  const scopeFiles = files.scope === fileScope ? files.docs : [];
  const hasConnections = conns.connections.length > 0;

  // ---- persistence --------------------------------------------------------------------
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
  useEffect(() => void saveProjects(projects), [projects]);
  useEffect(() => void savePrompts(prompts), [prompts]);
  useEffect(() => void fileStore.isPersistent().then(setFilesPersistent), []);

  // ---- files for the current chat or project ------------------------------------------
  const latestScope = useRef(fileScope);
  const refreshFiles = useCallback(async (scope: string) => {
    const docs = await fileStore.listDocs(scope);
    if (scope === latestScope.current) setFiles({ scope, docs });
  }, []);
  useEffect(() => {
    latestScope.current = fileScope;
    if (fileScope) void refreshFiles(fileScope);
  }, [fileScope, refreshFiles]);

  // Keep the newest content in view if the user is already near the bottom.
  const lastContent = active?.messages.at(-1)?.content;
  useEffect(() => {
    const el = threadRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  }, [lastContent, active?.messages.length]);

  const updateConv = useCallback((id: string, fn: (c: Conversation) => Conversation) => setConversations((list) => list.map((c) => (c.id === id ? fn(c) : c))), []);
  const updateMsg = useCallback(
    (convId: string, msgId: string, fn: (m: Message) => Message) => updateConv(convId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)) })),
    [updateConv],
  );
  const setStatus = useCallback(
    (connectionId: string, status: ConnectionStatus) => setStatuses((s) => (s[connectionId] === status ? s : { ...s, [connectionId]: status })),
    [],
  );

  // ---- generation ---------------------------------------------------------------------
  /**
   * Generate replies to the user message at the end of `upTo`. `replies` is the final list
   * of replies for that turn: kept replies plus placeholders for the models in `toRun`.
   */
  async function generate(conv: Conversation, upTo: Message[], replies: Message[], toRun: { ref: ModelRef; id: string }[]) {
    const now = new Date().toISOString();
    updateConv(conv.id, (c) => ({ ...c, messages: [...upTo, ...replies], updatedAt: now }));
    const runIds = toRun.map((r) => r.id);
    const controller = new AbortController();
    runIds.forEach((id) => controllers.current.set(id, controller));
    setGeneratingIds((ids) => [...ids, ...runIds]);

    const user = upTo[upTo.length - 1];
    const project = projects.find((p) => p.id === conv.projectId);
    const s = conv.settings;
    const options = {
      system: combinedSystemPrompt(project, s.systemPrompt),
      temperature: s.temperature ?? undefined,
      maxTokens: s.maxTokens ?? undefined,
    };
    const forAll = (fn: (m: Message) => Message) => runIds.forEach((id) => updateMsg(conv.id, id, fn));

    // Search attached files once per message; every model answering it gets the same excerpts.
    let rag: RetrievalResult | null = null;
    try {
      const first = resolveRef(conns, toRun[0].ref);
      if (user.content && first) {
        rag = await retrieveContext(project ? [conv.id, projectScope(project.id)] : [conv.id], user.content, {
          connection: first.connection,
          embeddingModel: s.embeddingModel,
          signal: controller.signal,
          onStatus: (progress) => forAll((m) => ({ ...m, progress })),
        });
        const found = rag;
        if (found) forAll((m) => ({ ...m, sources: found.sources, notice: found.notice }));
      }
    } catch {
      if (!controller.signal.aborted) forAll((m) => ({ ...m, notice: "The attached files couldn't be read, so this answer doesn't use them." }));
    }
    forAll((m) => ({ ...m, progress: undefined }));

    await Promise.all(toRun.map(({ ref, id }) => runOne(conv.id, id, ref, upTo, rag, options, controller)));
    runIds.forEach((id) => controllers.current.delete(id));
    setGeneratingIds((ids) => ids.filter((x) => !runIds.includes(x)));
  }

  async function runOne(
    convId: string,
    msgId: string,
    ref: ModelRef,
    upTo: Message[],
    rag: RetrievalResult | null,
    options: { system?: string; temperature?: number; maxTokens?: number },
    controller: AbortController,
  ) {
    const resolved = resolveRef(conns, ref);
    try {
      if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
      if (!resolved) throw new ApiError({ code: "invalid_input", message: "This model's connection was removed. Choose another model and retry.", detail: "" });
      const payload = await toPayload(historyFor(upTo, ref));
      if (rag) payload[payload.length - 1] = { ...payload[payload.length - 1], content: rag.content };
      for await (const ev of streamChatApi(resolved.connection, payload, options, controller.signal)) {
        if (ev.type === "text") updateMsg(convId, msgId, (m) => ({ ...m, content: m.content + ev.text }));
        else if (ev.type === "reasoning") updateMsg(convId, msgId, (m) => ({ ...m, reasoning: (m.reasoning ?? "") + ev.text }));
        else updateMsg(convId, msgId, (m) => ({ ...m, metadata: ev.metadata }));
      }
      setStatus(ref.connectionId, "ok");
    } catch (e) {
      if (controller.signal.aborted) {
        updateMsg(convId, msgId, (m) => ({ ...m, stopped: true, progress: undefined }));
      } else {
        const error =
          e instanceof ApiError
            ? { code: e.error.code, message: e.error.message, detail: e.error.detail, field: e.error.field }
            : { code: "network" as const, message: "The reply was interrupted. Please try again." };
        updateMsg(convId, msgId, (m) => ({ ...m, error, progress: undefined }));
        if (resolved) setStatus(ref.connectionId, "error");
      }
    }
  }

  function placeholder(ref: ModelRef, turnId: string): Message {
    const source = conns.connections.find((c) => c.id === ref.connectionId);
    return {
      id: newId(),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      feedback: null,
      turnId,
      modelRef: ref,
      model: ref.model,
      host: source?.name,
    };
  }

  /** Start replies from every selected model to the user message ending `upTo`. */
  function replyAll(conv: Conversation, upTo: Message[], refs: ModelRef[]) {
    if (refs.length === 0) return setDialog({ kind: "connections" });
    const user = upTo[upTo.length - 1];
    const replies = refs.map((ref) => placeholder(ref, user.id));
    void generate(conv, upTo, replies, replies.map((r) => ({ ref: r.modelRef!, id: r.id })));
  }

  function send(text: string, images: ImageRef[], conv: Conversation | undefined = active) {
    if (!conv || generating) return;
    if (!hasConnections) return setDialog({ kind: "connections", onboarding: true });
    const refs = validRefs(conns, conv.models ?? lastModels);
    const user: Message = { id: newId(), role: "user", content: text, createdAt: new Date().toISOString(), ...(images.length ? { images } : {}) };
    // Drop a trailing failed reply: the user moved on.
    const kept = conv.messages.filter((m, i) => !(m.error && i === conv.messages.length - 1));
    const upTo = [...kept, user];
    const title = conv.messages.length === 0 && conv.title === "New chat" ? titleFrom(text || images[0]?.name || "Picture") : conv.title;
    const updated = { ...conv, title, models: refs };
    updateConv(conv.id, () => ({ ...updated, messages: upTo }));
    replyAll(updated, upTo, refs);
  }

  function lastUserIndex(c: Conversation) {
    for (let i = c.messages.length - 1; i >= 0; i--) if (c.messages[i].role === "user") return i;
    return -1;
  }

  /** Regenerate the last turn with the currently selected models. */
  function regenerateAll() {
    if (!active || generating) return;
    const idx = lastUserIndex(active);
    if (idx !== -1) replyAll(active, active.messages.slice(0, idx + 1), activeRefs);
  }

  /** Regenerate one Compare card in place. */
  function regenerateOne(reply: Message) {
    if (!active || generating) return;
    const idx = lastUserIndex(active);
    const ref = reply.modelRef ?? activeRefs[0];
    if (idx === -1 || !ref) return;
    const fresh = placeholder(ref, active.messages[idx].id);
    const replies = active.messages.slice(idx + 1).map((m) => (m.id === reply.id ? fresh : m));
    void generate(active, active.messages.slice(0, idx + 1), replies, [{ ref, id: fresh.id }]);
  }

  function editLast(text: string) {
    if (!active || generating) return;
    const idx = lastUserIndex(active);
    if (idx === -1) return;
    const upTo = [...active.messages.slice(0, idx), { ...active.messages[idx], content: text, createdAt: new Date().toISOString() }];
    replyAll(active, upTo, activeRefs);
  }

  const stop = useCallback(() => controllers.current.forEach((c) => c.abort()), []);

  function setModels(refs: ModelRef[]) {
    setLastModels(refs);
    writeJson("local", LAST_MODELS_KEY, refs);
    if (active) updateConv(active.id, (c) => ({ ...c, models: refs }));
  }

  // ---- conversations and projects -----------------------------------------------------
  const newChat = useCallback(() => {
    setView({ kind: "chat" });
    if (!isWide()) setSidebarOpen(false);
    const current = conversations.find((c) => c.id === activeId);
    const hasFiles = files.scope === current?.id && files.docs.length > 0;
    if (current && current.messages.length === 0 && !current.projectId && !hasFiles) {
      requestAnimationFrame(() => composerHandle?.focus());
      return;
    }
    const c = newConversation(current?.settings, { models: validRefs(conns, lastModels) });
    setConversations((list) => [c, ...list]);
    setActiveId(c.id);
  }, [conversations, activeId, files, conns, lastModels, composerHandle]);

  function openChat(id: string) {
    setActiveId(id);
    setView({ kind: "chat" });
    setDialog(null);
    if (!isWide()) setSidebarOpen(false);
  }

  function deleteConv(id: string) {
    if (active?.id === id) stop();
    void fileStore.deleteConversation(id);
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

  /** Start a chat from a project page. */
  function startProjectChat(project: Project, text: string, images: ImageRef[]) {
    const c = newConversation(undefined, { id: draftId, projectId: project.id, models: validRefs(conns, lastModels) });
    setConversations((list) => [c, ...list]);
    setActiveId(c.id);
    setView({ kind: "chat" });
    setDraftId(newId());
    send(text, images, c);
  }

  function deleteProject(project: Project) {
    void fileStore.deleteConversation(projectScope(project.id));
    setProjects((list) => list.filter((p) => p.id !== project.id));
    setConversations((list) => list.map((c) => (c.projectId === project.id ? { ...c, projectId: undefined } : c)));
    setView({ kind: "projects" });
  }

  // ---- files --------------------------------------------------------------------------
  async function attachTo(scope: string, list: File[]) {
    if (!scope) return;
    for (const file of list) {
      const id = newId();
      setPending((p) => [...p, { id, conversationId: scope, name: file.name }]);
      try {
        await attachFile(scope, file, await fileStore.listDocs(scope));
        setPending((p) => p.filter((x) => x.id !== id));
        await refreshFiles(scope);
      } catch (e) {
        const error = e instanceof FileError ? e.message : `“${file.name}” couldn't be read.`;
        setPending((p) => p.map((x) => (x.id === id ? { ...x, error } : x)));
      }
    }
  }

  async function removeFile(doc: RagDoc) {
    await fileStore.deleteDoc(doc.id);
    await refreshFiles(doc.conversationId);
  }

  const attachmentBar = (
    <AttachmentBar
      files={scopeFiles}
      pending={pending.filter((p) => p.conversationId === fileScope)}
      persistent={filesPersistent}
      disabled={generating}
      onRemove={(doc) => void removeFile(doc)}
      onDismiss={(id) => setPending((p) => p.filter((x) => x.id !== id))}
    />
  );

  // ---- connections --------------------------------------------------------------------
  function saveConns(next: ConnectionsState) {
    setConns(next);
    setStorageAvailable(saveConnections(next));
  }

  function clearAllConnections() {
    stop();
    clearConnections();
    setConns(EMPTY_STATE);
    setStatuses({});
    setDialog({ kind: "connections", onboarding: true });
  }

  // ---- export -------------------------------------------------------------------------
  async function exportAs(kind: "md" | "json") {
    if (!active) return;
    setExportOpen(false);
    const docs = await fileStore.listDocs(active.id);
    const replies = active.messages.filter((m) => m.role === "assistant" && m.model);
    const models = [...new Set(replies.map((m) => m.model!))];
    const hosts = [...new Set(replies.map((m) => (m.modelRef ? hostOf(resolveRef(conns, m.modelRef)?.source.baseUrl ?? m.host ?? "") : (m.host ?? ""))).filter(Boolean))];
    const ctx = {
      model: models.join(", "),
      host: hosts.join(", "),
      files: docs.map((d) => ({ name: d.name, size: d.size, type: d.type, addedAt: d.createdAt })),
    };
    const name = safeFilename(active.title);
    if (kind === "json") download(`${name}.json`, conversationToJson(active, ctx), "application/json");
    else download(`${name}.md`, conversationToMarkdown(active, ctx), "text/markdown");
  }

  // ---- keyboard shortcuts -------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && !e.shiftKey && key === "k") {
        e.preventDefault();
        setDialog({ kind: "search" });
      } else if (mod && e.shiftKey && key === "o") {
        e.preventDefault();
        newChat();
      } else if (mod && !e.shiftKey && key === "b") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      } else if (mod && (key === "/" || key === "?")) {
        e.preventDefault();
        setDialog({ kind: "shortcuts" });
      } else if (e.key === "Escape" && e.shiftKey) {
        e.preventDefault();
        composerHandle?.focus();
      } else if (e.key === "Escape" && !dialog && controllers.current.size > 0) {
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, newChat, stop, composerHandle]);

  // ---- rendering ----------------------------------------------------------------------
  const replyLabel = (m: Message) => (m.modelRef ? modelLabel(conns, m.modelRef) : [m.model, m.host].filter(Boolean).join(" · "));

  /** Props shared by every message box; each place adds its own conversation and send action. */
  const composerProps = {
    handleRef: setComposerHandle,
    generating,
    disabled: !hasConnections,
    onStop: stop,
    onAttachFiles: (list: File[]) => void attachTo(fileScope, list),
    prompts,
    onManagePrompts: () => setDialog({ kind: "prompts" }),
  };
  const picker = (placement: "up" | "down") => (
    <ModelPicker state={conns} statuses={statuses} selected={activeRefs} onChange={setModels} onManage={() => setDialog({ kind: "connections" })} placement={placement} />
  );

  const turns = active ? toTurns(active.messages) : [];
  const empty = !!active && active.messages.length === 0;
  /** Chats with side-by-side comparisons get a wider column. */
  const wide = turns.some((t) => t.replies.length > 1) || activeRefs.length > 1;

  function renderThread() {
    if (!active) return null;
    return turns.map((turn, ti) => {
      const isLast = ti === turns.length - 1;
      const feedback = (r: Message) => (v: "up" | "down") => updateMsg(active.id, r.id, (m) => ({ ...m, feedback: m.feedback === v ? null : v }));
      return (
        <div key={turn.user.id} className="space-y-5">
          <UserMessage message={turn.user} canEdit={isLast} busy={generating} onEdit={editLast} />
          {turn.replies.length > 1 ? (
            <div className="-mx-4 snap-x snap-mandatory overflow-x-auto scroll-px-4 px-4 pb-1" data-testid="compare-row" role="group" aria-label={`${turn.replies.length} replies to compare`}>
              <div className="grid gap-3 [&>*]:snap-start" style={{ gridTemplateColumns: `repeat(${turn.replies.length}, minmax(min(85vw, 18rem), 1fr))` }}>
                {turn.replies.map((r) => (
                  <AssistantMessage
                    key={r.id}
                    variant="card"
                    message={r}
                    streaming={generatingIds.includes(r.id)}
                    busy={generating}
                    canRegenerate={isLast}
                    modelLabel={replyLabel(r)}
                    onFeedback={feedback(r)}
                    onRegenerate={() => regenerateOne(r)}
                    onOpenConnection={() => setDialog({ kind: "connections", editId: r.modelRef?.connectionId })}
                    onContinueWith={r.modelRef && !r.error ? () => setModels([r.modelRef!]) : undefined}
                  />
                ))}
              </div>
            </div>
          ) : (
            turn.replies.map((r) => (
              <AssistantMessage
                key={r.id}
                message={r}
                streaming={generatingIds.includes(r.id)}
                busy={generating}
                canRegenerate={isLast}
                modelLabel={replyLabel(r)}
                onFeedback={feedback(r)}
                onRegenerate={regenerateAll}
                onOpenConnection={() => setDialog({ kind: "connections", editId: r.modelRef?.connectionId })}
              />
            ))
          )}
        </div>
      );
    });
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        conversations={conversations}
        projects={projects}
        activeId={active?.id ?? null}
        open={sidebarOpen}
        view={view.kind}
        onToggle={() => setSidebarOpen((o) => !o)}
        onNew={newChat}
        onSearch={() => setDialog({ kind: "search" })}
        onProjects={() => {
          setView({ kind: "projects" });
          if (!isWide()) setSidebarOpen(false);
        }}
        onSelect={openChat}
        onRename={(id, title) => updateConv(id, (c) => ({ ...c, title }))}
        onPin={(id, pinned) => updateConv(id, (c) => ({ ...c, pinned }))}
        onMove={(id, projectId) => updateConv(id, (c) => ({ ...c, projectId }))}
        onDelete={deleteConv}
        onPrompts={() => setDialog({ kind: "prompts" })}
        onConnections={() => setDialog({ kind: "connections" })}
        onShortcuts={() => setDialog({ kind: "shortcuts" })}
      />

      <div
        className={`relative flex min-w-0 flex-1 flex-col bg-canvas ${dragging ? "ring-4 ring-accent ring-inset" : ""}`}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          if (![...e.dataTransfer.types].includes("Files")) return;
          e.preventDefault();
          setDragging(false);
          const list = [...e.dataTransfer.files];
          if (view.kind === "project") void attachTo(fileScope, list.filter((f) => !f.type.startsWith("image/")));
          else composerHandle?.addFiles(list);
        }}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-accent-soft/80 text-lg font-medium">Drop files or pictures to add them</div>
        )}

        <header className="flex min-h-12 items-center gap-2 px-3 py-2">
          <button type="button" onClick={() => setSidebarOpen(true)} className={`${cls.iconButton} md:hidden`} aria-label="Open conversations">
            <MenuIcon />
          </button>
          {view.kind === "chat" && active && !empty ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {chatProject && (
                <button type="button" onClick={() => setView({ kind: "project", id: chatProject.id })} className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-sm text-muted hover:bg-raised hover:text-ink">
                  <FolderIcon /> <span className="max-w-[10rem] truncate">{chatProject.name}</span> /
                </button>
              )}
              <h1 className="truncate text-sm font-medium" data-testid="chat-title">
                {active.title}
              </h1>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {view.kind === "chat" && active && (
            <>
              <button type="button" onClick={() => setDialog({ kind: "settings" })} className={cls.iconButton} aria-label="Chat settings" title="Chat settings">
                <SlidersIcon />
              </button>
              {!empty && (
                <div ref={exportRef} className="relative">
                  <button type="button" onClick={() => setExportOpen((o) => !o)} className={cls.iconButton} aria-haspopup="menu" aria-expanded={exportOpen} aria-label="Export conversation" title="Export conversation">
                    <DownloadIcon />
                  </button>
                  {exportOpen && (
                    <div role="menu" className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                      <button type="button" role="menuitem" onClick={() => void exportAs("md")} className={cls.menuItem}>
                        Export as Markdown
                      </button>
                      <button type="button" role="menuitem" onClick={() => void exportAs("json")} className={cls.menuItem}>
                        Export as JSON
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </header>

        {view.kind === "projects" && (
          <main className="flex-1 overflow-y-auto">
            <ProjectsList
              projects={projects}
              conversations={conversations}
              onOpen={(id) => setView({ kind: "project", id })}
              onCreate={(name, description) => {
                const p = newProject(name, description);
                setProjects((list) => [...list, p]);
                setView({ kind: "project", id: p.id });
              }}
            />
          </main>
        )}

        {view.kind === "project" && openProject && (
          <main className="flex-1 overflow-y-auto">
            <ProjectView
              key={openProject.id}
              project={openProject}
              conversations={conversations}
              onBack={() => setView({ kind: "projects" })}
              onChange={(p) => setProjects((list) => list.map((x) => (x.id === p.id ? p : x)))}
              onDelete={() => deleteProject(openProject)}
              onOpenChat={openChat}
              onAttachFiles={(list) => void attachTo(fileScope, list)}
              files={attachmentBar}
              composer={
                <Composer
                  key={draftId}
                  {...composerProps}
                  onAddPicture={(blob, name) => savePicture(draftId, blob, name)}
                  onSend={(t, i) => startProjectChat(openProject, t, i)}
                  placeholder={`Start a chat in ${openProject.name}…`}
                  picker={picker("down")}
                />
              }
            />
          </main>
        )}

        {view.kind === "chat" && active && empty && (
          <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-[12vh]">
            <div className="w-full max-w-2xl">
              <h1 className="mb-6 flex items-center justify-center gap-3 text-center font-serif text-3xl sm:text-4xl">
                <LogoMark size={34} /> {greeting()}
              </h1>
              {chatProject && <p className="mb-3 text-center text-sm text-muted">In project “{chatProject.name}”</p>}
              <Composer
                key={active.id}
                {...composerProps}
                onAddPicture={(blob, name) => savePicture(active.id, blob, name)}
                onSend={(t, i) => send(t, i)}
                autoFocus
                onOpenSettings={() => setDialog({ kind: "settings" })}
                picker={picker("down")}
                attachments={attachmentBar}
              />
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => send(s.prompt, [])}
                    disabled={!hasConnections || generating}
                    title={s.prompt}
                    aria-label={s.prompt}
                    className={`rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink disabled:opacity-50 ${cls.focus}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {!hasConnections && (
                <p className="mt-6 text-center text-sm text-muted">
                  <button type="button" className="text-accent underline" onClick={() => setDialog({ kind: "connections", onboarding: true })}>
                    Add a connection
                  </button>{" "}
                  to start chatting.
                </p>
              )}
            </div>
          </main>
        )}

        {view.kind === "chat" && active && !empty && (
          <>
            <main ref={threadRef} className="flex-1 overflow-y-auto" aria-busy={generating}>
              <div className={`mx-auto space-y-8 px-4 pt-4 pb-8 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>{renderThread()}</div>
            </main>
            <div className="mx-auto w-full max-w-3xl px-4 pb-3">
              <Composer
                key={active.id}
                {...composerProps}
                onAddPicture={(blob, name) => savePicture(active.id, blob, name)}
                onSend={(t, i) => send(t, i)}
                placeholder="Reply…"
                onOpenSettings={() => setDialog({ kind: "settings" })}
                picker={picker("up")}
                attachments={attachmentBar}
              />
              <p className="mt-2 text-center text-xs text-muted">Models can make mistakes. Check important information.</p>
            </div>
          </>
        )}

        {!storageAvailable && <p className="px-4 pb-2 text-center text-xs text-amber-800 dark:text-amber-300">Your browser is blocking storage: chats and connections will be lost when you reload.</p>}
      </div>

      {dialog?.kind === "connections" && (
        <ConnectionsDialog
          key={`${dialog.onboarding ? "onboarding" : "manage"}-${dialog.editId ?? ""}`}
          state={conns}
          statuses={statuses}
          storageAvailable={storageAvailable}
          onboarding={!!dialog.onboarding || !hasConnections}
          editId={dialog.editId}
          onSave={saveConns}
          onStatus={setStatus}
          onClearAll={clearAllConnections}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "search" && <SearchDialog conversations={conversations} onSelect={openChat} onClose={() => setDialog(null)} />}
      {dialog?.kind === "prompts" && <PromptLibraryDialog prompts={prompts} onChange={setPrompts} onClose={() => setDialog(null)} />}
      {dialog?.kind === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "settings" && active && (
        <ChatSettingsDialog
          settings={active.settings}
          projectName={chatProject?.name}
          onChange={(settings: ChatSettings) => updateConv(active.id, (c) => ({ ...c, settings }))}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
