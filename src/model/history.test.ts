import { describe, expect, it } from 'vitest';
import { createHistory, diffFiles, diffLayout, dirtyFromSaved, editSpan, savedJoinedOf, sameDoc, textMergeKey } from './history';
import { emptyLayout, type LayoutFile } from './layout';
import { editorText, segmentTextFrom, setSegmentText } from './ops';
import { joinSegments, makeInkFile } from './splitter';
import type { DocSnapshot } from './history';

const file = (text: string, path = 'm.ink') => makeInkFile(path, text);

function snap(text: string, layout: LayoutFile = emptyLayout()): DocSnapshot {
  return { files: [file(text)], layout };
}

function typeIn(doc: DocSnapshot, segId: string, editor: string): DocSnapshot {
  const f = doc.files[0]!;
  const seg = f.segments.find((s) => s.id === segId)!;
  return { ...doc, files: [setSegmentText(f, segId, segmentTextFrom(editor, seg.text))] };
}

describe('editSpan', () => {
  it('finds an append, a delete and a middle replace', () => {
    expect(editSpan('abc', 'abcd')).toEqual({ from: 3, removed: 0, inserted: 1 });
    expect(editSpan('abcd', 'abc')).toEqual({ from: 3, removed: 1, inserted: 0 });
    expect(editSpan('abc', 'aXc')).toEqual({ from: 1, removed: 1, inserted: 1 });
  });
});

describe('createHistory', () => {
  it('undo restores the before-snapshot and redo restores live', () => {
    let t = 0;
    const h = createHistory({ now: () => t });
    const a = snap('=== k ===\nA\n');
    const b = snap('=== k ===\nB\n');
    h.record(a, 'typing in k', textMergeKey('m.ink#k'), b);
    expect(h.flags()).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'typing in k' });
    const undone = h.undo(b);
    expect(undone?.doc).toBe(a);
    expect(h.flags()).toMatchObject({ canUndo: false, canRedo: true, redoLabel: 'typing in k' });
    const redone = h.redo(a);
    expect(redone?.doc).toBe(b);
    expect(h.flags().canUndo).toBe(true);
  });

  it('coalesces adjacent typing inside the idle window and keeps the older before-state', () => {
    let t = 0;
    const h = createHistory({ now: () => t, idleMs: 500 });
    const a = snap('=== k ===\n');
    const b = typeIn(a, 'm.ink#k', '=== k ===\nh');
    const c = typeIn(b, 'm.ink#k', '=== k ===\nhe');
    const d = typeIn(c, 'm.ink#k', '=== k ===\nhel');
    h.record(a, 'typing in k', textMergeKey('m.ink#k'), b);
    t = 100;
    h.record(b, 'typing in k', textMergeKey('m.ink#k'), c);
    t = 200;
    h.record(c, 'typing in k', textMergeKey('m.ink#k'), d);
    expect(h.undo(d)?.doc).toBe(a);
    expect(h.flags().canUndo).toBe(false);
  });

  it('does not coalesce after the idle window or a non-adjacent caret jump', () => {
    let t = 0;
    const h = createHistory({ now: () => t, idleMs: 500 });
    const a = snap('=== k ===\nhello\n');
    const b = typeIn(a, 'm.ink#k', '=== k ===\nhello!\n');
    h.record(a, 'typing in k', textMergeKey('m.ink#k'), b);
    t = 800;
    const c = typeIn(b, 'm.ink#k', '=== k ===\nhello!!\n');
    h.record(b, 'typing in k', textMergeKey('m.ink#k'), c);
    expect(h.undo(c)?.doc).toBe(b);
    expect(h.undo(b)?.doc).toBe(a);

    t = 0;
    const h2 = createHistory({ now: () => t, idleMs: 500 });
    const start = snap('=== k ===\nhello\n');
    const atEnd = typeIn(start, 'm.ink#k', '=== k ===\nhello!\n');
    const atStart = typeIn(atEnd, 'm.ink#k', '=== k ===\nXhello!\n');
    h2.record(start, 'typing in k', textMergeKey('m.ink#k'), atEnd);
    t = 50;
    h2.record(atEnd, 'typing in k', textMergeKey('m.ink#k'), atStart);
    expect(h2.undo(atStart)?.doc).toBe(atEnd);
    expect(h2.undo(atEnd)?.doc).toBe(start);
  });

  it('does not coalesce a layout step into typing, and breakRun stops a typing run', () => {
    let t = 0;
    const h = createHistory({ now: () => t });
    const a = snap('=== k ===\nA\n');
    const b = snap('=== k ===\nAB\n');
    const moved: DocSnapshot = { files: b.files, layout: { ...emptyLayout(), nodes: { k: { x: 10, y: 10 } } } };
    h.record(a, 'typing in k', textMergeKey('m.ink#k'), b);
    t = 50;
    h.record(b, 'move k', null, moved);
    expect(h.undo(moved)?.label).toBe('move k');
    expect(h.undo(b)?.label).toBe('typing in k');

    t = 0;
    const h2 = createHistory({ now: () => t });
    h2.record(a, 'typing in k', textMergeKey('m.ink#k'), b);
    h2.breakRun();
    t = 50;
    const c = snap('=== k ===\nABC\n');
    h2.record(b, 'typing in k', textMergeKey('m.ink#k'), c);
    expect(h2.undo(c)?.doc).toBe(b);
  });

  it('a new record after undo clears redo', () => {
    const h = createHistory({ now: () => 0 });
    const a = snap('=== k ===\nA\n');
    const b = snap('=== k ===\nB\n');
    const c = snap('=== k ===\nC\n');
    h.record(a, 't1', null, b);
    h.record(b, 't2', null, c);
    h.undo(c);
    expect(h.flags().canRedo).toBe(true);
    h.record(b, 't3', null, a);
    expect(h.flags().canRedo).toBe(false);
  });

  it('drops the oldest entries past the cap', () => {
    const h = createHistory({ now: () => 0, maxEntries: 2 });
    const a = snap('=== k ===\nA\n');
    const b = snap('=== k ===\nB\n');
    const c = snap('=== k ===\nC\n');
    const d = snap('=== k ===\nD\n');
    h.record(a, '1', null);
    h.record(b, '2', null);
    h.record(c, '3', null);
    expect(h.undo(d)?.label).toBe('3');
    expect(h.undo(c)?.label).toBe('2');
    expect(h.undo(b)).toBeNull();
  });

  it('clear empties both stacks', () => {
    const h = createHistory({ now: () => 0 });
    const a = snap('=== k ===\nA\n');
    const b = snap('=== k ===\nB\n');
    h.record(a, 't', null, b);
    h.undo(b);
    h.clear();
    expect(h.flags()).toEqual({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null });
  });
});

describe('diffFiles', () => {
  it('names the changed path and the first differing line in the restored document', () => {
    const before = [file('=== a ===\nhello\n=== b ===\nB\n')];
    const after = [file('=== a ===\nhello world\n=== b ===\nB\n')];
    const d = diffFiles(before, after);
    expect(d.paths).toEqual(['m.ink']);
    expect(d.firstChange).toMatchObject({ segId: 'm.ink#a', line: 1 });
    expect(editorText(after[0]!.segments[1]!.text).split('\n')[d.firstChange!.line]).toContain('hello world');
  });

  it('matches a renamed knot by file index so the caret stays on the header', () => {
    const live = [file('=== Forestt ===\nA\n')];
    const restored = [file('=== Forest ===\nA\n')];
    const d = diffFiles(live, restored);
    expect(d.firstChange?.segId).toBe('m.ink#Forest');
    expect(d.firstChange?.line).toBe(0);
    expect(d.firstChange?.offset).toBeGreaterThan(0);
    expect(d.changedSegIds).toEqual(['m.ink#Forest']);
  });

  it('prefers a segment that still exists after undoing a create', () => {
    const before = [file('=== a ===\nA\n\n=== b ===\nTODO: write b\n\n')];
    const after = [file('=== a ===\nA\n')];
    const d = diffFiles(before, after);
    expect(d.paths).toEqual(['m.ink']);
    expect(d.firstChange?.segId).not.toBe('m.ink#b');
  });
});

describe('diffLayout', () => {
  it('ignores viewport and reports moved nodes and reroute chains', () => {
    const a: LayoutFile = { ...emptyLayout(), viewport: { x: 0, y: 0, zoom: 1 }, nodes: { k: { x: 0, y: 0 } } };
    const b: LayoutFile = { ...emptyLayout(), viewport: { x: 9, y: 9, zoom: 2 }, nodes: { k: { x: 40, y: 0 } }, reroutes: { 'k->z': [{ x: 1, y: 1 }] } };
    expect(diffLayout(a, b).sort()).toEqual(['k', 'k->z']);
    expect(diffLayout(a, { ...a, viewport: { x: 100, y: 0, zoom: 1 } })).toEqual([]);
  });
});

describe('sameDoc and dirtyFromSaved', () => {
  it('compares by pointer and dirties a file whose bytes drifted from the last save', () => {
    const a = snap('=== k ===\nA\n');
    expect(sameDoc(a, a)).toBe(true);
    expect(sameDoc(a, snap('=== k ===\nA\n'))).toBe(false);
    const files = a.files;
    const saved = savedJoinedOf(files);
    expect(dirtyFromSaved(files, saved)).toEqual({});
    const edited = [file('=== k ===\nB\n')];
    expect(dirtyFromSaved(edited, saved)).toEqual({ 'm.ink': true });
    expect(joinSegments(files[0]!.segments)).toBe('=== k ===\nA\n');
  });
});
