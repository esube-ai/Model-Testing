import { useEffect, useRef } from 'react';
import type { HideMethod, Tool } from '../model/types';

export interface ShortcutActions {
  enabled: boolean;
  hasImage: boolean;
  setTool: (t: Tool) => void;
  brushStep: (dir: 1 | -1) => void;
  setMethod: (m: HideMethod) => void;
  addRegion: () => void;
  nudge: (dx: number, dy: number, resize: boolean) => void;
  cycleSelection: (dir: 1 | -1) => void;
  deleteSelected: () => void;
  deselect: () => void;
  undo: () => void;
  redo: () => void;
  zoom: (dir: 1 | -1) => void;
  fit: () => void;
  actualSize: () => void;
  setPanHeld: (held: boolean) => void;
  setCompareHeld: (held: boolean) => void;
  open: () => void;
  exportImage: () => void;
  help: () => void;
}

const TOOL_KEYS: Record<string, Tool> = { v: 'select', r: 'rect', e: 'ellipse', b: 'brush', h: 'pan' };
const METHOD_KEYS: Record<string, HideMethod> = { '1': 'blur', '2': 'pixelate', '3': 'fill' };

/** True for controls where plain keys must keep their normal meaning (typing, arrows in radios…). */
function ownsKeys(t: EventTarget | null, key: string): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t instanceof HTMLInputElement) {
    if (['range', 'radio'].includes(t.type)) return key.startsWith('Arrow') || key === 'Home' || key === 'End' || key.startsWith('Page');
    if (['checkbox', 'button', 'color'].includes(t.type)) return key === ' ' || key === 'Enter';
    return true;
  }
  if (t.tagName === 'BUTTON') return key === ' ' || key === 'Enter';
  return false;
}

/** Arrow-key nudging only applies while the canvas (or nothing in particular) has focus. */
function canvasFocused(t: EventTarget | null): boolean {
  return t === document.body || (t instanceof HTMLElement && !!t.closest('[data-testid="canvas-area"]'));
}

export function useShortcuts(actions: ShortcutActions): void {
  const ref = useRef(actions);
  useEffect(() => {
    ref.current = actions;
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const a = ref.current;
      if (!a.enabled || e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;
      const handled = () => e.preventDefault();
      const textEntry = ownsKeys(e.target, key);

      if (mod && !e.altKey) {
        if (lower === 'o') return handled(), a.open();
        if (!a.hasImage) return;
        if (textEntry && !(e.target instanceof HTMLInputElement && ['range', 'radio', 'color'].includes(e.target.type))) return;
        if (lower === 'z') return handled(), e.shiftKey ? a.redo() : a.undo();
        if (lower === 'y') return handled(), a.redo();
        if (lower === 's') return handled(), a.exportImage();
        if (key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') return handled(), a.fit();
        if (key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') return handled(), a.actualSize();
        return;
      }
      if (textEntry || e.altKey && !key.startsWith('Arrow')) return;
      if (key === '?') return handled(), a.help();
      if (!a.hasImage) return;

      if (e.code === 'Space' && !e.repeat) return handled(), a.setPanHeld(true);
      if (e.code === 'Space') return handled();
      if (key === '\\') return handled(), a.setCompareHeld(true);
      if (TOOL_KEYS[lower] && !e.shiftKey) return handled(), a.setTool(TOOL_KEYS[lower]);
      if (METHOD_KEYS[key]) return handled(), a.setMethod(METHOD_KEYS[key]);
      if (key === '[') return handled(), a.brushStep(-1);
      if (key === ']') return handled(), a.brushStep(1);
      if (lower === 'n') return handled(), a.addRegion();
      if (key === '+' || key === '=') return handled(), a.zoom(1);
      if (key === '-' || key === '_') return handled(), a.zoom(-1);
      if (key === 'Delete' || key === 'Backspace') return handled(), a.deleteSelected();
      if (key === 'Escape') return a.deselect();
      if (key === '.' || key === ',') return handled(), a.cycleSelection(key === '.' ? 1 : -1);
      if (key.startsWith('Arrow') && canvasFocused(e.target)) {
        const step = e.shiftKey ? 10 : 1;
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
        const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
        handled();
        a.nudge(dx, dy, e.altKey);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') ref.current.setPanHeld(false);
      if (e.key === '\\') ref.current.setCompareHeld(false);
    };
    const blur = () => {
      ref.current.setPanHeld(false);
      ref.current.setCompareHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
}
