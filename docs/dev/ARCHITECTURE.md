# InkVisual architecture

How the app is put together and, more importantly, why. Read
[`PITFALLS.md`](./PITFALLS.md) alongside this: this document describes the shape, that one describes
the traps inside it.

## 1. What we are building

A desktop app that opens an ink project — a root `.ink` file plus everything it `INCLUDE`s — and shows
it as a flowchart:

- **One node per knot.** The header shows the knot name and the file it lives in. The body is a
  *compressed structure preview* of the knot: its choices, gathers, diverts, stitch anchors and prose,
  drawn as a fixed abstract shape that is identical at every zoom level.
- **One edge per divert**, derived from the text (`-> knot`, `-> knot.stitch`, tunnels `-> knot ->`,
  threads `<- knot`, choice-line diverts). Edges are never authored separately, and there is one wire
  per divert rather than one per node pair, so each wire can leave from the exact line that wrote it.
- **Raw ink is edited in a docked CodeMirror panel** beside the canvas, showing the selected knot.
- **Files are visible but not walls.** Nodes are colour-coded by file and can be filtered by file. Any
  knot can divert to any knot regardless of file, because ink has one global knot namespace.
- **Positions persist** in a sidecar JSON next to the root file. Ink files are never touched by layout
  changes.
- **The story runs inside the app.** Play mode compiles the project with inkjs and steps it, painting
  the playhead onto the canvas.

Out of scope: representing stitches or weave structure as separate nodes, a full-project text editor,
collaboration.

## 2. The five principles

Everything below follows from these. They are repeated in
[`CONTRIBUTING.md`](../../CONTRIBUTING.md) because a change that breaks one of them is not a change
worth making.

1. **The `.ink` files are the only source of truth.** Node positions and UI state live in a sidecar
   `*.inkvisual.json`, never inside ink files.
2. **Never regenerate ink from an AST.** A file is an ordered list of text segments (preamble + one per
   knot). Saving is `segments.map(s => s.text).join('')`, byte-exact. Edits replace one segment's text.
3. **Two-tier parsing.** A small "splitter" (a header scan) decides what the nodes are and owns the
   text. The `inkjs` parser only supplies edges, stitches and diagnostics. The graph must never lose a
   node because the parser hit a syntax error.
4. **Small codebase, mainstream libraries.** Prefer copying a documented React Flow or CodeMirror
   pattern over inventing one. Pure model code in `src/model/` has no React imports and is unit tested.
5. **The preview scanner is advisory.** `src/model/preview.ts` decides what a node *looks* like, never
   what the graph *is*. A scanner mistake may mislabel a row; it must never move or lose a wire.

## 3. Why these libraries

| Concern | Choice | Why |
|---|---|---|
| Ink parsing | `inkjs` 2.4 (`inkjs/full`) | A TypeScript port of the real inklecate compiler. `InkParser.ParseStory()` gives a full AST with file + line on every knot, stitch and divert, and keeps going past syntax errors. ~50 ms for a 2,000-line project. The alternatives (unofficial tree-sitter grammars, the archived ink language server, an Ace-tokenizer outline scan, regex-only parsing) are all approximations of the grammar; `->` inside `{...}` alternatives and `-` inside multi-line blocks defeat the naive ones. |
| Canvas | `@xyflow/react` 12 (React Flow) | The best-documented option that supports real interactive HTML inside nodes, plus group nodes, minimap and controls. tldraw's 2025 licence change ruled it out; Cytoscape.js is weak for rich HTML nodes; Rete.js is dataflow-oriented; JointJS is a commercial upsell; hand-rolled SVG is more code to maintain. |
| Ink editor | CodeMirror 6 via `@uiw/react-codemirror`, with `@mavnn/codemirror-lang-ink` | A real Lezer grammar for ink (knots, stitches, functions, diverts, tunnels, choices with conditions, gathers, sequences, comments, tags, glue, VAR/CONST/LIST). Monaco is multi-megabyte with a worker per language and is built around one IDE instance; Ace is what Inky uses but has a dated architecture; a textarea overlay is not an editor. |
| Auto-layout | `@dagrejs/dagre` | Small, synchronous, and the official React Flow layout example. Used only for nodes with no saved position, so it never overwrites manual placement. `elkjs` is 1.4 MB and async; only worth it if group-aware layout is ever needed. |
| State | `zustand` | One store, no provider ceremony, and selectors that let the canvas subscribe narrowly. |
| Node body | Our own preview renderer (plain divs) | See §8. Divs buy free ellipsis truncation, free theming through CSS variables and free hit testing for row clicks. SVG has none of those; canvas additionally blurs under React Flow's viewport transform, which "no level-of-detail switching" makes unfixable. |
| Desktop shell | Electron + electron-builder | Ships a browser and Node in one process, which is exactly the two halves this app already is. Tauri would need a Rust toolchain for every contributor; a VS Code extension would make webview-to-document sync the hardest part of the app. |
| File watching | `chokidar` | Cross-platform, and the same watcher code serves both hosts. |

Design precedents worth knowing: Twine 2 and Yarn Spinner both derive edges by parsing link syntax out
of node text at load time, and Twine creates a passage when you click a broken link — we create a knot
from a red "missing target" stub the same way. Twee3 and Yarn store positions *inside* the source; we
deliberately do not, because ink has no metadata syntax beyond comments and layout churn would dirty
ink files in git. Knot names are globally unique in ink, which makes a sidecar keyed by name just as
robust. Obsidian's JSON Canvas is the sidecar precedent.

## 4. System overview

```
+--------------------------- renderer (React) -----------------------------------+
|                                                                                |
|  ui/Canvas.tsx (React Flow)   ui/Sidebar.tsx    ui/CodeDock.tsx  ui/PlayPanel   |
|    StructureNode / NodeHeader   files, search,    CodeMirror,      run, step,   |
|    RerouteNode                  diagnostics       selected knot    breakpoints  |
|         |                            |                 |               |       |
|         v                            v                 v               v       |
|  store/projectStore.ts (zustand)          store/playStore.ts                    |
|         |                                                                       |
|  model/  (pure TS, no React)                                                    |
|    splitter.ts  file text <-> segments (preamble + one per knot), byte-exact     |
|    project.ts   INCLUDE discovery, path rules                                    |
|    inkParse.ts  inkjs wrapper -> knots, stitches, diverts, diagnostics            |
|    graph.ts     segments + parse -> graph nodes and edges                        |
|    preview.ts   knot text -> preview rows, line<->row map, row geometry           |
|    ops.ts       pure edits: set text, re-split, create/delete knot, add divert    |
|    layout.ts    sidecar schema, effectiveSize, dagre for unplaced nodes           |
|    history.ts   session-only undo stack over {files, layout}                      |
|    playCompile / playMap / playFx   Play mode: compile, position mapping, effects |
|         |                                                                       |
|  fs/client.ts   ProjectFS: openProject / readFile / writeFile / onChange / pick  |
+---------|-----------------------------------------------------------------------+
          |  fetch('/api/...')  +  change events
+---------v---------------------- host --------------------------------------------+
|  server/fileApi.ts   framework-free handlers: project, file read/write, picker    |
|                                                                                  |
|  dev in a browser:            packaged desktop app:                              |
|    server/vitePlugin.ts         electron/main.ts                                  |
|    mounts /api in Vite,         serves dist/ and routes /api/* into handleApi     |
|    chokidar -> Vite ws          over the app://inkvisual/ scheme; chokidar ->     |
|                                 webContents.send('ink:changed'); native dialog    |
+----------------------------------------------------------------------------------+
          |
   <project dir>/*.ink   +   <root>.inkvisual.json
```

`server/fileApi.ts` is shared by both hosts unchanged. That is the point of keeping it framework-free:
it reads only `req.url`, `req.method` and the request body stream, and writes only through
`res.statusCode`, `res.setHeader` and `res.end`, so a thin adapter can drive it from a WHATWG
`Request` in Electron just as Vite's connect middleware drives it in the browser.

## 5. Data model

### 5.1 Files and segments (`model/splitter.ts`, `model/types.ts`)

```ts
type FilePath = string;              // relative to the root file's directory, forward slashes

interface Segment {
  id: string;                        // `${path}#${name}`; the preamble is `${path}#`; duplicates get `#2`, `#3`
  kind: 'preamble' | 'knot';
  name?: string;                     // knot name from the header line
  isFunction?: boolean;
  text: string;                      // header line through the line before the next header (or EOF)
  startLine: number;                 // 1-based
}

interface InkFile { path: FilePath; segments: Segment[] }
```

Splitter rules:

- A line starts a new knot segment when, after trimming leading whitespace, it is a knot header
  (`=== name ===`, two or more `=`, optional `function`, optional parameters) and the line is not
  inside a `/* ... */` block comment. A single `=` is a stitch and stays inside the knot.
- Everything before the first header is the preamble segment (possibly empty). For the root file that
  holds the `INCLUDE`s, the `VAR`s and the story's starting content.
- Blank lines and comments between knots belong to the preceding segment. Nothing is ever dropped or
  normalised, and `join(split(text)) === text` for any input — property-tested.
- Identifiers may contain any letter (`\p{L}`), and a leading BOM is tolerated.

Editing: `editSegment` replaces one segment's text. A file is re-split 300 ms after typing stops, and
only if the new text contains a different set of header lines. When a re-split renames or creates
knots, layout entries carry over by position in the file, so renaming a knot in place keeps its node
where it was.

### 5.2 Parse result (`model/inkParse.ts`)

```ts
interface ParsedKnot {
  name: string; file: FilePath; line: number; isFunction: boolean;
  stitches: string[];
  stitchLines: Record<string, number>;   // where a `knot.stitch` wire should arrive
  labels: string[];                      // `- (label)` / `* (label)`, for internal-jump detection
  divertParams: string[];                // `=== k(-> x) ===`; scoped to this knot on purpose
}

interface ParsedDivert {
  fromKnot: string;                      // knot name, or `${file}#` for top-level content
  target: string;                        // as written: 'forest.entrance', 'DONE', 'current_epilogue'
  kind: 'divert' | 'tunnel' | 'thread' | 'reference' | 'call';
  inChoice: boolean;
  file: FilePath; line: number | null;
}

interface ParseResult {
  knots: ParsedKnot[];
  diverts: ParsedDivert[];
  divertVariables: string[];             // global VAR/CONSTs whose value is a divert target
  preambleLabels: string[];
  diagnostics: { file, line, message, severity: 'error' | 'warning' | 'todo' }[];
}
```

`reference` is `-> knot` used as a value (`VAR x = -> knot`); `call` is a function call (`~ f()` or
`{f()}`) and never becomes a flow edge. Errors arrive from inkjs pre-formatted as
`ERROR: 'file.ink' line 12: message` (type 2), warnings as type 1 and `TODO:` lines as author messages
(type 0); one regex turns them into structured diagnostics. The parse runs debounced over the whole
project.

### 5.3 Sidecar layout file (`model/layout.ts`)

`<root-basename>.inkvisual.json`, next to the root `.ink` file:

```json
{
  "version": 1,
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": {
    "intro":  { "x": 120, "y": 40,  "w": 340, "h": 200, "collapsed": false },
    "forest": { "x": 520, "y": 200 }
  },
  "files": { "act1.ink": { "color": "#6cc3d5" } },
  "reroutes": { "intro->forest": [{ "x": 300, "y": 120 }] }
}
```

- Keyed by knot name; preamble nodes use the node id (`<path>#`). Missing stubs are never saved.
- `w` / `h` are *hand-set* sizes only. Absent means "size to fit the knot". `effectiveSize` applies
  them, and it is called from `toFlow` so a resize shows immediately (see PITFALLS).
- Missing entries are placed by dagre relative to already-placed nodes, then saved.
- Orphan entries are pruned on save. Written with a 1 s debounce through the same file API.

## 6. Graph derivation (`model/graph.ts`)

Input: every file's segments + the latest `ParseResult`. Output: `GraphNode[]` and `GraphEdge[]`.

Nodes: one per knot segment. The root preamble is always a node titled **Start**. An included file's
preamble becomes a node only when it holds code rather than just comments — ink splices that content
into the Start flow at the `INCLUDE` line, so Start links to it with an `include` edge. Node data
carries the file, its colour, `isFunction`, stitches, `flags: { end, done, dynamic, loops }` and an
error count (diagnostics are attributed to the segment whose line range contains them).

Edge resolution for each divert, in order:

1. `END` / `DONE`: no edge; set the node's `end` / `done` flag, shown as a badge.
2. First path component names a knot: edge to that knot, labelled with the remaining components
   (`.entrance`). Styled by kind — divert solid, tunnel dashed, thread dotted, reference grey dashed.
3. First component is a stitch or a label inside the same knot (or a top-level label, for the Start
   flow): an internal jump, no edge.
4. First component is a global divert-typed `VAR`/`CONST`, or a divert-typed parameter of *this* knot:
   set the node's `dynamic` flag with the variable name, no edge. Parameter names are scoped to their
   knot on purpose; the same name elsewhere is a missing target.
5. Otherwise: an edge to a synthetic red "missing: name" stub node. Clicking its **+** creates that
   knot, next to the knot that named it.

Edges are **not** merged: `A -> B` written three times is three wires, because each leaves the line
that wrote it. Self-diverts render as a "loops" badge rather than an edge. Function knots never
produce flow edges.

## 7. Editing operations and undo (`model/ops.ts`, `model/history.ts`)

All ops are pure `(project, args) => project`, so they are testable and undoable.

| Operation | Text effect |
|---|---|
| `setSegmentText(id, text)` | Replace one segment's text. |
| `resplit` | Re-derive segments for a file whose header lines changed, carrying layout across in-place renames. |
| `createKnot(file, name, pos)` | Append a new segment with a `TODO: write <name>` line (ink rejects an empty knot); add a layout entry. |
| `deleteKnot(id)` | Remove the segment. Other files' diverts to it become "missing" stubs, which is the honest result. |
| `addDivert(fromId, toName)` | Append `-> toName` on its own line at the end of the from segment. This is what dragging a connection does. |

Undo is one session-only snapshot stack over `{files, layout}` minus the camera, covering both ink text
and graph layout (move, resize, create, delete, connect, waypoints, collapse, auto-layout). CodeMirror's
own history is off. Typing coalesces over about 500 ms; multi-node drags, resizes and multi-deletes use
`batch`. Not undoable: pan/zoom, selection, theme, dock width, hide-file, save. After a save, undo
re-dirties the file; undoing back to the last-saved bytes clears dirty again. History is never written
to the sidecar (that would poison git diffs) and is cleared when the project is reopened from disk.

## 8. The canvas and the node body

### The structure preview (`model/preview.ts`, `ui/StructureNode.tsx`)

With a full CodeMirror body in every node, zoom did two jobs at once — "how far am I zoomed" and "how
much detail am I shown" — and they fought: at a zoom where one knot's text was legible its neighbours
overlapped, and at a zoom where the whole graph fitted, every node was a title-only chip. So the body
became a fixed abstract picture of the knot's branching skeleton, and raw ink moved to the dock.

The encoding budget, in priority order — **no channel carries two facts**:

| Channel | Carries |
|---|---|
| Vertical position | source order, 1:1 with the ink |
| Left edge / indent | weave nesting depth, and nothing else |
| Marker shape and hue | row kind (choice / gather / divert / stitch / condition) |
| Readable text | choice labels, anchor names, divert targets — never prose |
| Bar right edge | prose mass, quantised to three steps: texture, not measurement |
| A rail in its own column | inside a multiline `{...}` block |

Deliberately not drawn: prose content, blank lines, comments, glue-only lines, tag lines, the post-`]`
continuation of a choice, and condition expressions.

The scanner is a single forward pass carrying `{inBlockComment, braceDepth, lastDepth}`; each step
consumes text, so the order is load-bearing — no single regex separates a line carrying a marker, an
inline `{}`, brackets and a trailing divert. There are eight row kinds (`header`, `stitch`, `choice`,
`gather`, `prose`, `divert`, `cond`, `logic`) plus a `cond` *flag* that composes with any of them, because
a conditioned choice must stay one row: splitting it would break the line-to-row map the wire handles
depend on.

Three rules are load-bearing, and each has an entry in [`PITFALLS.md`](./PITFALLS.md):

- **The scanner is advisory.** `rowOf` is a total, monotonically non-decreasing map from every
  segment-relative source line to a row, so a handle can never fall off it, and the authoritative
  divert set stays the parser's.
- **`layoutRows()` is the single source of truth for row y.** The card and the wire routing both call
  it, so they cannot drift; a DEV-only canary in `StructureNode` warns if the DOM disagrees by more
  than 1px.
- **The preview cache compares against `preview.source`**, the text the scan actually saw — never the
  store's live `texts`.

Height policy: past a 420px cap, *bar* rows squeeze toward a 2px floor, because a prose bar's height
carries no information and is the cheap thing to give away. Text rows are never shrunk on their own
account, so a long branchy knot simply grows and keeps its labels readable. Only a hand-set height
scales the whole card, and only then can labels drop out — which means dragging a node taller is how
you get a giant knot's labels back.

### Canvas wiring (`ui/Canvas.tsx`, `ui/flow.ts`)

`ui/flow.ts` is pure: graph + layout + filters in, React Flow nodes and edges out. It owns the handle
ids (`out:<line>` / `in:<line>`, segment-relative), the node geometry constants, `handleTop()`, and the
reroute dots that split one edge into a chain. `ui/Canvas.tsx` is the React Flow wrapper: connect,
double-click to create, double-click a wire to add a reroute dot, Delete, selection. Clicking a preview
row sets `focus`, which puts the dock's cursor on that source line.

## 9. Persistence and the file API

### `ProjectFS` (`src/fs/client.ts`)

```ts
interface ProjectFS {
  openProject(root: string): Promise<ProjectResponse>;
  readFile(path: string): Promise<{ text: string; hash: string } | null>;
  writeFile(path: string, text: string, baseHash: string | null): Promise<WriteResult>;
  onChange(cb: (e: { path: string; hash: string | null; event: string }) => void): () => void;
  pickRoot(startDir: string | null): Promise<string | null>;
}
```

The HTTP implementation is the only one. A File System Access API backend could be added behind the
same interface without touching the rest of the app.

### Handlers (`server/fileApi.ts`)

- `GET /api/project?root=<path to root.ink>` — walks `INCLUDE` lines transitively from the root (paths
  resolved relative to the root's directory, matching inklecate), and returns every file with a SHA-1
  hash, the includes it could not find, and other `.ink` files in the tree that are not included.
- `GET /api/file?path=`, `PUT /api/file` with `{ path, text, baseHash }`. Writes are atomic (temp file
  + rename). If the disk hash differs from `baseHash` the response is 409 with the disk hash, and the
  UI offers reload or overwrite.
- `GET /api/pick` — the native Open dialog.
- Only `.ink` and `.inkvisual.json` paths under the project root are readable or writable, and `..`
  traversal is rejected.

### The two hosts

**Browser dev server** (`server/vitePlugin.ts`): mounts the handlers under `/api` in Vite's middleware,
watches the project directory with chokidar, and pushes `ink:changed` over Vite's websocket. The
project root comes from the `?root=` query parameter. `/api/pick` shells out to a PowerShell
`OpenFileDialog` and is Windows-only here; other platforms get a 501 and the typed-path box.

**Packaged desktop app** (`electron/`): the main process registers a privileged scheme
`app://inkvisual/` before app-ready (`standard`, `secure`, `supportFetchAPI`, `corsEnabled`, `stream`)
and serves it with `protocol.handle` — static files out of `dist/`, and `/api/*` routed into the same
`handleApi`. A custom scheme rather than a localhost HTTP listener because it gives a **stable
origin**, and the renderer keeps `inkvisual:lastRoot`, the recent-projects list, the theme and the dock
width in `localStorage`; an ephemeral port would throw all of that away on every launch. `/api/pick` is
answered by Electron's `dialog.showOpenDialog` over IPC, which also makes the picker work on Linux.
chokidar runs in the main process and pushes the same `ChangedEvent` payload through
`webContents.send('ink:changed', …)`. The renderer runs with `contextIsolation: true`,
`nodeIntegration: false` and `sandbox: true`; a preload script exposes a minimal `window.inkvisual`
bridge. Main and preload are bundled by esbuild to `build/main.cjs` and `build/preload.cjs`, with only
`electron` external — so `dependencies` stays empty and the packaged app ships Electron plus `build/`
and `dist/` and nothing else.

Change-event rule in the client, on either host: ignore the event if the hash equals what we just
wrote; if the file is not dirty, reload and re-split silently (layout carries over by knot name); if it
is dirty, show a banner offering reload or keep-mine.

Saving: Ctrl+S writes every dirty file. An autosave toggle (debounced) is available and off by default.

## 10. Play mode (`model/playCompile.ts`, `model/playMap.ts`, `model/playFx.ts`, `store/playStore.ts`)

Play mode compiles the project to a runtime inkjs `Story` and steps it: run, step forward, step back,
restart, run-to-cursor, breakpoints, a live variable watch, coverage paint, and optional camera and
editor follow. The playhead is painted onto the canvas — the card, and the exact preview row, that is
producing the current line.

Two structural decisions carry the whole feature:

- **Compilation freezes a `ScriptSnapshot`**: the exact texts the `Story` was compiled from, plus the
  segment table as it stood at that moment. Every runtime `{file, line}` is resolved against that
  snapshot, never against the live store, because the first keystroke after compiling reflows every
  later segment's `startLine`.
- **Positions come from `state.outputStream[i].ownDebugMetadata`**, read immediately after each
  `Continue()`. Mapping fails soft down a ladder — exact row, then card, then "the file is hidden",
  then "that knot no longer exists", then nothing — so an edited project never produces a wrong
  highlight, only a vaguer one.

The rest of the runtime traps are in [`PITFALLS.md`](./PITFALLS.md#inkjs-the-runtime-play-mode). Read
them before writing an inkjs runtime call.

## 11. Repository layout

```
src/model/     pure TypeScript, no React imports, unit tested
src/store/     zustand stores (project, play)
src/ui/        React components, plus the pure helpers they need (flow.ts, inkLinks.ts, inkTheme.ts)
src/fs/        the ProjectFS client
server/        framework-free file API + the Vite dev-server plugin
electron/      main process, preload, and the app:// protocol handler
scripts/       build/dev helpers and the CLI graph dumper
examples/      user-facing example projects; these must stay openable and error-free
tests/fixtures/  fixture projects the unit tests parse
docs/          user documentation
docs/dev/      this document, PITFALLS.md, RELEASING.md
```

## 12. Risks and how they are handled

| Risk | Mitigation |
|---|---|
| Corrupting a user's ink file | Byte-exact segment model, property tests, atomic writes, hash-based conflict detection, and never writing a file that has not changed. |
| A parser error while typing drops edges | Nodes never depend on the parser; the splitter owns them. |
| A knot rename loses its position | Same-index carry-over on re-split. |
| Ink features with no graph form (dynamic diverts, threads, tunnels) | Badges and edge styles (§6); never pretend accuracy the text does not have. |
| inkjs quirks | `typeName` dispatch, `ParseStory` not `Compile`, null `debugMetadata` guards, own target resolution — all in PITFALLS. |
| Very large projects | Previews are cached per knot so one keystroke rescans one knot. A parsing Web Worker is the next lever if it is ever needed. |

## 13. Current state, and what is next

**Working today.** Open a project (native dialog, recent list, or `?root=`); every knot as a node with
its structure preview; wires leaving the exact line that wrote the divert and arriving at a stitch's
line; edit raw ink in the docked editor with ink syntax highlighting, adjustable font size and
clickable divert targets; save with Ctrl+S and disk-conflict banners; autosave; create knots and new
`.ink` files (the `INCLUDE` is written for you); connect knots by dragging; delete knots; create a
missing target from its red stub; hide files; collapse and resize nodes; reroute dots on wires;
auto-layout for unplaced nodes; undo/redo across both text and layout; dark and light themes; search
and a diagnostics list that jump to a knot and line; live reload when files change on disk; and Play
mode. Positions, sizes, viewport, collapsed flags and reroute dots persist in the sidecar.

**Tested.** Vitest covers `src/model/` (splitter round-trip, parse, graph, ops, layout, preview against
the whole example corpus, history) plus the pure wire-routing helpers in `src/ui/flow.ts` and the
editor-link and theme helpers. There are no tests for the store or the React components — a fake
`ProjectFS` and store-level tests for open/edit/reparse/save-conflict would be the highest-value
addition.

**Next, roughly in value order.**

1. **Rename refactor** — rename a knot and rewrite every `-> old`, `old.stitch` and `{old}` reference
   across files, with a preview. The parser already lists divert locations; visit-count reads need a
   word-boundary regex fallback.
2. **A context menu** for rename, move-to-file and add-reroute.
3. **Move a knot to another file** — `ops` needs a `moveKnot` that also inserts the `INCLUDE`.
4. **A resizable split view** rather than a fixed-width dock, and a way to see two knots' raw text at
   once, which the old in-node editors could do and a single dock cannot.
5. **Measured node sizes for dagre** (`useNodesInitialized` + `node.measured`) instead of the
   line-count estimate.
6. **Click a wire to jump to its source line** — edges already carry `sourceLine`.
7. **Store tests** with a fake `ProjectFS`.
8. **Performance for very large projects** — a Web Worker for parsing.
