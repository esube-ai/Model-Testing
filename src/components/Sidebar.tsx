"use client";

import { useCallback, useRef, useState } from "react";
import type { Conversation } from "@/lib/client/conversations";
import { groupByDate } from "@/lib/client/organize";
import type { Project } from "@/lib/client/projects";
import { BookIcon, CloseIcon, EditSquareIcon, FolderIcon, KeyboardIcon, LogoMark, MoreIcon, PanelLeftIcon, PinIcon, SearchIcon, SlidersIcon } from "./Icons";
import { cls, shortcutLabel, useDismiss } from "./ui";

interface Props {
  conversations: Conversation[];
  projects: Project[];
  activeId: string | null;
  /** Mobile: slide-over open. Desktop: expanded (false = icon rail). */
  open: boolean;
  view: "chat" | "projects" | "project";
  onToggle: () => void;
  onNew: () => void;
  onSearch: () => void;
  onProjects: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onMove: (id: string, projectId: string | undefined) => void;
  onDelete: (id: string) => void;
  onPrompts: () => void;
  onConnections: () => void;
  onShortcuts: () => void;
}

const navItem = `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-raised ${cls.focus}`;

export function Sidebar(props: Props) {
  const { conversations, activeId, open } = props;
  const pinned = conversations.filter((c) => c.pinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const groups = groupByDate(conversations.filter((c) => !c.pinned));

  const rail = (
    <div className="hidden h-full w-14 flex-col items-center gap-1 border-r border-line bg-sidebar py-3 md:flex">
      <button type="button" className={cls.iconButton} onClick={props.onToggle} aria-label="Open sidebar" title={`Open sidebar (${shortcutLabel("Mod+B")})`}>
        <PanelLeftIcon />
      </button>
      <button type="button" className={cls.iconButton} onClick={props.onNew} aria-label="New chat" title="New chat">
        <EditSquareIcon />
      </button>
      <button type="button" className={cls.iconButton} onClick={props.onSearch} aria-label="Search chats" title="Search chats">
        <SearchIcon />
      </button>
      <button type="button" className={cls.iconButton} onClick={props.onProjects} aria-label="Projects" title="Projects">
        <FolderIcon />
      </button>
    </div>
  );

  return (
    <>
      {!open && rail}
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={props.onToggle} aria-hidden="true" />}
      <nav
        aria-label="Conversations"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-sidebar transition-transform md:static md:z-auto ${open ? "translate-x-0" : "-translate-x-full max-md:invisible md:hidden"}`}
      >
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <LogoMark size={26} />
          <span className="flex-1 font-serif text-lg">Model Testing</span>
          <button type="button" className={cls.iconButton} onClick={props.onToggle} aria-label="Close sidebar" title={`Close sidebar (${shortcutLabel("Mod+B")})`}>
            <span className="max-md:hidden">
              <PanelLeftIcon />
            </span>
            <span className="md:hidden">
              <CloseIcon />
            </span>
          </button>
        </div>

        <div className="space-y-0.5 px-2">
          <button type="button" onClick={props.onNew} className={`${navItem} font-medium`}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink">
              <EditSquareIcon />
            </span>
            New chat
          </button>
          <button type="button" onClick={props.onSearch} className={navItem}>
            <SearchIcon /> <span className="flex-1 text-left">Search chats</span>
            <kbd className="text-xs text-muted">{shortcutLabel("Mod+K")}</kbd>
          </button>
          <button type="button" onClick={props.onProjects} className={`${navItem} ${props.view !== "chat" ? "bg-raised" : ""}`} aria-current={props.view === "projects" ? "page" : undefined}>
            <FolderIcon /> Projects
          </button>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-2 pb-3" data-testid="conversation-list">
          {pinned.length > 0 && (
            <Section label="Pinned">
              {pinned.map((c) => (
                <ChatItem key={c.id} c={c} active={c.id === activeId && props.view === "chat"} {...props} />
              ))}
            </Section>
          )}
          {groups.map((g) => (
            <Section key={g.label} label={g.label}>
              {g.conversations.map((c) => (
                <ChatItem key={c.id} c={c} active={c.id === activeId && props.view === "chat"} {...props} />
              ))}
            </Section>
          ))}
          {conversations.length === 0 && <p className="px-3 py-2 text-sm text-muted">No chats yet.</p>}
        </div>

        <div className="space-y-0.5 border-t border-line px-2 py-2">
          <button type="button" onClick={props.onPrompts} className={navItem}>
            <BookIcon /> Prompt library
          </button>
          <button type="button" onClick={props.onConnections} className={navItem}>
            <SlidersIcon /> Connections
          </button>
          <button type="button" onClick={props.onShortcuts} className={navItem}>
            <KeyboardIcon /> <span className="flex-1 text-left">Keyboard shortcuts</span>
            <kbd className="text-xs text-muted">{shortcutLabel("Mod+/")}</kbd>
          </button>
        </div>
      </nav>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <h3 className="px-3 pb-1 text-xs font-medium text-muted">{label}</h3>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

function ChatItem({ c, active, projects, onSelect, onRename, onPin, onMove, onDelete }: Props & { c: Conversation; active: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(c.title);
  const [menu, setMenu] = useState<"closed" | "main" | "move">("closed");
  const ref = useRef<HTMLLIElement>(null);
  const close = useCallback(() => setMenu("closed"), []);
  useDismiss(ref, menu !== "closed", close);
  const project = projects.find((p) => p.id === c.projectId);

  if (renaming) {
    const commit = () => {
      onRename(c.id, draft.trim() || c.title);
      setRenaming(false);
    };
    return (
      <li>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <label htmlFor={`rename-${c.id}`} className="sr-only">
            Conversation name
          </label>
          <input id={`rename-${c.id}`} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Escape" && setRenaming(false)} className={`${cls.input} py-1.5`} />
        </form>
      </li>
    );
  }

  return (
    <li ref={ref} className={`group relative flex items-center rounded-lg ${active ? "bg-raised" : "hover:bg-raised/70"}`}>
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        aria-current={active ? "page" : undefined}
        className={`min-w-0 flex-1 truncate rounded-lg px-3 py-1.5 text-left text-sm ${cls.focus}`}
        title={project ? `${c.title} — in ${project.name}` : c.title}
      >
        {c.title}
      </button>
      <button
        type="button"
        onClick={() => setMenu((m) => (m === "closed" ? "main" : "closed"))}
        aria-haspopup="menu"
        aria-expanded={menu !== "closed"}
        aria-label={`More options for "${c.title}"`}
        className={`mr-1 rounded-md p-1 text-muted hover:text-ink focus-visible:opacity-100 ${cls.focus} ${menu !== "closed" || active ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100"}`}
      >
        <MoreIcon />
      </button>
      {menu === "main" && (
        <div role="menu" className="absolute top-full right-0 z-30 mt-1 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <button
            type="button"
            role="menuitem"
            className={cls.menuItem}
            onClick={() => {
              setMenu("closed");
              onPin(c.id, !c.pinned);
            }}
          >
            <PinIcon /> {c.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={cls.menuItem}
            onClick={() => {
              setMenu("closed");
              setDraft(c.title);
              setRenaming(true);
            }}
          >
            <EditSquareIcon /> Rename
          </button>
          <button type="button" role="menuitem" aria-haspopup="menu" className={cls.menuItem} onClick={() => setMenu("move")}>
            <FolderIcon /> Move to project…
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${cls.menuItem} text-red-700 dark:text-red-400`}
            onClick={() => {
              setMenu("closed");
              if (window.confirm(`Delete "${c.title}"? This can't be undone.`)) onDelete(c.id);
            }}
          >
            <CloseIcon /> Delete
          </button>
        </div>
      )}
      {menu === "move" && (
        <div role="menu" aria-label="Move to project" className="absolute top-full right-0 z-30 mt-1 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          {projects.length === 0 && <p className="px-3 py-2 text-sm text-muted">No projects yet. Create one under Projects.</p>}
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={c.projectId === p.id}
              className={cls.menuItem}
              onClick={() => {
                setMenu("closed");
                onMove(c.id, p.id);
              }}
            >
              <FolderIcon /> <span className="truncate">{p.name}</span>
            </button>
          ))}
          {c.projectId && (
            <button
              type="button"
              role="menuitem"
              className={`${cls.menuItem} text-muted`}
              onClick={() => {
                setMenu("closed");
                onMove(c.id, undefined);
              }}
            >
              Remove from project
            </button>
          )}
        </div>
      )}
    </li>
  );
}
