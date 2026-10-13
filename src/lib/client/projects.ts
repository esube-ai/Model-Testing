import { newId } from "./ids";
import { readJson, writeJson } from "./storage";

/**
 * A project groups chats that share custom instructions and files. Project files are
 * stored like chat files, under the scope `project:<id>`.
 */
export const PROJECTS_KEY = "model-testing.projects";

export interface Project {
  id: string;
  name: string;
  description: string;
  /** Added to the system prompt of every chat in the project. */
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

export const projectScope = (projectId: string) => `project:${projectId}`;

export function newProject(name: string, description = ""): Project {
  const now = new Date().toISOString();
  return { id: newId(), name: name.trim() || "Untitled project", description, instructions: "", createdAt: now, updatedAt: now };
}

export function loadProjects(): Project[] {
  const list = readJson<Project[]>("local", PROJECTS_KEY);
  return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && typeof p.name === "string") : [];
}

export function saveProjects(list: Project[]): boolean {
  return writeJson("local", PROJECTS_KEY, list);
}

/** Project instructions first, then the chat's own system prompt. */
export function combinedSystemPrompt(project: Project | undefined, chatPrompt: string): string | undefined {
  const parts = [project?.instructions.trim(), chatPrompt.trim()].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}
