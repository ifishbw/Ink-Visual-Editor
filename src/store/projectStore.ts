/**
 * Single app state: loaded files, parse result, derived graph, node positions and the sidecar layout.
 * Text edits update one segment at once; the parse and graph are rebuilt on a short debounce.
 */
import { create } from 'zustand';
import { httpFS, type ProjectFS } from '../fs/client';
import { buildGraph, type Graph, type GraphNode } from '../model/graph';
import { parseProject } from '../model/inkParse';
import { normalizeNewInkPath } from '../model/project';
import {
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  effectiveSize,
  emptyLayout,
  layoutFileName,
  layoutKey,
  parseLayout,
  placeNodes,
  pruneLayout,
  type LayoutFile,
  type Position,
  type Size,
} from '../model/layout';
import {
  createHistory,
  diffFiles,
  diffLayout,
  dirtyFromSaved,
  sameDoc,
  textMergeKey,
  type DocSnapshot,
} from '../model/history';
import * as ops from '../model/ops';
import { PREVIEW_MAX_H, buildPreview, layoutRows, type KnotPreview } from '../model/preview';
import { countLines, joinSegments, knotId, makeInkFile } from '../model/splitter';
import type { InkFile, ParseResult } from '../model/types';
import { MISSING_COLOR, assignFileColors } from '../ui/colors';
import { HEADER_H, parseRerouteId } from '../ui/flow';
import { DEFAULT_CODE_FONT, type Theme } from '../ui/inkTheme';

export const NODE_WIDTH = 320;
/** A collapsed or missing card is its header and nothing else. */
const COMPACT_HEIGHT = HEADER_H + 2;
const LAST_ROOT_KEY = 'inkvisual:lastRoot';
const RECENT_KEY = 'inkvisual:recent';
const THEME_KEY = 'inkvisual:theme';
const SIDEBAR_KEY = 'inkvisual:sidebar';
const DOCK_WIDTH_KEY = 'inkvisual:dockWidth';
const CODE_FONT_KEY = 'inkvisual:codeFont';
/** The dock stops being an editor below this, and the canvas stops being a canvas above the matching max. */
export const MIN_DOCK_WIDTH = 260;
export const DEFAULT_DOCK_WIDTH = 440;
const REPARSE_DELAY = 300;
const AUTOSAVE_DELAY = 1500;
/** Play panel width, so the dock clamp can leave canvas room. Must be initialized before create(). */
let reservedRightPx = 0;

export interface NodeView {
  /** The knot's compressed structure, as drawn on the canvas. Rebuilt only when the knot's text changes. */
  preview: KnotPreview;
  /** Size the knot's own text asks for; the sidecar may override it (see `effectiveSize`). */
  size: Size;
  color: string;
}

/** Which node the docked editor is showing, and where its cursor should go. */
export interface Focus {
  segId: string;
  line: number;
  /** Character offset on `line`. Absent means column 0 (preview-row clicks). */
  offset?: number;
}

/** Canvas pans here after undo/redo so the change is not off-screen. */
export interface HistoryReveal {
  id: string;
  nonce: number;
  /** Text undo also selects the knot in the dock; layout undo must not steal editor focus. */
  focusDock: boolean;
}

export interface ProjectState {
  fs: ProjectFS;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  rootArg: string | null;
  root: string | null;
  dir: string | null;
  recentRoots: string[];
  files: InkFile[];
  /** Hash of each file as last read from or written to disk. */
  hashes: Record<string, string>;
  /** Segment text by segment id; what the node editors show. */
  texts: Record<string, string>;
  dirty: Record<string, true>;
  /** Save refused because the disk changed: path -> hash on disk. */
  conflicts: Record<string, string>;
  /** Disk changed while we have unsaved edits: path -> hash on disk. */
  externalChanges: Record<string, string>;
  saveState: 'idle' | 'saving' | 'error';
  autosave: boolean;
  /** File that receives new knots; defaults to the root. */
  newKnotFile: string | null;
  missingIncludes: { from: string; path: string; line: number }[];
  otherInkFiles: string[];
  parse: ParseResult | null;
  graph: Graph;
  views: Record<string, NodeView>;
  fileColors: Record<string, string>;
  layout: LayoutFile;
  positions: Record<string, Position>;
  layoutSaveState: 'clean' | 'pending' | 'saving';
  hiddenFiles: Record<string, true>;
  showFunctions: boolean;
  theme: Theme;
  /** Segment the docked editor shows. Follows canvas selection. */
  selectedId: string | null;
  /** Set when a preview row is clicked, so the dock can put the cursor on that line. */
  focus: Focus | null;
  dockOpen: boolean;
  /** Width of the docked editor in px. The user drags it; it outlives the session. */
  dockWidth: number;
  /** Font size of the docked editor in px. */
  codeFontSize: number;
  sidebarOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** Bumped when undo/redo changes the open knot's text, so the dock remounts. */
  historyEpoch: number;
  /** Shown after an external reload that dropped the undo stack. */
  historyNote: string | null;
  reveal: HistoryReveal | null;

  open(rootArg: string): Promise<void>;
  pickAndOpen(): Promise<void>;
  fileChanged(path: string, hash: string | null): Promise<void>;
  editSegment(segId: string, text: string): void;
  saveAll(force?: boolean): Promise<void>;
  reloadFile(path: string): Promise<void>;
  setAutosave(on: boolean): void;
  setNewKnotFile(path: string): void;
  /** Returns the new segment id, or an error message. */
  createKnot(name: string, position: Position, file?: string): string;
  /** Create a new .ink file on disk and INCLUDE it from the root. */
  createInkFile(relPath: string): Promise<{ path: string } | { error: string }>;
  createMissing(stubId: string): void;
  deleteKnot(segId: string): void;
  addDivert(fromSegId: string, targetName: string): void;
  moveNode(id: string, pos: Position): void;
  /** Store a hand-set node size; `null` returns the node to its automatic size. */
  resizeNode(id: string, size: Size | null): void;
  setViewport(viewport: { x: number; y: number; zoom: number }): void;
  autoLayout(): void;
  toggleCollapsed(id: string): void;
  toggleFileVisible(path: string): void;
  setShowFunctions(on: boolean): void;
  setTheme(theme: Theme): void;
  setSelected(id: string | null): void;
  /** Show this segment in the dock and put the cursor on `line` (segment-relative). */
  setFocusLine(segId: string, line: number): void;
  setDockOpen(open: boolean): void;
  setDockWidth(px: number): void;
  setCodeFontSize(px: number): void;
  setSidebarOpen(open: boolean): void;
  addWaypoint(key: string, index: number, pos: Position): void;
  removeWaypoint(key: string, index: number): void;
  undo(): void;
  redo(): void;
  /** Group several document mutations into one undo step. Sync only. */
  batch<T>(label: string, fn: () => T): T;
  /** Id of the graph node whose text covers this file line, if any. */
  nodeAt(file: string, line: number): string | null;
}

export const useProjectStore = create<ProjectState>()((set, get) => {
  let layoutTimer: ReturnType<typeof setTimeout> | null = null;
  let reparseTimer: ReturnType<typeof setTimeout> | null = null;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let dockWidthTimer: ReturnType<typeof setTimeout> | null = null;
  const savingPaths = new Set<string>();
  const history = createHistory();
  let transactDepth = 0;
  let applyingHistory = false;
  let revealSeq = 0;
  let openSeq = 0;
  /** Joined file text as last loaded or saved; undo uses this to set `dirty`. */
  let savedJoined: Record<string, string> = {};

  const docOf = (s: ProjectState): DocSnapshot => ({ files: s.files, layout: s.layout });
  const syncHistoryFlags = () => set(history.flags());

  /**
   * Every document mutation runs inside this. It records the document as it was, iff the mutation
   * changed it. Nested calls join the outermost step. Sync only.
   */
  const transact = <T,>(label: string, mergeKey: string | null, fn: () => T): T => {
    if (transactDepth > 0 || applyingHistory) return fn();
    const before = docOf(get());
    transactDepth++;
    try {
      return fn();
    } finally {
      transactDepth--;
      if (transactDepth === 0 && !sameDoc(before, docOf(get()))) {
        history.record(before, label, mergeKey, docOf(get()));
        const note = get().historyNote;
        set(note ? { ...history.flags(), historyNote: null } : history.flags());
      }
    }
  };

  const batch = <T,>(label: string, fn: () => T): T => transact(label, null, fn);

  const restore = (snap: DocSnapshot) => {
    applyingHistory = true;
    try {
      const live = get();
      const textDiff = diffFiles(live.files, snap.files);
      const layoutDiff = diffLayout(live.layout, snap.layout);
      if (reparseTimer) {
        clearTimeout(reparseTimer);
        reparseTimer = null;
      }
      const dirty = dirtyFromSaved(snap.files, savedJoined);
      const conflicts = { ...live.conflicts };
      const externalChanges = { ...live.externalChanges };
      for (const path of Object.keys(conflicts)) if (!dirty[path]) delete conflicts[path];
      for (const path of Object.keys(externalChanges)) if (!dirty[path]) delete externalChanges[path];
      const selectedTextChanged = live.selectedId !== null && textDiff.changedSegIds.includes(live.selectedId);
      const epoch = selectedTextChanged ? live.historyEpoch + 1 : live.historyEpoch;
      const focus = textDiff.firstChange
        ? { segId: textDiff.firstChange.segId, line: textDiff.firstChange.line, offset: textDiff.firstChange.offset }
        : live.focus;
      let selectedId = textDiff.firstChange?.segId ?? live.selectedId;
      if (selectedId && !snap.files.some((f) => f.segments.some((sg) => sg.id === selectedId))) {
        selectedId = textDiff.firstChange?.segId ?? null;
      }
      const nextLayout = { ...snap.layout, viewport: live.layout.viewport };
      set({
        files: snap.files,
        layout: nextLayout,
        dirty,
        conflicts,
        externalChanges,
        historyEpoch: epoch,
        selectedId,
        focus,
        dockOpen: textDiff.firstChange ? true : live.dockOpen,
      });
      if (textDiff.paths.length) reparseNow();
      else {
        const s = get();
        const { positions } = placeNodes(s.graph, s.layout, (n) => drawnSize(n, s.views, s.layout));
        set({ positions });
      }
      if (layoutDiff.length) scheduleLayoutSave();
      const graph = get().graph;
      const revealId = textDiff.firstChange?.segId ?? nodeIdForLayoutKey(layoutDiff[0], graph);
      if (revealId) {
        const node = graph.nodes.find((n) => n.id === revealId);
        const hidden = { ...get().hiddenFiles };
        let hiddenFiles = get().hiddenFiles;
        if (node && hidden[node.file]) {
          delete hidden[node.file];
          hiddenFiles = hidden;
        }
        const showFunctions = node?.isFunction ? true : get().showFunctions;
        set({ reveal: { id: revealId, nonce: ++revealSeq, focusDock: Boolean(textDiff.firstChange) }, hiddenFiles, showFunctions });
      }
      syncHistoryFlags();
    } finally {
      applyingHistory = false;
    }
  };

  const scheduleLayoutSave = () => {
    set({ layoutSaveState: 'pending' });
    if (layoutTimer) clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => void saveLayout(), 1000);
  };

  const saveLayout = async () => {
    const s = get();
    if (!s.root) return;
    set({ layoutSaveState: 'saving' });
    const text = JSON.stringify(pruneLayout(s.layout, s.graph), null, 2) + '\n';
    try {
      await s.fs.writeFile(layoutFileName(s.root), text, null);
      set({ layoutSaveState: 'clean' });
    } catch (e) {
      set({ layoutSaveState: 'pending', error: `Could not save layout: ${errorText(e)}` });
    }
  };

  const setLayout = (layout: LayoutFile) => {
    set({ layout });
    scheduleLayoutSave();
  };

  /** Re-split files whose headers changed, then rebuild parse, graph, views and positions. */
  const reparseNow = () => {
    if (reparseTimer) clearTimeout(reparseTimer);
    reparseTimer = null;
    const s = get();
    if (!s.root) return;
    let layout = s.layout;
    // A rename gives the knot a new segment id, so anything keyed by the old one has to come with it --
    // otherwise renaming the knot you are editing silently empties the dock mid-keystroke.
    let selectedId = s.selectedId;
    let focus = s.focus;
    const files = s.files.map((f) => {
      const r = ops.resplitFile(f);
      for (const { from, to } of r.renames) {
        const entry = layout.nodes[from];
        if (entry && !layout.nodes[to]) {
          const nodes = { ...layout.nodes, [to]: entry };
          delete nodes[from];
          layout = { ...layout, nodes };
        }
        const before = knotId(f.path, from);
        const after = knotId(f.path, to);
        if (selectedId === before) selectedId = after;
        if (focus?.segId === before) focus = { ...focus, segId: after };
      }
      return r.file;
    });
    const r = rebuild(files, s.root, layout, s.views);
    set({ files, selectedId, focus, ...r.state });
    if (r.layoutChanged || layout !== s.layout) scheduleLayoutSave();
    if (get().autosave) scheduleAutosave();
  };

  const scheduleReparse = () => {
    if (reparseTimer) clearTimeout(reparseTimer);
    reparseTimer = setTimeout(reparseNow, REPARSE_DELAY);
  };

  const scheduleAutosave = () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => void get().saveAll(), AUTOSAVE_DELAY);
  };

  const fileOfSegment = (segId: string): InkFile | undefined => get().files.find((f) => f.segments.some((sg) => sg.id === segId));

  const replaceFile = (file: InkFile, markDirty: boolean) => {
    const s = get();
    const dirty = markDirty ? { ...s.dirty, [file.path]: true as const } : s.dirty;
    set({ files: s.files.map((f) => (f.path === file.path ? file : f)), dirty });
  };

  return {
    fs: httpFS,
    status: 'idle',
    error: null,
    rootArg: null,
    root: null,
    dir: null,
    recentRoots: readJson<string[]>(RECENT_KEY, []),
    files: [],
    hashes: {},
    texts: {},
    dirty: {},
    conflicts: {},
    externalChanges: {},
    saveState: 'idle',
    autosave: false,
    newKnotFile: null,
    missingIncludes: [],
    otherInkFiles: [],
    parse: null,
    graph: { nodes: [], edges: [] },
    views: {},
    fileColors: {},
    layout: emptyLayout(),
    positions: {},
    layoutSaveState: 'clean',
    hiddenFiles: {},
    showFunctions: true,
    theme: (readString(THEME_KEY) === 'light' ? 'light' : 'dark') as Theme,
    selectedId: null,
    focus: null,
    dockOpen: true,
    dockWidth: clampDockWidth(Number(readString(DOCK_WIDTH_KEY)) || DEFAULT_DOCK_WIDTH),
    codeFontSize: clampFont(Number(readString(CODE_FONT_KEY)) || DEFAULT_CODE_FONT),
    sidebarOpen: readString(SIDEBAR_KEY) !== 'closed',
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
    historyEpoch: 0,
    historyNote: null,
    reveal: null,

    async open(rootArg) {
      set({ status: 'loading', error: null, rootArg });
      const seq = ++openSeq;
      try {
        const prev = get();
        const info = await prev.fs.openProject(rootArg);
        if (seq !== openSeq) return;
        const sameProject = prev.root === info.root && prev.dir === info.dir;
        const layoutText = sameProject ? null : await prev.fs.readFile(layoutFileName(info.root));
        if (seq !== openSeq) return;
        const cur = get();
        const hadHistory = history.flags().canUndo || history.flags().canRedo;
        history.clear();
        // Keep unsaved edits when re-reading the same project (another file changed on disk).
        const files = info.files.map((f) => {
          const local = sameProject && cur.dirty[f.path] ? cur.files.find((x) => x.path === f.path) : undefined;
          return local ?? makeInkFile(f.path, f.text);
        });
        const hashes = Object.fromEntries(info.files.map((f) => [f.path, sameProject && cur.dirty[f.path] ? (cur.hashes[f.path] ?? f.hash) : f.hash]));
        const nextSaved: Record<string, string> = sameProject ? { ...savedJoined } : {};
        for (const f of info.files) {
          if (!(sameProject && cur.dirty[f.path])) nextSaved[f.path] = f.text;
        }
        savedJoined = nextSaved;
        const layout = sameProject ? cur.layout : parseLayout(layoutText?.text ?? null);
        const r = rebuild(files, info.root, layout, sameProject ? cur.views : undefined);
        const recentRoots = [rootArg, ...cur.recentRoots.filter((x) => x !== rootArg)].slice(0, 8);
        set({
          status: 'ready',
          root: info.root,
          dir: info.dir,
          recentRoots,
          files,
          hashes,
          dirty: sameProject ? dirtyFromSaved(files, savedJoined) : {},
          conflicts: sameProject ? cur.conflicts : {},
          externalChanges: sameProject ? cur.externalChanges : {},
          hiddenFiles: sameProject ? cur.hiddenFiles : {},
          newKnotFile: sameProject && cur.newKnotFile && info.files.some((f) => f.path === cur.newKnotFile) ? cur.newKnotFile : info.root,
          missingIncludes: info.missing,
          otherInkFiles: info.otherInkFiles,
          historyNote: sameProject && hadHistory ? 'Reloaded from disk — undo history cleared.' : null,
          reveal: null,
          ...history.flags(),
          ...r.state,
        });
        if (r.layoutChanged) scheduleLayoutSave();
        writeString(LAST_ROOT_KEY, rootArg);
        writeString(RECENT_KEY, JSON.stringify(recentRoots));
        syncRootUrl(rootArg);
      } catch (e) {
        if (seq !== openSeq) return;
        set({ status: 'error', error: errorText(e) });
      }
    },

    async pickAndOpen() {
      try {
        const chosen = await get().fs.pickRoot(get().dir);
        if (chosen) await get().open(chosen);
      } catch (e) {
        set({ error: errorText(e) });
      }
    },

    async fileChanged(path, hash) {
      const s = get();
      if (!s.root || !s.rootArg) return;
      if (!/\.ink$/i.test(path)) return; // the layout sidecar is ours
      if (savingPaths.has(path)) return; // our own write in flight
      if (hash !== null && s.hashes[path] === hash) return; // already have this content
      if (s.dirty[path]) {
        set({ externalChanges: { ...s.externalChanges, [path]: hash ?? 'deleted' } });
        return;
      }
      await s.open(s.rootArg); // re-walks INCLUDEs; layout and unsaved edits are kept
    },

    editSegment(segId, text) {
      const s = get();
      if (s.texts[segId] === text) return;
      const file = fileOfSegment(segId);
      const seg = file?.segments.find((sg) => sg.id === segId);
      if (!file || !seg) return;
      transact(`typing in ${seg.name ?? 'preamble'}`, textMergeKey(segId), () => {
        // `text` is what the editor shows; the segment keeps the line terminator that separates it from the next knot.
        replaceFile(ops.setSegmentText(file, segId, ops.segmentTextFrom(text, seg.text)), true);
        set({ texts: { ...get().texts, [segId]: text } });
        scheduleReparse();
      });
    },

    async saveAll(force = false) {
      const s = get();
      const paths = Object.keys(s.dirty);
      if (paths.length === 0 || !s.root) return;
      if (reparseTimer) reparseNow();
      history.breakRun();
      set({ saveState: 'saving' });
      let failed = false;
      for (const path of paths) {
        const file = get().files.find((f) => f.path === path);
        if (!file) continue;
        const text = joinSegments(file.segments);
        savingPaths.add(path);
        try {
          const result = await get().fs.writeFile(path, text, force ? null : (get().hashes[path] ?? null));
          if ('conflict' in result) {
            set({ conflicts: { ...get().conflicts, [path]: result.diskHash } });
            failed = true;
          } else {
            savedJoined = { ...savedJoined, [path]: text };
            const now = get();
            const conflicts = { ...now.conflicts };
            delete conflicts[path];
            const externalChanges = { ...now.externalChanges };
            delete externalChanges[path];
            set({ hashes: { ...now.hashes, [path]: result.hash }, dirty: dirtyFromSaved(now.files, savedJoined), conflicts, externalChanges });
          }
        } catch (e) {
          set({ error: `Could not save ${path}: ${errorText(e)}` });
          failed = true;
        } finally {
          savingPaths.delete(path);
        }
      }
      set({ saveState: failed ? 'error' : 'idle' });
    },

    async reloadFile(path) {
      const s = get();
      if (!s.rootArg) return;
      const dirty = { ...s.dirty };
      delete dirty[path];
      const conflicts = { ...s.conflicts };
      delete conflicts[path];
      const externalChanges = { ...s.externalChanges };
      delete externalChanges[path];
      set({ dirty, conflicts, externalChanges });
      await s.open(s.rootArg);
    },

    setAutosave(on) {
      set({ autosave: on });
      if (on && Object.keys(get().dirty).length > 0) scheduleAutosave();
    },

    setNewKnotFile(path) {
      set({ newKnotFile: path });
    },

    createKnot(name, position, filePath) {
      return transact(`new knot ${name}`, null, () => {
        const s = get();
        if (!s.root) return 'No project open';
        if (!ops.isValidKnotName(name)) return `"${name}" is not a valid knot name (letters, digits and _ only)`;
        if (s.graph.nodes.some((n) => n.kind === 'knot' && n.name === name)) return `A knot named "${name}" already exists`;
        const path = filePath ?? s.newKnotFile ?? s.root;
        const file = s.files.find((f) => f.path === path);
        if (!file) return `File ${path} is not part of the project`;
        const r = ops.createKnot(file, name);
        replaceFile(r.file, true);
        setLayout({ ...get().layout, nodes: { ...get().layout.nodes, [name]: { x: Math.round(position.x), y: Math.round(position.y) } } });
        reparseNow();
        return r.segId;
      });
    },

    async createInkFile(relPath) {
      const s = get();
      if (!s.root || !s.rootArg) return { error: 'No project open' };
      const parsed = normalizeNewInkPath(relPath);
      if ('error' in parsed) return parsed;
      if (parsed.path === s.root) return { error: 'That is the root file' };
      if (s.files.some((f) => f.path === parsed.path)) return { error: `${parsed.path} is already in the project` };

      let text: string;
      let hash: string;
      const existing = await s.fs.readFile(parsed.path);
      if (existing) {
        text = existing.text;
        hash = existing.hash;
      } else {
        text = `// ${parsed.path}\n`;
        const written = await s.fs.writeFile(parsed.path, text, null);
        if ('conflict' in written) return { error: `${parsed.path} already exists and has changed` };
        hash = written.hash;
      }

      transact(`new file ${parsed.path}`, null, () => {
        const cur = get();
        const rootFile = cur.files.find((f) => f.path === cur.root);
        if (!rootFile) return;
        const withInc = ops.addInclude(rootFile, parsed.path);
        const already = cur.files.some((f) => f.path === parsed.path);
        savedJoined = { ...savedJoined, [parsed.path]: text };
        set({
          files: [...cur.files.map((f) => (f.path === withInc.path ? withInc : f)), ...(already ? [] : [makeInkFile(parsed.path, text)])],
          dirty: { ...cur.dirty, [withInc.path]: true },
          hashes: { ...cur.hashes, [parsed.path]: hash },
          otherInkFiles: cur.otherInkFiles.filter((p) => p !== parsed.path),
        });
        reparseNow();
      });
      return { path: parsed.path };
    },

    createMissing(stubId) {
      const s = get();
      const stub = s.graph.nodes.find((n) => n.id === stubId);
      if (!stub || stub.kind !== 'missing') return;
      const pos = s.positions[stubId] ?? { x: 0, y: 0 };
      const result = s.createKnot(stub.name, pos, s.newKnotFile ?? stub.file);
      if (!result.includes('#')) set({ error: result });
    },

    deleteKnot(segId) {
      const node = get().graph.nodes.find((n) => n.id === segId);
      transact(`delete knot ${node?.name ?? ''}`, null, () => {
        const s = get();
        const file = fileOfSegment(segId);
        if (!file || !node || node.kind !== 'knot') return;
        replaceFile(ops.deleteKnot(file, segId), true);
        const nodes = { ...get().layout.nodes };
        delete nodes[layoutKey(node)];
        set({ layout: { ...get().layout, nodes } });
        reparseNow();
      });
    },

    addDivert(fromSegId, targetName) {
      transact(`connect → ${targetName}`, null, () => {
        const file = fileOfSegment(fromSegId);
        if (!file) return;
        replaceFile(ops.addDivert(file, fromSegId, targetName), true);
        reparseNow();
      });
    },

    moveNode(id, pos) {
      transact('move node', null, () => {
        const s = get();
        const rounded = { x: Math.round(pos.x), y: Math.round(pos.y) };
        const dot = parseRerouteId(id);
        if (dot) {
          const points = [...(s.layout.reroutes[dot.key] ?? [])];
          if (!points[dot.index]) return;
          if (points[dot.index]!.x === rounded.x && points[dot.index]!.y === rounded.y) return;
          points[dot.index] = rounded;
          setLayout({ ...s.layout, reroutes: { ...s.layout.reroutes, [dot.key]: points } });
          return;
        }
        const node = s.graph.nodes.find((n) => n.id === id);
        if (!node || node.kind === 'missing') return;
        const key = layoutKey(node);
        const cur = s.layout.nodes[key];
        if (cur && cur.x === rounded.x && cur.y === rounded.y) return;
        set({ positions: { ...s.positions, [id]: rounded } });
        setLayout({ ...s.layout, nodes: { ...s.layout.nodes, [key]: { ...s.layout.nodes[key], ...rounded } } });
      });
    },

    resizeNode(id, size) {
      transact(size ? 'resize node' : 'auto size node', null, () => {
        const s = get();
        const node = s.graph.nodes.find((n) => n.id === id);
        if (!node || node.kind === 'missing') return;
        const key = layoutKey(node);
        const entry = s.layout.nodes[key] ?? { x: s.positions[id]?.x ?? 0, y: s.positions[id]?.y ?? 0 };
        const next = { ...entry };
        if (size) {
          next.w = Math.max(MIN_NODE_WIDTH, Math.round(size.width));
          next.h = Math.max(MIN_NODE_HEIGHT, Math.round(size.height));
        } else {
          delete next.w;
          delete next.h;
        }
        if (next.w === entry.w && next.h === entry.h) return;
        setLayout({ ...s.layout, nodes: { ...s.layout.nodes, [key]: next } });
      });
    },

    setViewport(viewport) {
      const s = get();
      if (!s.root) return;
      setLayout({ ...s.layout, viewport });
    },

    autoLayout() {
      transact('auto layout', null, () => {
        const s = get();
        const { positions, placed } = placeNodes(s.graph, { ...s.layout, nodes: {} }, (n) => drawnSize(n, s.views, s.layout));
        set({ positions });
        setLayout({ ...s.layout, nodes: placed, reroutes: {} });
      });
    },

    toggleCollapsed(id) {
      transact('collapse node', null, () => {
        const s = get();
        const node = s.graph.nodes.find((n) => n.id === id);
        if (!node || node.kind === 'missing') return;
        const key = layoutKey(node);
        const entry = s.layout.nodes[key] ?? { x: s.positions[id]?.x ?? 0, y: s.positions[id]?.y ?? 0 };
        setLayout({ ...s.layout, nodes: { ...s.layout.nodes, [key]: { ...entry, collapsed: !entry.collapsed } } });
      });
    },

    toggleFileVisible(path) {
      const hidden = { ...get().hiddenFiles };
      if (hidden[path]) delete hidden[path];
      else hidden[path] = true;
      set({ hiddenFiles: hidden });
    },

    setShowFunctions(on) {
      set({ showFunctions: on });
    },

    setTheme(theme) {
      set({ theme });
      writeString(THEME_KEY, theme);
    },

    setSelected(id) {
      // React Flow reports the selection on every rebuild; only act on a real change.
      if (get().selectedId === id) return;
      if (!applyingHistory) history.breakRun();
      set({ selectedId: id, focus: null });
    },

    setFocusLine(segId, line) {
      if (!applyingHistory && get().selectedId !== segId) history.breakRun();
      // A fresh object every time, so clicking the same row twice still moves the cursor there.
      set({ selectedId: segId, focus: { segId, line }, dockOpen: true });
    },

    setDockOpen(open) {
      set({ dockOpen: open });
    },

    setDockWidth(px) {
      set({ dockWidth: clampDockWidth(px) });
      // Written on a debounce: this runs on every pointer move while the user drags the divider.
      if (dockWidthTimer) clearTimeout(dockWidthTimer);
      dockWidthTimer = setTimeout(() => writeString(DOCK_WIDTH_KEY, String(get().dockWidth)), 400);
    },

    setCodeFontSize(px) {
      const size = clampFont(px);
      set({ codeFontSize: size });
      writeString(CODE_FONT_KEY, String(size));
    },

    setSidebarOpen(open) {
      set({ sidebarOpen: open });
      writeString(SIDEBAR_KEY, open ? 'open' : 'closed');
    },

    addWaypoint(key, index, pos) {
      transact('add waypoint', null, () => {
        const s = get();
        const points = [...(s.layout.reroutes[key] ?? [])];
        points.splice(Math.min(index, points.length), 0, { x: Math.round(pos.x), y: Math.round(pos.y) });
        setLayout({ ...s.layout, reroutes: { ...s.layout.reroutes, [key]: points } });
      });
    },

    removeWaypoint(key, index) {
      transact('remove waypoint', null, () => {
        const s = get();
        const points = (s.layout.reroutes[key] ?? []).filter((_, i) => i !== index);
        const reroutes = { ...s.layout.reroutes };
        if (points.length) reroutes[key] = points;
        else delete reroutes[key];
        setLayout({ ...s.layout, reroutes });
      });
    },

    undo() {
      const live = docOf(get());
      const e = history.undo(live);
      if (e) restore(e.doc);
    },

    redo() {
      const live = docOf(get());
      const e = history.redo(live);
      if (e) restore(e.doc);
    },

    batch,

    nodeAt(file, line) {
      const s = get();
      const f = s.files.find((x) => x.path === file);
      if (!f) return null;
      const seg = f.segments.find((sg) => line >= sg.startLine && line < sg.startLine + Math.max(1, countLines(sg.text)));
      if (!seg) return null;
      return s.graph.nodes.some((n) => n.id === seg.id) ? seg.id : null;
    },
  };
});

function rebuild(
  files: InkFile[],
  root: string,
  layout: LayoutFile,
  prev?: Record<string, NodeView>,
): { state: Pick<ProjectState, 'parse' | 'graph' | 'views' | 'texts' | 'fileColors' | 'layout' | 'positions'>; layoutChanged: boolean } {
  const texts: Record<string, string> = {};
  for (const f of files) for (const s of f.segments) texts[s.id] = ops.editorText(s.text);
  const parse = parseProject({ root, files: Object.fromEntries(files.map((f) => [f.path, joinSegments(f.segments)])) });
  const graph = buildGraph(files, parse, root);
  const fileColors = assignFileColors(
    files.map((f) => f.path),
    layout.files,
  );
  const views = buildViews(graph, texts, fileColors, layout, prev);
  const { positions, placed } = placeNodes(graph, layout, (n) => drawnSize(n, views, layout));
  const layoutChanged = Object.keys(placed).length > 0;
  const nextLayout = layoutChanged ? { ...layout, nodes: { ...layout.nodes, ...placed } } : layout;
  return { state: { parse, graph, views, texts, fileColors, layout: nextLayout, positions }, layoutChanged };
}

/** The size a node is drawn at, taking any hand-set size in the sidecar into account. */
export function drawnSize(node: GraphNode, views: Record<string, NodeView>, layout: LayoutFile): Size {
  const entry = node.kind === 'missing' ? undefined : layout.nodes[layoutKey(node)];
  const auto = views[node.id]?.size ?? { width: NODE_WIDTH, height: 40 };
  return effectiveSize(auto, entry, node.kind === 'missing' || entry?.collapsed === true);
}

const EMPTY_PREVIEW: KnotPreview = { source: '', rows: [], rowOf: [0] };

/**
 * The per-node drawing data. The preview is reused whenever a knot's text is byte-identical to last time, so
 * one keystroke rescans one knot rather than all of them -- and, just as importantly, every other knot's
 * `KnotPreview` keeps its identity, so its card's rows do not re-render.
 */
function buildViews(
  graph: Graph,
  texts: Record<string, string>,
  colors: Record<string, string>,
  layout: LayoutFile,
  prev?: Record<string, NodeView>,
): Record<string, NodeView> {
  const views: Record<string, NodeView> = {};
  for (const n of graph.nodes) {
    const text = texts[n.id] ?? '';
    const cached = prev?.[n.id]?.preview;
    const preview = n.kind === 'missing' ? EMPTY_PREVIEW : cached?.source === text ? cached : buildPreview(text);
    const entry = n.kind === 'missing' ? undefined : layout.nodes[layoutKey(n)];
    const compact = n.kind === 'missing' || entry?.collapsed === true;
    // The automatic height is the preview's natural height. A hand-set height instead squeezes the preview,
    // and that lives in `toFlow` -- size-dependent logic must never be computed here.
    const autoHeight = compact ? COMPACT_HEIGHT : HEADER_H + layoutRows(preview, PREVIEW_MAX_H).height;
    views[n.id] = {
      preview,
      size: { width: NODE_WIDTH, height: autoHeight },
      color: n.kind === 'missing' ? MISSING_COLOR : (colors[n.file] ?? '#888'),
    };
  }
  return views;
}

function clampFont(px: number): number {
  return Math.round(Math.max(9, Math.min(px, 28)));
}

/** The play panel registers its own width here so the dock's clamp can reserve room for it. */
export function setReservedRightPx(px: number): void {
  reservedRightPx = Math.max(0, px);
  // Re-clamp the width that already exists, not just future drags. Plain `set` — no transact, not undoable,
  // same as every other chrome write. Only fires when the value actually shrinks, so it cannot loop.
  const s = useProjectStore.getState();
  const next = clampDockWidth(s.dockWidth);
  if (next !== s.dockWidth) useProjectStore.setState({ dockWidth: next });
}

/** Keep the dock usable as an editor and the canvas usable as a canvas, whatever the window is doing. */
function clampDockWidth(px: number): number {
  const room = typeof window === 'undefined' ? 1200
    : Math.max(MIN_DOCK_WIDTH, window.innerWidth - 360 - reservedRightPx);
  return Math.round(Math.max(MIN_DOCK_WIDTH, Math.min(px, room)));
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Map a sidecar layout key (knot name, or a reroute "a->b" key) to a graph node id. */
function nodeIdForLayoutKey(key: string | undefined, graph: Graph): string | null {
  if (!key) return null;
  const hit = graph.nodes.find((n) => layoutKey(n) === key);
  if (hit) return hit.id;
  const arrow = key.indexOf('->');
  if (arrow <= 0) return null;
  const src = key.slice(0, arrow);
  return graph.nodes.find((n) => layoutKey(n) === src)?.id ?? null;
}

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function syncRootUrl(rootArg: string) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('root') === rootArg) return;
    url.searchParams.set('root', rootArg);
    window.history.replaceState(null, '', url);
  } catch {
    /* ignore malformed location */
  }
}

function readJson<T>(key: string, fallback: T): T {
  const raw = readString(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
