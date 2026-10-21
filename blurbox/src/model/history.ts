/** Undo/redo history of immutable snapshots. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Consecutive pushes with the same key merge into one undo step (e.g. dragging a slider). */
  lastKey: string | null;
}

export const HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null };
}

export function pushHistory<T>(h: History<T>, next: T, key: string | null = null, limit = HISTORY_LIMIT): History<T> {
  if (next === h.present) return h;
  if (key !== null && key === h.lastKey) return { ...h, present: next, future: [] };
  const past = h.past.length >= limit ? [...h.past.slice(h.past.length - limit + 1), h.present] : [...h.past, h.present];
  return { past, present: next, future: [], lastKey: key };
}

export function undoHistory<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null };
}

export function redoHistory<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null };
}

export const canUndo = (h: History<unknown>) => h.past.length > 0;
export const canRedo = (h: History<unknown>) => h.future.length > 0;
