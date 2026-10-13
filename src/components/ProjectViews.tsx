"use client";

import { useState, type ReactNode } from "react";
import type { Conversation } from "@/lib/client/conversations";
import type { Project } from "@/lib/client/projects";
import { ChevronRightIcon, FolderIcon, PaperclipIcon, PlusIcon } from "./Icons";
import { cls } from "./ui";

function relative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

interface ListProps {
  projects: Project[];
  conversations: Conversation[];
  onOpen: (id: string) => void;
  onCreate: (name: string, description: string) => void;
}

/** All projects, with a form to create one. */
export function ProjectsList({ projects, conversations, onOpen, onCreate }: ListProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8" data-testid="projects-view">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Projects</h1>
          <p className="mt-1 text-sm text-muted">Group chats that share instructions and files.</p>
        </div>
        <button type="button" className={cls.primary} onClick={() => setCreating(true)}>
          <PlusIcon /> New project
        </button>
      </div>

      {creating && (
        <form
          className="mb-6 space-y-3 rounded-2xl border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onCreate(name, description);
            setCreating(false);
            setName("");
            setDescription("");
          }}
        >
          <div>
            <label htmlFor="project-name" className={cls.label}>
              Project name
            </label>
            <input id="project-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Customer support evaluation" className={`mt-1 ${cls.input}`} />
          </div>
          <div>
            <label htmlFor="project-description" className={cls.label}>
              Description <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project for?" className={`mt-1 ${cls.input}`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={cls.secondary} onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button type="submit" className={cls.primary} disabled={!name.trim()}>
              Create project
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 && !creating ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <FolderIcon />
          <p className="mt-2 font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-muted">Create one to give a set of chats the same instructions and files.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {[...projects]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((p) => {
              const count = conversations.filter((c) => c.projectId === p.id).length;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => onOpen(p.id)} className={`block w-full rounded-2xl border border-line bg-surface p-4 text-left hover:border-muted ${cls.focus}`}>
                    <p className="font-medium">{p.name}</p>
                    {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
                    <p className="mt-3 text-xs text-muted">
                      {count} {count === 1 ? "chat" : "chats"} · updated {relative(p.updatedAt)}
                    </p>
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

interface ViewProps {
  project: Project;
  conversations: Conversation[];
  onBack: () => void;
  onChange: (project: Project) => void;
  onDelete: () => void;
  onOpenChat: (id: string) => void;
  /** Message box that starts a new chat in this project. */
  composer: ReactNode;
  /** The project's files strip. */
  files: ReactNode;
  onAttachFiles: (files: File[]) => void;
}

/** One project: start a chat, see its chats, and edit its instructions and files. */
export function ProjectView({ project, conversations, onBack, onChange, onDelete, onOpenChat, composer, files, onAttachFiles }: ViewProps) {
  const [instructions, setInstructions] = useState(project.instructions);
  const chats = conversations.filter((c) => c.projectId === project.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const save = (patch: Partial<Project>) => onChange({ ...project, ...patch, updatedAt: new Date().toISOString() });

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-6 lg:grid-cols-[1fr_20rem]" data-testid="project-view">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-sm text-muted">
          <button type="button" onClick={onBack} className="hover:text-ink hover:underline">
            Projects
          </button>
          <ChevronRightIcon />
          <span className="truncate text-ink">{project.name}</span>
        </nav>
        <label htmlFor="project-title" className="sr-only">
          Project name
        </label>
        <input
          id="project-title"
          defaultValue={project.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== project.name && save({ name: e.target.value.trim() })}
          className="w-full rounded-lg bg-transparent font-serif text-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <label htmlFor="project-desc" className="sr-only">
          Project description
        </label>
        <input
          id="project-desc"
          defaultValue={project.description}
          placeholder="Add a description"
          onBlur={(e) => e.target.value !== project.description && save({ description: e.target.value })}
          className="mt-1 w-full rounded-lg bg-transparent text-muted placeholder:text-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />

        <div className="mt-6">{composer}</div>

        <h2 className="mt-8 mb-2 text-sm font-medium text-muted">Chats in this project</h2>
        {chats.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No chats yet. Start one above.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface" data-testid="project-chats">
            {chats.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onOpenChat(c.id)} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-raised ${cls.focus}`}>
                  <span className="truncate">{c.title}</span>
                  <span className="shrink-0 text-xs text-muted">{relative(c.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="space-y-4" aria-label="Project knowledge">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <label htmlFor="project-instructions" className="font-medium">
            Project instructions
          </label>
          <p className={cls.hint}>Added to every chat in this project, before the chat&apos;s own system prompt.</p>
          <textarea
            id="project-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onBlur={() => instructions !== project.instructions && save({ instructions })}
            rows={6}
            placeholder="e.g. You are helping our support team. Answer in a friendly tone and cite the policy documents."
            className={`mt-2 ${cls.input}`}
          />
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">Project files</h2>
            <label className={`${cls.secondary} cursor-pointer`}>
              <PaperclipIcon /> Add files
              <input
                type="file"
                multiple
                className="sr-only"
                data-testid="project-file-input"
                onChange={(e) => {
                  const list = [...(e.target.files ?? [])];
                  e.target.value = "";
                  if (list.length) onAttachFiles(list);
                }}
              />
            </label>
          </div>
          <p className={cls.hint}>Every chat in this project can search these files.</p>
          <div className="mt-3">{files}</div>
        </section>
        <button
          type="button"
          className={cls.danger}
          onClick={() => {
            if (window.confirm(`Delete the project “${project.name}” and its files? Its chats are kept.`)) onDelete();
          }}
        >
          Delete project
        </button>
      </aside>
    </div>
  );
}
