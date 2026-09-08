/**
 * Frozen-snapshot position mapping, the five-rung fail-soft ladder, wire identification, and
 * snapshot-delta helpers for Play Mode.
 *
 * Runtime `{file, line}` is ALWAYS resolved against the compile-time ScriptSnapshot, never against
 * the live store. ops.setSegmentText reflows every later startLine on the first keystroke.
 */
import type { Graph, GraphEdge } from './graph';
import type { ScriptSnapshot } from './playCompile';
import { countLines } from './splitter';
import type { FilePath, InkFile } from './types';
import { relativeLine } from '../ui/flow';
import type { KnotPreview } from './preview';

export interface SourcePos {
  file: FilePath;
  line: number;
}

export interface MappedPos {
  segId: string;
  relLine: number;
}

export type PaintLevel =
  | { level: 'row'; segId: string; relLine: number }
  | { level: 'card'; segId: string }
  | { level: 'hidden'; segId: string; file: FilePath }
  | { level: 'gone'; name: string }
  | { level: 'none' };

type DM = { fileName: string | null; startLineNumber: number } | null;

export interface RuntimeStoryLike {
  state: { outputStream: { ownDebugMetadata: DM }[] };
}

export function posFromOutputStream(story: RuntimeStoryLike): SourcePos[] {
  const os = story.state.outputStream;
  const out: SourcePos[] = [];
  for (const o of os) {
    const dm = o.ownDebugMetadata;
    if (dm && dm.fileName != null) out.push({ file: dm.fileName, line: dm.startLineNumber });
  }
  return out;
}

/** Belt-and-braces: forward slashes, strip BOM, case-insensitive, then basename. Exact key first. */
export function segsForFile(snap: ScriptSnapshot, file: string): { segs: ReturnType<Map<string, InkFile['segments']>['get']>; unmatched: boolean } {
  const direct = snap.byPath.get(file);
  if (direct) return { segs: direct, unmatched: false };
  const norm = file.replace(/\\/g, '/').replace(/^\uFEFF/, '');
  const n2 = snap.byPath.get(norm);
  if (n2) return { segs: n2, unmatched: false };
  const lower = norm.toLowerCase();
  for (const [k, v] of snap.byPath) {
    if (k.toLowerCase() === lower) return { segs: v, unmatched: false };
  }
  const base = norm.split('/').pop() ?? norm;
  let hit: InkFile['segments'] | undefined;
  let n = 0;
  for (const [k, v] of snap.byPath) {
    if ((k.split('/').pop() ?? k) === base) {
      hit = v;
      n++;
    }
  }
  if (n === 1 && hit) return { segs: hit, unmatched: false };
  return { segs: undefined, unmatched: true };
}

export function mapPos(snap: ScriptSnapshot, pos: SourcePos): MappedPos | null {
  const { segs } = segsForFile(snap, pos.file);
  if (!segs) return null;
  for (const s of segs) {
    // splitFile ALWAYS emits a preamble; when a file starts with a knot header that preamble is
    // empty with startLine 1 — the SAME startLine as the first knot. Skip it or line 1 maps to a
    // segment with no graph node and the ladder reports "renamed" for a knot that was never missing.
    if (s.text === '') continue;
    // countLines counts '\n', so a final segment with no trailing newline is one line short.
    const span = countLines(s.text) + (s.text.endsWith('\n') ? 0 : 1);
    if (pos.line >= s.startLine && pos.line < s.startLine + Math.max(1, span)) {
      return { segId: s.id, relLine: pos.line - s.startLine };
    }
  }
  return null;
}

export function liveSegText(files: InkFile[], segId: string): string | undefined {
  for (const f of files) {
    const s = f.segments.find((x) => x.id === segId);
    if (s) return s.text;
  }
  return undefined;
}

export function snapshotName(snap: ScriptSnapshot, segId: string): string {
  const hash = segId.lastIndexOf('#');
  const name = hash >= 0 ? segId.slice(hash + 1) : segId;
  return name || segId;
}

/**
 * Five-rung fail-soft ladder. Never throws, never paints a wrong row.
 * `visible` is "on the canvas": not in hiddenFiles, and not a hidden function.
 */
export function paintLevel(opts: {
  mapped: MappedPos | null;
  snap: ScriptSnapshot;
  files: InkFile[];
  node: { id: string; file: FilePath; isFunction: boolean; kind: string } | undefined;
  hiddenFiles: Record<string, boolean>;
  showFunctions: boolean;
}): PaintLevel {
  const { mapped, snap, files, node, hiddenFiles, showFunctions } = opts;
  if (!mapped) return { level: 'none' };
  if (!node) return { level: 'gone', name: snapshotName(snap, mapped.segId) };
  const hidden = !!hiddenFiles[node.file] || (!showFunctions && node.isFunction);
  if (hidden) return { level: 'hidden', segId: mapped.segId, file: node.file };
  const live = liveSegText(files, mapped.segId);
  const frozen = snap.textById.get(mapped.segId);
  if (live !== undefined && live === frozen) return { level: 'row', segId: mapped.segId, relLine: mapped.relLine };
  return { level: 'card', segId: mapped.segId };
}

/**
 * §2.1's ONE sanctioned exception. GraphEdge.sourceLine is an ABSOLUTE 1-based file line from the LIVE
 * parse, while every other position is a frozen {segId, relLine}. Convert with relativeLine and refuse
 * to light anything when the source segment is not on rung 1.
 */
export function edgeFor(
  graph: Graph,
  from: string,
  to: string,
  lastRelLineInFrom: number | null,
  sourceRung: PaintLevel['level'],
): string | null {
  if (sourceRung !== 'row') return null;
  const cands = graph.edges.filter((e) => e.source === from && e.target === to);
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0]!.id;
  if (lastRelLineInFrom == null) return null;
  const src = graph.nodes.find((n) => n.id === from);
  if (!src || src.kind === 'missing') return null;
  let best: GraphEdge | null = null;
  let bestD = Infinity;
  let tie = false;
  for (const e of cands) {
    if (e.sourceLine == null) continue;
    const rel = relativeLine(e.sourceLine, src.startLine);
    const d = Math.abs(rel - lastRelLineInFrom);
    if (d < bestD) {
      best = e;
      bestD = d;
      tie = false;
    } else if (d === bestD) {
      tie = true;
    }
  }
  return tie ? null : (best?.id ?? null);
}

export function withPlayEdgeClasses<E extends { id: string; className?: string }>(
  edges: E[],
  fx: Record<string, 'lit' | 'now'>,
): E[] {
  return edges.map((e) => {
    const hit = Object.entries(fx).find(([gid]) => e.id === gid || e.id.startsWith(gid + '#'));
    const cls = hit ? (hit[1] === 'now' ? 'play-lit play-lit-now' : 'play-lit') : undefined;
    return e.className === cls ? e : { ...e, className: cls };
  });
}

/** `variablesState` in a state snapshot is a DELTA FROM DEFAULTS. A key present in a and absent in b returned to default. */
export function varNamesChanged(prevJson: string, nextJson: string): string[] {
  let a: Record<string, unknown> = {};
  let b: Record<string, unknown> = {};
  try {
    a = (JSON.parse(prevJson) as { variablesState?: Record<string, unknown> }).variablesState ?? {};
  } catch {
    /* ignore */
  }
  try {
    b = (JSON.parse(nextJson) as { variablesState?: Record<string, unknown> }).variablesState ?? {};
  } catch {
    /* ignore */
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

const EXECUTABLE = new Set(['prose', 'choice', 'divert', 'gather', 'logic', 'stitch']);

export function executableRowCount(preview: KnotPreview): number {
  return preview.rows.filter((r) => EXECUTABLE.has(r.kind)).length;
}

export function coveredRowCount(preview: KnotPreview, relLines: number[]): number {
  const set = new Set(relLines);
  let n = 0;
  for (const r of preview.rows) {
    if (!EXECUTABLE.has(r.kind)) continue;
    let hit = false;
    for (let L = r.from; L <= r.to; L++) if (set.has(L)) { hit = true; break; }
    if (hit) n++;
  }
  return n;
}

export function isExecutableKind(kind: string): boolean {
  return EXECUTABLE.has(kind);
}
