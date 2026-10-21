import { describe, expect, it } from 'vitest';
import { editorReducer, initialEditorState, type EditorState } from '../../src/model/editor';
import { createHistory, pushHistory, redoHistory, undoHistory, HISTORY_LIMIT } from '../../src/model/history';
import { defaultSettings, makeRegion } from '../../src/model/defaults';

const s = defaultSettings(1000, 1000);
const rect = (id: string, x = 0) => makeRegion(id, { kind: 'rect', x, y: 0, w: 10, h: 10 }, s);

describe('history', () => {
  it('undoes and redoes in order', () => {
    let h = createHistory(0);
    h = pushHistory(h, 1);
    h = pushHistory(h, 2);
    h = undoHistory(h);
    expect(h.present).toBe(1);
    h = undoHistory(h);
    expect(h.present).toBe(0);
    expect(undoHistory(h)).toBe(h); // nothing left to undo
    h = redoHistory(h);
    h = redoHistory(h);
    expect(h.present).toBe(2);
    expect(redoHistory(h)).toBe(h);
  });

  it('a new edit after undo discards the redo stack', () => {
    let h = pushHistory(pushHistory(createHistory('a'), 'b'), 'c');
    h = undoHistory(h);
    h = pushHistory(h, 'd');
    expect(h.future).toEqual([]);
    expect(redoHistory(h).present).toBe('d');
    expect(undoHistory(h).present).toBe('b');
  });

  it(`keeps at least 50 steps (limit ${HISTORY_LIMIT})`, () => {
    let h = createHistory(0);
    for (let i = 1; i <= 150; i++) h = pushHistory(h, i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
    for (let i = 0; i < 50; i++) h = undoHistory(h);
    expect(h.present).toBe(100);
    for (let i = 0; i < 50; i++) h = redoHistory(h);
    expect(h.present).toBe(150);
  });

  it('coalesces consecutive edits with the same key into one step', () => {
    let h = createHistory(0);
    h = pushHistory(h, 1, 'slider:a');
    h = pushHistory(h, 2, 'slider:a');
    h = pushHistory(h, 3, 'slider:a');
    expect(h.past).toEqual([0]);
    h = pushHistory(h, 4, 'slider:b');
    expect(h.past).toEqual([0, 3]);
    h = undoHistory(h);
    h = pushHistory(h, 5, 'slider:b'); // undo breaks coalescing
    expect(h.past).toEqual([0, 3]);
  });
});

describe('editor reducer', () => {
  const run = (...actions: Parameters<typeof editorReducer>[1][]) =>
    actions.reduce<EditorState>((st, a) => editorReducer(st, a), initialEditorState);

  it('adds, updates and removes regions as undoable steps', () => {
    let st = run({ type: 'add', region: rect('a') }, { type: 'add', region: rect('b', 20) });
    expect(st.history.present.map((r) => r.id)).toEqual(['a', 'b']);
    expect(st.selectedId).toBe('b');
    st = editorReducer(st, { type: 'update', id: 'a', patch: { method: 'fill' } });
    st = editorReducer(st, { type: 'remove', id: 'b' });
    expect(st.selectedId).toBeNull();
    expect(st.history.present.map((r) => r.id)).toEqual(['a']);
    st = editorReducer(st, { type: 'undo' });
    expect(st.history.present.map((r) => r.id)).toEqual(['a', 'b']);
    st = editorReducer(st, { type: 'undo' });
    expect(st.history.present[0].method).toBe('blur');
    st = editorReducer(st, { type: 'redo' });
    expect(st.history.present[0].method).toBe('fill');
  });

  it('selection changes are not undo steps, and undo clears a selection that no longer exists', () => {
    let st = run({ type: 'add', region: rect('a') }, { type: 'select', id: null }, { type: 'select', id: 'a' });
    expect(st.history.past.length).toBe(1);
    st = editorReducer(st, { type: 'undo' });
    expect(st.history.present).toEqual([]);
    expect(st.selectedId).toBeNull();
  });

  it('slider-style updates merge into one undo step', () => {
    let st = run({ type: 'add', region: rect('a') });
    for (const v of [10, 20, 30]) st = editorReducer(st, { type: 'update', id: 'a', patch: { blurSigma: v }, coalesceKey: 'a:blurSigma' });
    expect(st.history.past.length).toBe(2);
    st = editorReducer(st, { type: 'undo' });
    expect(st.history.present[0].blurSigma).toBe(s.blurSigma);
  });
});
