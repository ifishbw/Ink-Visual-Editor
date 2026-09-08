/**
 * Session-only undo/redo of the document: ink files plus sidecar layout, minus the camera.
 * Snapshots are pointer copies of the store's already-immutable objects; coalescing drops a
 * new record rather than merging patches, so there is no inverse to get wrong.
 */
import { editorText } from './ops';
import { joinSegments } from './splitter';
import type { LayoutFile, NodeLayout } from './layout';
import type { InkFile } from './types';

export const HISTORY_IDLE_MS = 500;
export const HISTORY_MAX_ENTRIES = 200;

export interface DocSnapshot {
  files: InkFile[];
  layout: LayoutFile;
}

export interface HistoryEntry {
  doc: DocSnapshot;
  /** Button tooltip: "typing in forest", "move 3 nodes". */
  label: string;
  /** Consecutive records with the same key inside the idle window collapse. null = never merge. */
  mergeKey: string | null;
  started: number;
  at: number;
}

export interface HistoryFlags {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

/** Where to put the caret after restoring `after` over `before`. `after` owns the ids. */
export interface FileDiff {
  paths: string[];
  /** Segment ids in `after` whose text (or identity) differs. Used to remount the open editor. */
  changedSegIds: string[];
  firstChange: { segId: string; line: number; offset: number } | null;
}

export function textMergeKey(segId: string): string {
  return `text:${segId}`;
}

export function sameDoc(a: DocSnapshot, b: DocSnapshot): boolean {
  return a.files === b.files && a.layout === b.layout;
}

export function dirtyFromSaved(files: InkFile[], savedJoined: Record<string, string>): Record<string, true> {
  const dirty: Record<string, true> = {};
  for (const f of files) {
    if (joinSegments(f.segments) !== (savedJoined[f.path] ?? '')) dirty[f.path] = true;
  }
  return dirty;
}

export function savedJoinedOf(files: InkFile[]): Record<string, string> {
  return Object.fromEntries(files.map((f) => [f.path, joinSegments(f.segments)]));
}

/**
 * Paths whose joined text differs, plus the first segment/line that differs, preferring a
 * segment that exists in `after` (so undoing a create does not focus a knot that is gone).
 */
export function diffFiles(before: InkFile[], after: InkFile[]): FileDiff {
  const beforeByPath = new Map(before.map((f) => [f.path, f]));
  const afterByPath = new Map(after.map((f) => [f.path, f]));
  const paths: string[] = [];
  for (const path of new Set([...beforeByPath.keys(), ...afterByPath.keys()])) {
    const bt = beforeByPath.has(path) ? joinSegments(beforeByPath.get(path)!.segments) : '';
    const at = afterByPath.has(path) ? joinSegments(afterByPath.get(path)!.segments) : '';
    if (bt !== at) paths.push(path);
  }

  const changedSegIds: string[] = [];
  let firstChange: FileDiff['firstChange'] = null;
  for (const aFile of after) {
    const bSegs = beforeByPath.get(aFile.path)?.segments ?? [];
    const bById = new Map(bSegs.map((s) => [s.id, s]));
    for (let i = 0; i < aFile.segments.length; i++) {
      const seg = aFile.segments[i]!;
      // A rename changes the segment id; the same index in the file is still the same knot.
      const prev = bById.get(seg.id) ?? (bSegs[i] && bSegs[i]!.kind === seg.kind ? bSegs[i] : undefined);
      if (prev?.text === seg.text) continue;
      changedSegIds.push(seg.id);
      if (!firstChange) firstChange = caretIn(editorText(prev?.text ?? ''), editorText(seg.text), seg.id);
    }
  }
  return { paths, changedSegIds, firstChange };
}

/** Layout keys whose node entry or reroute chain differs. Viewport is ignored. */
export function diffLayout(before: LayoutFile, after: LayoutFile): string[] {
  const keys: string[] = [];
  for (const k of new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)])) {
    if (!sameNode(before.nodes[k], after.nodes[k])) keys.push(k);
  }
  for (const k of new Set([...Object.keys(before.reroutes), ...Object.keys(after.reroutes)])) {
    if (JSON.stringify(before.reroutes[k] ?? null) !== JSON.stringify(after.reroutes[k] ?? null)) keys.push(k);
  }
  return keys;
}

export interface History {
  record(before: DocSnapshot, label: string, mergeKey: string | null, after?: DocSnapshot): void;
  /** Push `live` onto redo, pop past, return the snapshot to restore. */
  undo(live: DocSnapshot): HistoryEntry | null;
  redo(live: DocSnapshot): HistoryEntry | null;
  clear(): void;
  breakRun(): void;
  flags(): HistoryFlags;
}

export function createHistory(opts?: { now?: () => number; idleMs?: number; maxEntries?: number }): History {
  const now = opts?.now ?? Date.now;
  const idleMs = opts?.idleMs ?? HISTORY_IDLE_MS;
  const maxEntries = opts?.maxEntries ?? HISTORY_MAX_ENTRIES;
  const past: HistoryEntry[] = [];
  const future: HistoryEntry[] = [];
  let openRun = false;
  let lastAfter: DocSnapshot | null = null;
  let lastRange: { from: number; inserted: number } | null = null;

  const breakRun = () => {
    openRun = false;
    lastAfter = null;
    lastRange = null;
  };

  return {
    record(before, label, mergeKey, after) {
      future.length = 0;
      const t = now();
      const top = past[past.length - 1];
      const canMerge =
        openRun &&
        top !== undefined &&
        mergeKey !== null &&
        top.mergeKey === mergeKey &&
        t - top.at < idleMs &&
        after !== undefined &&
        lastAfter !== null &&
        typingTouches(mergeKey, lastAfter, after, lastRange);
      if (canMerge && top) {
        top.at = t;
        lastRange = typingRange(mergeKey, lastAfter!, after!);
        lastAfter = after!;
        return;
      }
      past.push({ doc: before, label, mergeKey, started: t, at: t });
      if (past.length > maxEntries) past.shift();
      openRun = true;
      lastAfter = after ?? null;
      lastRange = after !== undefined && mergeKey !== null ? typingRange(mergeKey, before, after) : null;
    },

    undo(live) {
      const e = past.pop();
      if (!e) return null;
      future.push({ doc: live, label: e.label, mergeKey: null, started: e.started, at: now() });
      breakRun();
      return e;
    },

    redo(live) {
      const e = future.pop();
      if (!e) return null;
      past.push({ doc: live, label: e.label, mergeKey: null, started: e.started, at: now() });
      breakRun();
      return e;
    },

    clear() {
      past.length = 0;
      future.length = 0;
      breakRun();
    },

    breakRun,

    flags() {
      const u = past[past.length - 1];
      const r = future[future.length - 1];
      return {
        canUndo: u !== undefined,
        canRedo: r !== undefined,
        undoLabel: u?.label ?? null,
        redoLabel: r?.label ?? null,
      };
    },
  };
}

function typingTouches(
  mergeKey: string,
  prevAfter: DocSnapshot,
  nextAfter: DocSnapshot,
  prevRange: { from: number; inserted: number } | null,
): boolean {
  const span = editSpan(segmentText(prevAfter, mergeKey), segmentText(nextAfter, mergeKey));
  if (!span) return false;
  if (!prevRange) return true;
  const prevEnd = prevRange.from + prevRange.inserted;
  const nextEnd = span.from + span.removed;
  return nextEnd >= prevRange.from && span.from <= prevEnd;
}

function typingRange(mergeKey: string, before: DocSnapshot, after: DocSnapshot): { from: number; inserted: number } | null {
  const span = editSpan(segmentText(before, mergeKey), segmentText(after, mergeKey));
  if (!span) return null;
  return { from: span.from, inserted: span.inserted };
}

function segmentText(doc: DocSnapshot, mergeKey: string): string {
  if (!mergeKey.startsWith('text:')) return '';
  const id = mergeKey.slice('text:'.length);
  for (const f of doc.files) {
    const s = f.segments.find((sg) => sg.id === id);
    if (s) return editorText(s.text);
  }
  return '';
}

/** Common-prefix / common-suffix span of two strings. `from`/`removed` are in `before`. */
export function editSpan(before: string, after: string): { from: number; removed: number; inserted: number } | null {
  if (before === after) return null;
  let from = 0;
  const max = Math.min(before.length, after.length);
  while (from < max && before.charCodeAt(from) === after.charCodeAt(from)) from++;
  let tail = 0;
  while (tail < max - from && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
  return { from, removed: before.length - from - tail, inserted: after.length - from - tail };
}

function caretIn(before: string, after: string, segId: string): FileDiff['firstChange'] {
  const span = editSpan(before, after);
  const at = span ? Math.min(span.from, after.length) : 0;
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < at && i < after.length; i++) {
    if (after.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { segId, line, offset: at - lineStart };
}

function sameNode(a: NodeLayout | undefined, b: NodeLayout | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.collapsed === b.collapsed;
}
