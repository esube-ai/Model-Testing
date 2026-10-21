import { createHistory, pushHistory, redoHistory, undoHistory, type History } from './history';
import type { Region } from './types';

export interface EditorState {
  history: History<Region[]>;
  /** Selection is not part of undo history. */
  selectedId: string | null;
}

export type EditorAction =
  | { type: 'reset' }
  | { type: 'add'; region: Region }
  | { type: 'replace'; region: Region; coalesceKey?: string }
  | { type: 'update'; id: string; patch: Partial<Omit<Region, 'id'>>; coalesceKey?: string }
  | { type: 'remove'; id: string }
  | { type: 'select'; id: string | null }
  | { type: 'undo' }
  | { type: 'redo' };

export const initialEditorState: EditorState = { history: createHistory<Region[]>([]), selectedId: null };

function keepSelection(state: EditorState, history: History<Region[]>): EditorState {
  const selectedId = history.present.some((r) => r.id === state.selectedId) ? state.selectedId : null;
  return { history, selectedId };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const regions = state.history.present;
  switch (action.type) {
    case 'reset':
      return initialEditorState;
    case 'add':
      return { history: pushHistory(state.history, [...regions, action.region]), selectedId: action.region.id };
    case 'replace': {
      const i = regions.findIndex((r) => r.id === action.region.id);
      if (i < 0) return state;
      const next = regions.slice();
      next[i] = action.region;
      return { ...state, history: pushHistory(state.history, next, action.coalesceKey ?? null) };
    }
    case 'update': {
      const i = regions.findIndex((r) => r.id === action.id);
      if (i < 0) return state;
      const next = regions.slice();
      next[i] = { ...regions[i], ...action.patch };
      return { ...state, history: pushHistory(state.history, next, action.coalesceKey ?? null) };
    }
    case 'remove': {
      if (!regions.some((r) => r.id === action.id)) return state;
      return keepSelection(state, pushHistory(state.history, regions.filter((r) => r.id !== action.id)));
    }
    case 'select':
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id };
    case 'undo':
      return keepSelection(state, undoHistory(state.history));
    case 'redo':
      return keepSelection(state, redoHistory(state.history));
  }
}

let counter = 0;
export function newRegionId(): string {
  counter += 1;
  return `r${Date.now().toString(36)}${counter}`;
}
