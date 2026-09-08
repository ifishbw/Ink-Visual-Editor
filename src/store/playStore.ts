/**
 * Play Mode store. A second zustand store on purpose: DocSnapshot is `{files, layout}` of
 * projectStore, so a field here cannot enter an undo entry (PLAY_MODE_PLAN.md §4.4).
 *
 * The compiled Story lives in a module-level `session`, not in zustand — it mutates in place
 * without changing identity. `session = null` is the hard block on Continue() after a failed
 * ValidateExternalBindings (inkjs latches `_hasValidatedExternals` even on throw).
 *
 * Playback-driven setFocusLine (follow editor, off by default) calls history.breakRun() on knot
 * transitions. Follow-camera never touches selection. Badge clicks are explicit user gestures.
 *
 * HMR: editing this file with `npm run dev` open reloads the page and destroys the in-memory Story.
 */
import { create } from 'zustand';
import { buildPreview, lineToRow } from '../model/preview';
import { editorText } from '../model/ops';
import {
  compileForPlay,
  errorText,
  type CompileResult,
  type ExternalStub,
  type PlayNote,
  type RuntimeStory,
  type ScriptSnapshot,
} from '../model/playCompile';
import {
  coveredRowCount,
  edgeFor,
  executableRowCount,
  mapPos,
  paintLevel,
  posFromOutputStream,
  segsForFile,
  snapshotName,
  varNamesChanged,
  type MappedPos,
  type PaintLevel,
  type SourcePos,
} from '../model/playMap';
import type { PlayFxInput } from '../model/playFx';
import type { Diagnostic } from '../model/types';
import { setReservedRightPx, useProjectStore } from './projectStore';

export type PlayStatus = 'idle' | 'compiling' | 'cantPlay' | 'running' | 'paused' | 'ended' | 'error';

export interface PlayLine {
  text: string;
  tags: string[];
  at: SourcePos | null;
  frags: SourcePos[];
  fault: string | null;
  notice: string | null;
  jumpNote: string | null;
  turn: number;
}

export interface PlayChoice {
  index: number;
  text: string;
}

export interface PlayVar {
  name: string;
  value: string;
  kind: 'number' | 'string' | 'bool' | 'locked';
  delta: string | null;
}

export type Recorded = { t: 'choice'; index: number; text: string } | { t: 'poke'; name: string; value: string };

const PLAY_WIDTH_KEY = 'inkvisual:playWidth';
const PLAY_OPEN_KEY = 'inkvisual:playOpen';
export const MIN_PLAY_WIDTH = 240;
export const DEFAULT_PLAY_WIDTH = 300;
const MIN_CANVAS_PX = 360;
const SIDEBAR_PX = 300;
const SNAP_CAP = 1000;
const LINE_CAP = 2000;
const LOOP_STEPS = 10_000;
const LOOP_MS = 250;

type Session = {
  story: RuntimeStory;
  snapshot: ScriptSnapshot;
  root: string;
  snaps: { json: string; lines: number; turn: number; edgeFx: Record<string, 'lit' | 'now'>; trail: Record<string, number> }[];
  lastVars: Map<string, string>;
  nudged: Set<string>;
  prologue: string;
  lastFrom: MappedPos | null;
  oneShot: MappedPos | null;
  pendingError: string | null;
};

let session: Session | null = null;
let lastRoot: string | null | undefined = undefined;
let lastFiles: unknown = undefined;
let lastGraph: unknown = undefined;
let lastHidden: unknown = undefined;
let lastShowFn: unknown = undefined;
let collapsedDockOnce = false;

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

function clampPlayWidth(px: number): number {
  const p = useProjectStore.getState();
  const dock = p.dockOpen ? p.dockWidth : 40;
  const sidebar = p.sidebarOpen ? SIDEBAR_PX : 40;
  const room = typeof window === 'undefined' ? 1200 : Math.max(MIN_PLAY_WIDTH, window.innerWidth - sidebar - dock - MIN_CANVAS_PX);
  return Math.round(Math.max(MIN_PLAY_WIDTH, Math.min(px, room)));
}

function describeValue(v: unknown): { value: string; kind: PlayVar['kind'] } {
  if (typeof v === 'number') return { value: Number.isFinite(v) ? String(v) : String(v), kind: 'number' };
  if (typeof v === 'boolean') return { value: v ? 'true' : 'false', kind: 'bool' };
  if (typeof v === 'string') return { value: v, kind: 'string' };
  if (v && typeof v === 'object' && 'componentsString' in v) {
    return { value: `-> ${String((v as { componentsString: string }).componentsString)}`, kind: 'locked' };
  }
  return { value: v == null ? String(v) : String(v), kind: 'locked' };
}

function collectUnsettable(story: RuntimeStory): string[] {
  const vs = story.variablesState;
  const names: string[] = [];
  for (const name of Object.keys(vs)) {
    const v = vs.$(name);
    if (typeof v !== 'number' && typeof v !== 'boolean' && typeof v !== 'string') names.push(name);
  }
  return names;
}

function liveNode(id: string) {
  return useProjectStore.getState().graph.nodes.find((n) => n.id === id);
}

function resolvePaint(mapped: MappedPos | null): PaintLevel {
  if (!session) return { level: 'none' };
  const p = useProjectStore.getState();
  const node = mapped ? liveNode(mapped.segId) : undefined;
  return paintLevel({
    mapped,
    snap: session.snapshot,
    files: p.files,
    node,
    hiddenFiles: p.hiddenFiles,
    showFunctions: p.showFunctions,
  });
}

function mapFrags(frags: SourcePos[]): MappedPos[] {
  if (!session) return [];
  const out: MappedPos[] = [];
  for (const f of frags) {
    const m = mapPos(session.snapshot, f);
    if (m) out.push(m);
  }
  return out;
}

function noteUnmatched(frags: SourcePos[], unmatched: string[]): string[] {
  if (!session) return unmatched;
  let next = unmatched;
  for (const f of frags) {
    const { unmatched: miss } = segsForFile(session.snapshot, f.file);
    if (miss && !next.includes(f.file)) next = [...next, f.file];
  }
  return next;
}

function armed(segId: string, relLine: number, oneShot: MappedPos | null, bps: Record<string, number[]>): boolean {
  if (oneShot && oneShot.segId === segId && oneShot.relLine === relLine) return true;
  return (bps[segId] ?? []).includes(relLine);
}

function staleNudgeFor(mapped: MappedPos[], staleSegs: string[], nudged: Set<string>): string | null {
  for (const m of mapped) {
    if (!staleSegs.includes(m.segId) || nudged.has(m.segId)) continue;
    nudged.add(m.segId);
    const name = liveNode(m.segId)?.name ?? snapshotName(session!.snapshot, m.segId);
    return `⬤ \`${name}\` has been edited since this run — what plays here is the old text. ⟳ Replay to include the edit.`;
  }
  return null;
}

function covTotals(snap: ScriptSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, text] of snap.textById) {
    out[id] = executableRowCount(buildPreview(editorText(text)));
  }
  return out;
}

export interface PlayState extends PlayFxInput {
  status: PlayStatus;
  sessionId: number;
  startLabel: string;
  startPath: string | null;
  startedMidStory: boolean;
  unsettableGlobals: string[];
  stale: boolean;
  staleOnPath: boolean;
  diagnostics: Diagnostic[];
  stubbed: ExternalStub[];
  unmatchedFiles: string[];
  notes: PlayNote[];
  lines: PlayLine[];
  choices: PlayChoice[];
  turn: number;
  paint: PaintLevel;
  atNodeId: string | null;
  atRow: number | null;
  vars: PlayVar[];
  edgeFx: Record<string, 'lit' | 'now'>;
  breakpoints: Record<string, number[]>;
  watchNames: string[];
  caret: { segId: string; relLine: number } | null;
  recording: Recorded[];
  divergence: { at: number; expected: string; found: string } | null;
  open: boolean;
  width: number;
  followCamera: boolean;
  followDock: boolean;
  varsOpen: boolean;
  coverageOpen: boolean;
  bpOpen: boolean;
  peekId: string | null;
  peekSeq: number;

  run(start: { kind: 'story' } | { kind: 'knot'; name: string }): void;
  restart(): void;
  step(): void;
  choose(index: number): void;
  back(): void;
  backTurn(): void;
  runToCursor(): void;
  stop(): void;
  setVar(name: string, raw: string): void;
  setStubValue(name: string, value: number): void;
  toggleBreakpoint(segId: string, relLine: number): void;
  toggleWatch(name: string): void;
  setCaret(segId: string | null, relLine?: number): void;
  replay(): void;
  setOpen(v: boolean): void;
  setWidth(px: number): void;
  setToggle(which: 'camera' | 'dock' | 'dim', v: boolean): void;
  setDrawer(which: 'vars' | 'coverage' | 'bp', v: boolean): void;
  clickBadge(at: SourcePos): void;
  clickNote(note: PlayNote): void;
  revealNode(id: string): void;
  noticeProjectChange(): void;
}

const initialWidth = clampPlayWidth(Number(readLS(PLAY_WIDTH_KEY)) || DEFAULT_PLAY_WIDTH);
const initialOpen = readLS(PLAY_OPEN_KEY) === 'open';

let widthTimer: ReturnType<typeof setTimeout> | null = null;

export const usePlayStore = create<PlayState>((set, get) => {
  const emptyPaint: PaintLevel = { level: 'none' };

  function resetPlayFields(extra: Partial<PlayState> = {}): void {
    set({
      status: 'idle',
      startLabel: 'Story start',
      startPath: null,
      startedMidStory: false,
      unsettableGlobals: [],
      stale: false,
      staleSegs: [],
      staleOnPath: false,
      diagnostics: [],
      stubbed: [],
      unmatchedFiles: [],
      notes: [],
      lines: [],
      choices: [],
      turn: 0,
      paint: emptyPaint,
      atNodeId: null,
      atRow: null,
      vars: [],
      visits: {},
      covLines: {},
      covHits: {},
      covTotal: {},
      edgeFx: {},
      trail: {},
      stepRows: {},
      recording: [],
      divergence: null,
      peekId: null,
      peekSeq: get().peekSeq,
      ...extra,
    });
  }

  function hardStop(note: string | null): void {
    session = null;
    resetPlayFields({
      status: 'idle',
      notes: note ? [{ kind: 'info', text: note }] : [],
    });
  }

  function maybeCollapseDock(): void {
    if (collapsedDockOnce || typeof window === 'undefined') return;
    const p = useProjectStore.getState();
    const playW = get().width;
    if (window.innerWidth - SIDEBAR_PX - p.dockWidth - playW < MIN_CANVAS_PX) {
      collapsedDockOnce = true;
      p.setDockOpen(false);
      const notes = get().notes.filter((n) => !n.text.includes('editor collapsed'));
      set({
        notes: [...notes, { kind: 'info', text: 'editor collapsed to make room — click `‹ ink` to bring it back.' }],
      });
    }
  }

  function applyCompileFailure(result: CompileResult, keepSession: boolean): void {
    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    const notes: PlayNote[] = [];
    if (result.externalsUnrepairable) {
      notes.push({
        kind: 'error',
        text: `can't run: unbound EXTERNAL ${result.externalsUnrepairable.map((n) => `'${n}'`).join(', ')}`,
      });
    } else if (errs.length) {
      const first = errs[0]!;
      const mapped =
        first.file != null
          ? mapPos(result.snapshot, { file: first.file, line: first.line ?? 1 })
          : null;
      notes.push({
        kind: 'error',
        text: `${errs.length} error${errs.length === 1 ? '' : 's'} — can't run. ${first.message}`,
        action: mapped ? { kind: 'jump', segId: mapped.segId, relLine: mapped.relLine } : undefined,
      });
    }
    if (keepSession && session) {
      set({ notes: [...get().notes.filter((n) => n.kind !== 'error'), ...notes], diagnostics: result.diagnostics });
      return;
    }
    session = null;
    set({
      status: 'cantPlay',
      diagnostics: result.diagnostics,
      stubbed: result.stubbed,
      notes,
      choices: [],
    });
  }

  function beginSession(
    result: CompileResult,
    startPath: string | null,
    startLabel: string,
    recording: Recorded[],
    mid: boolean,
    opts?: { autoPlay?: boolean; oneShot?: MappedPos | null },
  ): void {
    const story = result.story!;
    story.onError = (msg) => {
      if (session) session.pendingError = msg;
    };
    if (startPath) {
      try {
        story.ChoosePathString(startPath);
      } catch (e) {
        session = null;
        set({
          status: 'cantPlay',
          notes: [{ kind: 'error', text: `couldn't start at ${startPath}: ${errorText(e)}` }],
        });
        return;
      }
    }
    const unsettable = collectUnsettable(story);
    const prologue = story.state.ToJson();
    session = {
      story,
      snapshot: result.snapshot,
      root: result.snapshot.root,
      snaps: [],
      lastVars: new Map(),
      nudged: new Set(),
      prologue,
      lastFrom: null,
      oneShot: opts?.oneShot ?? null,
      pendingError: null,
    };
    const notes: PlayNote[] = [];
    for (const s of result.stubbed) notes.push({ kind: 'warn', text: `${s.name}() stubbed → ${s.value}` });
    for (const d of result.diagnostics.filter((x) => x.severity === 'warning')) {
      notes.push({ kind: 'warn', text: d.message });
    }
    if (mid) {
      let t = `Started at ${startLabel} — nothing before it ran, so globals are at their declared defaults.`;
      if (unsettable.length) {
        t += ` ${unsettable.length} gating variable${unsettable.length === 1 ? '' : 's'} can't be set here: ${unsettable.join(', ')} — play from the start to set them.`;
      }
      notes.push({ kind: 'warn', text: t });
    }
    set({
      status: 'running',
      sessionId: get().sessionId + 1,
      startLabel,
      startPath,
      startedMidStory: mid,
      unsettableGlobals: unsettable,
      stale: false,
      staleSegs: [],
      staleOnPath: false,
      diagnostics: result.diagnostics,
      stubbed: result.stubbed,
      unmatchedFiles: [],
      notes,
      lines: [],
      turn: 0,
      covLines: {},
      covHits: {},
      covTotal: covTotals(result.snapshot),
      visits: {},
      edgeFx: {},
      trail: {},
      stepRows: {},
      recording,
      divergence: null,
      paint: emptyPaint,
      atNodeId: null,
      atRow: null,
    });
    if (opts?.autoPlay !== false) playToWait();
  }

  function compileAndStart(
    startPath: string | null,
    startLabel: string,
    mid: boolean,
    recording: Recorded[] = [],
    opts?: { autoPlay?: boolean; oneShot?: MappedPos | null },
  ): void {
    const p = useProjectStore.getState();
    if (!p.root) {
      set({ status: 'cantPlay', notes: [{ kind: 'error', text: 'No project open.' }] });
      return;
    }
    set({ status: 'compiling', open: true });
    maybeCollapseDock();
    const result = compileForPlay(p.root, p.files, p.parse);
    if (!result.story || result.externalsUnrepairable) {
      applyCompileFailure(result, false);
      return;
    }
    beginSession(result, startPath, startLabel, recording, mid, opts);
  }

  function readVars(changed: string[]): PlayVar[] {
    if (!session) return [];
    const vs = session.story.variablesState;
    const vars: PlayVar[] = [];
    for (const name of Object.keys(vs)) {
      const raw = vs.$(name);
      const { value, kind } = describeValue(raw);
      const prev = session.lastVars.get(name);
      const delta = changed.includes(name) && prev !== undefined ? `${prev} → ${value}` : changed.includes(name) ? value : null;
      vars.push({ name, value, kind, delta });
    }
    for (const v of vars) session.lastVars.set(v.name, v.value);
    return vars;
  }

  function readVisits(): Record<string, number> {
    if (!session) return {};
    const visits: Record<string, number> = {};
    for (const n of useProjectStore.getState().graph.nodes) {
      if (n.kind !== 'knot' || n.isFunction) continue;
      visits[n.id] = session.story.state.VisitCountAtPathString(n.name) ?? 0;
    }
    return visits;
  }

  function followEditorIfNeeded(paint: PaintLevel): void {
    if (!get().followDock || paint.level !== 'row') return;
    useProjectStore.getState().setFocusLine(paint.segId, paint.relLine);
  }

  function refreshAfterMove(opts?: { keepFx?: boolean; refreshVars?: boolean }): void {
    if (!session) return;
    const story = session.story;
    const last = get().lines.at(-1);
    const mapped = last ? mapFrags(last.frags) : [];
    const playhead = mapped.at(-1) ?? null;
    const paint = resolvePaint(playhead);
    let atNodeId: string | null = null;
    let atRow: number | null = null;
    const stepRows: Record<string, number[]> = {};
    const views = useProjectStore.getState().views;
    if (paint.level === 'row' || paint.level === 'card') atNodeId = paint.segId;
    if (paint.level === 'row') {
      const preview = views[paint.segId]?.preview;
      atRow = preview ? lineToRow(preview, paint.relLine) : paint.relLine;
    }
    if (paint.level === 'row') {
      for (const m of mapped) {
        const preview = views[m.segId]?.preview;
        const row = preview ? lineToRow(preview, m.relLine) : m.relLine;
        (stepRows[m.segId] ??= []).push(row);
      }
    }
    const ended = !story.canContinue && story.currentChoices.length === 0;
    const callstackDepth = (story.state as unknown as { callstackDepth: number }).callstackDepth;
    const notes = [...get().notes.filter((n) => n.kind !== 'info' || !n.text.startsWith('the playhead is in'))];
    if (paint.level === 'hidden') {
      notes.push({
        kind: 'info',
        text: `the playhead is in ${paint.file}, which is hidden — show it to follow along`,
        action: { kind: 'reveal', file: paint.file },
      });
    } else if (paint.level === 'none' && last && last.frags.length === 0) {
      notes.push({ kind: 'info', text: 'position not mapped' });
    } else if (paint.level === 'none' && last?.at) {
      notes.push({ kind: 'info', text: 'position not mapped' });
    }
    if (ended) {
      if (callstackDepth > 1) {
        notes.push({ kind: 'warn', text: `ended inside a tunnel: a \`->->\` may be missing (callstack depth ${callstackDepth})` });
      }
    }
    const choices = story.currentChoices.map((c, i) => ({ index: i, text: c.text }));
    const covHits: Record<string, number> = { ...get().covHits };
    for (const [id, lines] of Object.entries(get().covLines)) {
      const preview = views[id]?.preview;
      if (preview) covHits[id] = coveredRowCount(preview, lines);
    }
    set({
      choices,
      vars: opts?.refreshVars || get().vars.length === 0 ? readVars([]) : get().vars,
      visits: readVisits(),
      paint,
      atNodeId,
      atRow,
      stepRows,
      covHits,
      notes,
      status: last?.fault ? 'paused' : ended ? 'ended' : get().status === 'paused' ? 'paused' : 'running',
      ...(opts?.keepFx ? {} : {}),
    });
    followEditorIfNeeded(paint);
  }

  function lightEdges(mapped: MappedPos[]): string | null {
    if (!session) return null;
    const graph = useProjectStore.getState().graph;
    const fx = { ...get().edgeFx };
    for (const [k, v] of Object.entries(fx)) if (v === 'now') fx[k] = 'lit';
    let jumpNote: string | null = null;
    const chain: MappedPos[] = [];
    if (session.lastFrom) chain.push(session.lastFrom);
    chain.push(...mapped);
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1]!;
      const b = chain[i]!;
      if (a.segId === b.segId) continue;
      const rung = resolvePaint(a).level;
      const id = edgeFor(graph, a.segId, b.segId, a.relLine, rung);
      if (id) fx[id] = 'now';
      else {
        const name = liveNode(b.segId)?.name ?? snapshotName(session.snapshot, b.segId);
        jumpNote = `→ ${name} (jump not drawn)`;
      }
    }
    set({ edgeFx: fx });
    if (mapped.length) session.lastFrom = mapped[mapped.length - 1]!;
    return jumpNote;
  }

  function addCoverage(mapped: MappedPos[]): Record<string, number[]> {
    const cov = { ...get().covLines };
    for (const m of mapped) {
      const cur = cov[m.segId] ?? [];
      if (!cur.includes(m.relLine)) cov[m.segId] = [...cur, m.relLine].sort((a, b) => a - b);
    }
    return cov;
  }

  function addTrail(mapped: MappedPos[]): Record<string, number> {
    const trail = { ...get().trail };
    const step = get().lines.length;
    for (const m of mapped) trail[m.segId] = step;
    return trail;
  }

  function oneStep(): 'ok' | 'break' | 'fault' {
    if (!session) return 'fault';
    const before = session.story.state.ToJson();
    session.pendingError = null;
    let text = '';
    let tags: string[] = [];
    let fault: string | null = null;
    try {
      text = session.story.Continue() ?? '';
      tags = session.story.currentTags ?? [];
    } catch (e) {
      fault = errorText(e);
    }
    if (!fault && session.pendingError) fault = session.pendingError;
    const frags = posFromOutputStream(session.story);
    const unmatched = noteUnmatched(frags, get().unmatchedFiles);
    const mapped = mapFrags(frags);
    session.snaps.push({ json: before, lines: get().lines.length, turn: get().turn, edgeFx: get().edgeFx, trail: get().trail });
    if (session.snaps.length > SNAP_CAP) session.snaps.shift();

    const bps = get().breakpoints;
    const hit = mapped.find((m) => armed(m.segId, m.relLine, session!.oneShot, bps));
    if (hit && !fault) {
      const snap = session.snaps.pop();
      if (snap) session.story.state.LoadJson(snap.json);
      session.oneShot = null;
      const name = liveNode(hit.segId)?.name ?? snapshotName(session.snapshot, hit.segId);
      set({
        unmatchedFiles: unmatched,
        status: 'paused',
        notes: [
          ...get().notes.filter((n) => !n.text.startsWith('about to execute')),
          {
            kind: 'info',
            text: `about to execute ${name} line ${hit.relLine + 1}`,
            action: { kind: 'jump', segId: hit.segId, relLine: hit.relLine },
          },
        ],
      });
      refreshAfterMove({ refreshVars: true });
      return 'break';
    }

    const after = session.story.state.ToJson();
    const changed = varNamesChanged(before, after);
    const watched = changed.filter((n) => get().watchNames.includes(n));

    const jumpNote = lightEdges(mapped);
    const notice = staleNudgeFor(mapped, get().staleSegs, session.nudged);
    let lineText = text.trimEnd();
    if (fault && !lineText) lineText = '';
    const faultText = fault ? (fault.includes('threw') ? fault : `✖ ${fault}`) : null;
    const line: PlayLine = {
      text: lineText,
      tags,
      at: frags.at(-1) ?? null,
      frags,
      fault: faultText,
      notice,
      jumpNote,
      turn: get().turn,
    };
    let lines = [...get().lines, line];
    if (lines.length > LINE_CAP) lines = lines.slice(-LINE_CAP);
    const covLines = addCoverage(mapped);
    const trail = addTrail(mapped);
    set({
      lines,
      unmatchedFiles: unmatched,
      covLines,
      trail,
      vars: readVars(changed),
    });
    if (fault) {
      set({ status: 'paused' });
      refreshAfterMove();
      return 'fault';
    }
    if (watched.length) {
      set({
        status: 'paused',
        notes: [...get().notes.filter((n) => !n.text.startsWith('watch')), { kind: 'info', text: `watch: ${watched.join(', ')} changed` }],
      });
      refreshAfterMove();
      return 'break';
    }
    return 'ok';
  }

  function playToWait(): void {
    if (!session) return;
    const t0 = performance.now();
    let n = 0;
    const lastPos: string[] = [];
    while (session.story.canContinue) {
      n++;
      if (n > LOOP_STEPS || performance.now() - t0 > LOOP_MS) {
        const tail = lastPos.slice(-5).join(', ') || 'unknown';
        const lines = [
          ...get().lines,
          {
            text: '',
            tags: [],
            at: null,
            frags: [],
            fault: `stopped after ${n} steps — possible infinite loop (last: ${tail})`,
            notice: null,
            jumpNote: null,
            turn: get().turn,
          } satisfies PlayLine,
        ];
        set({ lines, status: 'paused' });
        break;
      }
      const r = oneStep();
      const last = get().lines.at(-1);
      if (last?.at) lastPos.push(`${last.at.file}:${last.at.line}`);
      if (r !== 'ok') {
        return;
      }
    }
    refreshAfterMove();
  }

  function recomputeStale(): void {
    if (!session) return;
    const files = useProjectStore.getState().files;
    const staleSegs: string[] = [];
    for (const f of files) {
      for (const s of f.segments) {
        const frozen = session.snapshot.textById.get(s.id);
        if (frozen !== undefined && frozen !== s.text) staleSegs.push(s.id);
      }
    }
    const touched = new Set([...Object.keys(get().covLines), ...Object.keys(get().trail)]);
    const at = get().atNodeId;
    if (at) touched.add(at);
    const staleOnPath = staleSegs.some((id) => touched.has(id));
    const stale = staleSegs.length > 0;
    const notes = get().notes.filter((n) => !n.text.includes('changed —') && !n.text.includes('changed since this run'));
    if (staleSegs.length) {
      const id = staleSegs.find((s) => touched.has(s)) ?? staleSegs[0]!;
      const node = liveNode(id);
      const label = node ? `${node.file}#${node.name}` : id;
      notes.push({
        kind: staleOnPath ? 'warn' : 'info',
        text: `${label} changed — ⟲ Restart to resync`,
      });
    }
    set({ stale, staleSegs, staleOnPath, notes });
    const last = get().lines.at(-1);
    const mapped = last ? mapFrags(last.frags).at(-1) ?? null : null;
    const paint = resolvePaint(mapped);
    let atNodeId: string | null = null;
    let atRow: number | null = null;
    if (paint.level === 'row' || paint.level === 'card') atNodeId = paint.segId;
    if (paint.level === 'row') {
      const preview = useProjectStore.getState().views[paint.segId]?.preview;
      atRow = preview ? lineToRow(preview, paint.relLine) : paint.relLine;
    }
    set({ paint, atNodeId, atRow });
  }

  return {
    status: 'idle',
    sessionId: 0,
    startLabel: 'Story start',
    startPath: null,
    startedMidStory: false,
    unsettableGlobals: [],
    stale: false,
    staleSegs: [],
    staleOnPath: false,
    diagnostics: [],
    stubbed: [],
    unmatchedFiles: [],
    notes: [],
    lines: [],
    choices: [],
    turn: 0,
    paint: emptyPaint,
    atNodeId: null,
    atRow: null,
    vars: [],
    visits: {},
    covLines: {},
    covHits: {},
    covTotal: {},
    edgeFx: {},
    trail: {},
    stepRows: {},
    breakpoints: {},
    watchNames: [],
    caret: null,
    recording: [],
    divergence: null,
    open: initialOpen,
    width: initialWidth,
    followCamera: false,
    followDock: false,
    dim: true,
    varsOpen: true,
    coverageOpen: false,
    bpOpen: false,
    peekId: null,
    peekSeq: 0,

    run(start) {
      const mid = start.kind === 'knot';
      const label = start.kind === 'story' ? 'Story start' : start.name;
      const path = start.kind === 'story' ? null : start.name;
      get().setOpen(true);
      compileAndStart(path, label, mid, []);
    },

    restart() {
      if (!get().open) get().setOpen(true);
      compileAndStart(get().startPath, get().startLabel, get().startedMidStory, []);
    },

    step() {
      if (!session) return;
      if (get().status === 'ended') return;
      set({ status: 'running' });
      if (session.story.canContinue) {
        const r = oneStep();
        if (r === 'ok') refreshAfterMove();
      }
    },

    choose(index) {
      if (!session) return;
      const ch = get().choices[index];
      if (!ch) return;
      try {
        session.story.ChooseChoiceIndex(index);
      } catch (e) {
        set({
          lines: [
            ...get().lines,
            {
              text: '',
              tags: [],
              at: null,
              frags: [],
              fault: errorText(e),
              notice: null,
              jumpNote: null,
              turn: get().turn,
            },
          ],
          status: 'paused',
        });
        return;
      }
      set({ recording: [...get().recording, { t: 'choice', index, text: ch.text }], turn: get().turn + 1, status: 'running' });
      playToWait();
    },

    back() {
      if (!session) return;
      const s = session.snaps.pop();
      if (!s) return;
      session.story.state.LoadJson(s.json);
      session.lastFrom = null;
      set({ lines: get().lines.slice(0, s.lines), turn: s.turn, edgeFx: s.edgeFx, trail: s.trail, status: 'running' });
      refreshAfterMove({ keepFx: true, refreshVars: true });
    },

    backTurn() {
      if (!session) return;
      const cur = get().turn;
      if (cur === 0) {
        while (session.snaps.length) get().back();
        return;
      }
      while (session.snaps.length && get().turn >= cur) get().back();
    },

    runToCursor() {
      const caret = get().caret;
      const focus = useProjectStore.getState().focus;
      const aim = caret ?? (focus ? { segId: focus.segId, relLine: focus.line } : null);
      if (!aim) return;
      get().setOpen(true);
      if (!session) {
        compileAndStart(get().startPath, get().startLabel, get().startedMidStory, [], { oneShot: aim });
        return;
      }
      session.oneShot = aim;
      set({ status: 'running' });
      playToWait();
    },

    stop() {
      hardStop(null);
    },

    setVar(name, raw) {
      if (!session || raw === '') return;
      const cur = get().vars.find((v) => v.name === name);
      if (!cur || cur.kind === 'locked') return;
      let value: string | number | boolean;
      if (cur.kind === 'number') {
        const n = Number(raw);
        if (!Number.isFinite(n) && raw !== 'Infinity' && raw !== '-Infinity') return;
        value = n;
      } else if (cur.kind === 'bool') {
        if (raw !== 'true' && raw !== 'false') return;
        value = raw === 'true';
      } else {
        value = raw;
      }
      try {
        session.story.variablesState.$(name, value);
      } catch (e) {
        set({ notes: [...get().notes, { kind: 'error', text: errorText(e) }] });
        return;
      }
      set({
        recording: [...get().recording, { t: 'poke', name, value: String(value) }],
        notes: [
          ...get().notes.filter((n) => !n.text.startsWith('choices were computed')),
          { kind: 'info', text: 'choices were computed before this edit — Back one turn to re-evaluate.' },
        ],
        vars: readVars([name]),
      });
    },

    setStubValue(name, value) {
      const hit = get().stubbed.find((s) => s.name === name);
      if (hit) hit.value = value;
      set({
        stubbed: get().stubbed.slice(),
        notes: get().notes.map((n) => (n.text.startsWith(`${name}() stubbed`) ? { ...n, text: `${name}() stubbed → ${value}` } : n)),
      });
    },

    toggleBreakpoint(segId, relLine) {
      const cur = get().breakpoints[segId] ?? [];
      const next = cur.includes(relLine) ? cur.filter((x) => x !== relLine) : [...cur, relLine].sort((a, b) => a - b);
      const breakpoints = { ...get().breakpoints };
      if (next.length) breakpoints[segId] = next;
      else delete breakpoints[segId];
      set({ breakpoints });
    },

    toggleWatch(name) {
      const cur = get().watchNames;
      set({ watchNames: cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name] });
    },

    setCaret(segId, relLine = 0) {
      if (segId === null) {
        if (get().caret !== null) set({ caret: null });
        return;
      }
      const cur = get().caret;
      if (cur && cur.segId === segId && cur.relLine === relLine) return;
      set({ caret: { segId, relLine } });
    },

    replay() {
      if (!session) return;
      const rec = get().recording;
      const startPath = get().startPath;
      const startLabel = get().startLabel;
      const mid = get().startedMidStory;
      const prologue = session.prologue;
      const p = useProjectStore.getState();
      if (!p.root) return;
      const result = compileForPlay(p.root, p.files, p.parse);
      if (!result.story || result.externalsUnrepairable) {
        applyCompileFailure(result, true);
        return;
      }
      beginSession(result, startPath, startLabel, [], mid, { autoPlay: false });
      if (!session) return;
      let seedNote: string | null = null;
      try {
        session.story.state.LoadJson(prologue);
        const ok = session.story.canContinue || session.story.currentChoices.length > 0 || (!session.story.canContinue && session.story.currentChoices.length === 0);
        if (!ok) throw new Error('empty after restore');
      } catch {
        seedNote = "couldn't carry the random seed; shuffles may differ";
        if (startPath) {
          try {
            session.story.ChoosePathString(startPath);
          } catch {
            /* keep going */
          }
        }
      }
      set({
        lines: [
          {
            text: '── recompiled ──',
            tags: [],
            at: null,
            frags: [],
            fault: null,
            notice: seedNote,
            jumpNote: null,
            turn: 0,
          },
        ],
        recording: [],
        turn: 0,
      });
      playToWait();
      for (let i = 0; i < rec.length; i++) {
        const a = rec[i]!;
        if (a.t === 'poke') {
          get().setVar(a.name, a.value);
          continue;
        }
        const choices = session.story.currentChoices;
        const got = choices[a.index]?.text;
        if (got !== a.text) {
          set({
            divergence: { at: i, expected: a.text, found: got ?? '(no choice)' },
            notes: [
              ...get().notes,
              { kind: 'error', text: `↯ diverged at action ${i + 1}: expected "${a.text}", found "${got ?? '(no choice)'}"` },
            ],
            status: 'paused',
          });
          return;
        }
        get().choose(a.index);
      }
      set({
        notes: [...get().notes.filter((n) => !n.text.startsWith('replayed')), { kind: 'info', text: `replayed ${rec.length} actions — back where you were` }],
      });
    },

    setOpen(v) {
      set({ open: v });
      writeLS(PLAY_OPEN_KEY, v ? 'open' : 'closed');
      setReservedRightPx(v ? get().width : 0);
      if (v) maybeCollapseDock();
    },

    setWidth(px) {
      const width = clampPlayWidth(px);
      set({ width });
      if (get().open) setReservedRightPx(width);
      if (widthTimer) clearTimeout(widthTimer);
      widthTimer = setTimeout(() => writeLS(PLAY_WIDTH_KEY, String(get().width)), 400);
    },

    setToggle(which, v) {
      if (which === 'camera') set({ followCamera: v });
      else if (which === 'dock') set({ followDock: v });
      else set({ dim: v });
    },

    setDrawer(which, v) {
      if (which === 'vars') set({ varsOpen: v });
      else if (which === 'coverage') set({ coverageOpen: v });
      else set({ bpOpen: v });
    },

    clickBadge(at) {
      if (!session) return;
      const mapped = mapPos(session.snapshot, at);
      const paint = resolvePaint(mapped);
      if (paint.level === 'row' && mapped) {
        useProjectStore.getState().setFocusLine(mapped.segId, mapped.relLine);
        set({ peekId: mapped.segId, peekSeq: get().peekSeq + 1 });
      } else if (paint.level === 'card' && mapped) {
        useProjectStore.getState().setSelected(mapped.segId);
        set({
          notes: [
            ...get().notes.filter((n) => !n.text.includes('line number is from the old text')),
            { kind: 'info', text: 'this knot has changed since the run — the line number is from the old text' },
          ],
        });
      } else if (paint.level === 'hidden') {
        set({
          notes: [
            ...get().notes.filter((n) => !n.text.startsWith('the playhead is in') && !n.text.startsWith('this line is in')),
            {
              kind: 'info',
              text: `this line is in ${paint.file}, which is hidden — show it to follow along`,
              action: { kind: 'reveal', file: paint.file },
            },
          ],
        });
      } else if (paint.level === 'gone') {
        set({
          notes: [...get().notes.filter((n) => !n.text.startsWith('knot')), { kind: 'info', text: `knot ${paint.name} is gone from the live graph` }],
        });
      }
    },

    clickNote(note) {
      if (!note.action) return;
      if (note.action.kind === 'jump') useProjectStore.getState().setFocusLine(note.action.segId, note.action.relLine);
      else useProjectStore.getState().toggleFileVisible(note.action.file);
    },

    revealNode(id) {
      set({ peekId: id, peekSeq: get().peekSeq + 1 });
      useProjectStore.getState().setSelected(id);
    },

    noticeProjectChange() {
      const p = useProjectStore.getState();
      if (p.root !== lastRoot) {
        const had = session;
        lastRoot = p.root;
        lastFiles = p.files;
        lastGraph = p.graph;
        lastHidden = p.hiddenFiles;
        lastShowFn = p.showFunctions;
        if (had) hardStop('project reloaded — the run was stopped.');
        return;
      }
      const filesChanged = p.files !== lastFiles;
      const graphChanged = p.graph !== lastGraph;
      const hiddenChanged = p.hiddenFiles !== lastHidden || p.showFunctions !== lastShowFn;
      lastFiles = p.files;
      lastGraph = p.graph;
      lastHidden = p.hiddenFiles;
      lastShowFn = p.showFunctions;
      if (!session) return;
      if (filesChanged) {
        const sameProject = p.files.length > 0;
        if (sameProject) {
          const notes = get().notes.filter((n) => n.text !== 'files reloaded from disk');
          // A same-root files pointer swap can be an edit or a disk reload; the stale pill covers edits.
          set({ notes });
          recomputeStale();
        }
      }
      if (graphChanged || hiddenChanged) {
        const last = get().lines.at(-1);
        const mapped = last ? mapFrags(last.frags).at(-1) ?? null : null;
        const paint = resolvePaint(mapped);
        let atNodeId: string | null = null;
        let atRow: number | null = null;
        if (paint.level === 'row' || paint.level === 'card') atNodeId = paint.segId;
        if (paint.level === 'row') {
          const preview = p.views[paint.segId]?.preview;
          atRow = preview ? lineToRow(preview, paint.relLine) : paint.relLine;
        }
        const notes = get().notes.filter((n) => !n.text.startsWith('the playhead is in'));
        if (paint.level === 'hidden') {
          notes.push({
            kind: 'info',
            text: `the playhead is in ${paint.file}, which is hidden — show it to follow along`,
            action: { kind: 'reveal', file: paint.file },
          });
        }
        set({ paint, atNodeId, atRow, notes });
      }
    },
  };
});

if (initialOpen) setReservedRightPx(initialWidth);
