# Pitfalls

Every entry below was learned from a real bug. Each one keeps the reasoning, because the reasoning is
the part that stops you undoing the fix. If you are about to touch the wire routing, the preview
scanner, or the history stack, read the relevant section first — those three areas have the highest
ratio of "looks obviously wrong" to "is load-bearing".

---

## inkjs (parsing the graph)

- **Import everything from `inkjs/full`, and dispatch on `node.typeName === 'Divert'`, never
  `instanceof`.** The same class is reachable through `inkjs/full` and through `inkjs/compiler/*`, and
  the two import paths produce different constructor identities, so `instanceof` silently returns
  false and whole categories of AST node disappear without an error.

- **Use `new InkParser(text, file, onError, null, new JsonFileHandler(map)).ParseStory()` for the live
  graph, not `Compiler.Compile()`.** `Compile()` throws a bare `Error('Compilation failed.')` on any
  error and the useful text is buried in `compiler.errors`; `ParseStory()` returns a partial AST and
  keeps going, which is what lets the graph survive a syntax error the author is mid-way through
  typing. A file handler is required even for a single-file parse.

- **`debugMetadata` can be `null` on some AST nodes even in a perfectly valid file** (some
  `-> DONE` / `-> END` diverts, for instance). Always guard it, and fall back to the owning knot's line
  range when a divert has no line of its own.

- **Function knots have `typeName === 'Function'`, not `'Knot'`.** `VAR` and `CONST` declarations have
  `typeName` `'VAR'` / `'CONST'`; match them by their `variableIdentifier` / `constantIdentifier` shape
  rather than by guessing at the field names.

- **inkjs appends an implicit `-> DONE` to the root file's top-level content**, with a null
  `debugMetadata`. `inkParse.ts` skips it. Without the skip, Start always looks like it ends the story.

- **`ExportRuntime()` is what reports undefined divert targets and duplicate names.** inkjs skips it
  after any syntax error, and a duplicate-name error stops it before reference resolution — so those
  diagnostics are simply unavailable while the project has an earlier error. Do not conclude that a
  target resolves just because nothing complained.

- **inkjs 2.4 throws an empty `Error` from `ExportRuntime()` when a `CONST` holds a divert target.**
  `inkParse.ts` catches it and reports a "Semantic checks skipped" warning; undefined-target errors are
  unavailable for that project until the `CONST` is changed to a `VAR`. An empty error message here is
  the symptom to recognise, not a bug in our catch.

- **Do not use `Divert.targetContent`.** It is only resolved when the whole project parses cleanly.
  Resolve divert targets yourself, by name, against the knot table.

- **INCLUDE paths resolve relative to the *root* file's directory, not the including file's.** This is
  what inklecate does, at every depth of nesting, and `JsonFileHandler` does no path resolution of its
  own — it is an exact key lookup into the map you hand it, so the keys must be exactly the strings
  written to the right of `INCLUDE`, made root-relative.

## inkjs (the runtime, Play mode)

- **Resolve every runtime position against the frozen compile-time snapshot
  (`ScriptSnapshot` in `playCompile.ts`), never against the live store.**
  `ops.setSegmentText` reflows every later segment's `startLine` on the very first keystroke, so a live
  lookup silently highlights the wrong row, or the wrong card, as soon as the author types.

- **`state.ToJson()` strips all debug metadata.** A story re-hydrated from JSON can never highlight
  anything again, so the compiled `Story` object must stay alive in the session that built it. JSON
  round-tripping is fine for the per-step snapshot ring (`ToJson` / `LoadJson` on `state`), which is how
  stepping backwards works; it is not a way to persist a playable session.

- **Never call `Continue()` on a story whose `ValidateExternalBindings()` threw.** inkjs latches
  `_hasValidatedExternals` even when validation fails, which permanently disarms its own unbound-EXTERNAL
  check; after that `Continue()` returns `""` with no error at all. `playCompile.ts` returns
  `story: null` with `externalsUnrepairable` set rather than handing back a story that will fail
  silently.

- **Read the playhead from `state.outputStream[i].ownDebugMetadata` immediately after each
  `Continue()`.** `currentPathString` is null on most steps, and `currentPointer` /
  `story.currentDebugMetadata` are frequently one object *ahead* — they point at the next divert, not at
  the text just printed.

## React Flow

- **`.react-flow__pane` contains the viewport, the nodes and the edges.** A "did the user click empty
  canvas" check must explicitly exclude `.react-flow__node` and `.react-flow__edge`, or every click on a
  card counts as a click on the background.

- **Set `deleteKeyCode={null}` on `<ReactFlow>`.** Otherwise Backspace typed inside an editor deletes
  the selected node.

- **Read `node.measured.width/height`, not `node.width`, and only after `useNodesInitialized()` is
  true.** v12 moved measured sizes; the official dagre example hardcodes sizes and has to be adapted.

- **Preview rows are plain divs with no `nodrag` / `nowheel` classes, on purpose.** Dragging a row drags
  the node and the wheel zooms the canvas, which is what you want now that a node body never scrolls.
  Only the docked editor needs `stopPropagation`, and it lives outside React Flow entirely.

- **A node's body never changes with zoom.** There is no level-of-detail switch and no
  `useStore(s => s.transform[2])` subscription inside a node. Adding one back re-renders every card on
  every zoom step, which is exactly the cost the fixed-detail preview was built to remove.

- **A reroute dot carries eight handles stacked on its centre** (in/out × left/right/top/bottom), and
  `rerouteSides` gives each dot **opposite** sides for its in and out handle so a wire keeps its heading
  through the dot; the axis is the bisector of the two legs. Aiming each handle at its own neighbour
  instead produces right angles inside the dot, and on a rectangular detour it makes a vertical leg
  leave one dot sideways and enter the next sideways, crossing itself.

## CodeMirror and the docked editor

- **The editor stops key events from reaching React Flow on the *bubble* phase (`onKeyDown`), never the
  capture phase.** React listens at the root container, so stopping in the capture phase ends the native
  event before it reaches CodeMirror's own keydown handler on `.cm-content`, and then no keymap binding
  fires — Tab, Home/End, all of it. Typing still works, because that arrives as `beforeinput`, which is
  why the breakage is easy to miss. Canvas and app shortcuts must therefore be handled at window level
  in the capture phase (Ctrl+S, Ctrl+Z / Ctrl+Y, the play shortcuts) or on the canvas host (Delete).

- **Keep `resolve.dedupe` for the CodeMirror packages in `vite.config.ts`.** Two copies of
  `@codemirror/state` throw "Unrecognized extension value" and kill every editor in the app.

- **Wrapped lines keep their indentation** through the `hangingIndent` plugin in `inkTheme.ts`: ink's
  weave is read by indentation, and CodeMirror otherwise wraps back to column 0. It hangs past the
  leading whitespace *and* past the `*` / `+` / `-` markers and `(label)`, so an overflow line lines up
  with the line's text — and so that `-> x` is not read as a gather marker.

- **The docked editor is keyed by `${selectedId}:${historyEpoch}`, and CodeMirror's `history` extension
  is off on purpose.** One store-owned snapshot stack covers both typing and graph edits
  (`src/model/history.ts`); a shared `EditorView` across knots would treat a store-driven `value`
  replacement as a user edit of the currently open knot. `historyEpoch` remounts the editor after an
  undo/redo of the open knot, so the caret is restored through `focus` rather than through uiw's
  whole-document sync.

- **Hold the `EditorView` in state, not in a ref.** CodeMirror is created on a second render pass, so an
  effect that reads a ref finds it null on the commit that mounts it and never retries.

- **Only decorate an editor link the app can actually follow** — `inkLinks` asks `resolves` first. Note
  that the ink highlighting already underlines every `t.name` token, so variables look like links too;
  the pointer cursor and the hover tint are the only things that distinguish a real one.

- **The link hit box is the name glyphs themselves (`.cm-ink-link`), not the leftover space of the
  line.** CodeMirror's `posAtCoords` maps a click to the right of the text — the extremely common "put
  my cursor at the end of the line" gesture — onto the last character, which is very often the divert
  target. Asking the DOM whether the click actually landed on the mark is what keeps that gesture from
  navigating the whole app to another knot.

## The model's invariants

- **`join(split(text)) === text`, byte for byte, for any input.** The splitter owns the text; the parser
  never does. Saving a file is `segments.map(s => s.text).join('')`. This is property-tested.

- **The editor shows `ops.editorText(segment)` — the segment *without* its final line terminator —
  and `editSegment` puts that terminator back.** Every segment but a file's last one ends with a
  newline, and if the editor owned it the author could delete it; the next re-split would then read
  `last line=== next ===` as prose and silently merge two knots into one.

- **Ink identifiers allow any letter (`\p{L}`), and Windows editors often prepend a BOM.** The
  splitter's header regex handles both. Keep it that way — a knot whose name is not ASCII must not
  vanish from the graph.

- **ink rejects a knot header with no content after it** ("Expected at least one line within the
  knot"). `ops.createKnot` therefore writes a `TODO: write <name>` line, which shows up as a todo
  diagnostic until the author replaces it.

- **`layoutRows()` is the single source of truth for a preview row's y.** Wires attach to per-line
  handles (`out:<line>` / `in:<line>`, plus `out` / `in` on the header) where `<line>` is
  **segment-relative** — 0 is the knot's `===` header line. `handleTop()` in `flow.ts` turns that line
  into a y by asking `preview.rowOf` which row draws it and `layoutRows()` where that row sits. The card
  and the wire routing both call `layoutRows()`, so they cannot drift. `StructureNode` carries a
  DEV-only canary that warns when a row's real `offsetTop` disagrees with the model by more than 1px: if
  you change `.pv-row` padding in `styles.css`, change `DEFAULT_METRICS` too, or that fires.

- **The preview scanner is advisory and can never move or lose a wire.** `rowOf` is a total,
  monotonically non-decreasing map over every segment-relative source line: a line the scanner dropped
  maps to the nearest preceding kept row, so a handle can never fall off the map. `PreviewRow.targets`
  is advisory too — the authoritative divert set is the inkjs parser's. If the scanner misses a divert
  inside a nested brace, the row just renders as a prose bar and the wire still leaves from the right y.

- **A preview row never merges with the line above it when either line carries an arrow — and the test
  is `PreviewRow.arrow`, not `targets`.** An arrow the scanner deliberately skips as a divert-typed
  argument (`TURNS_SINCE(-> x)`) still becomes a real `reference` edge with its own source line, so it
  still needs a row of its own; otherwise two wires leave the card from the same point.

- **A choice row absorbs a lone `-> target` row that follows it**, so "go there" costs one row rather
  than two — but only when the choice carries no arrow of its own, for exactly the reason above. A row
  that shows words of its own also shows where it goes, right-aligned and non-shrinking: the label gives
  up space first, because "which choice is this" survives truncation and "where does it go" does not.

- **The preview cache compares against `preview.source` — the text the scan actually saw.** Comparing
  against the store's `texts` map does not work: `editSegment` writes the new text there immediately, so
  by the time the debounced reparse runs the two already match and every preview would go stale.

## The store, history and layout

- **Document mutations must run inside `transact` / `batch`, and must never mutate `files` or `layout`
  in place.** Pointer equality is how the history decides whether to record a step. This covers
  `editSegment`, create/delete/connect, move/resize, waypoints, collapse and auto-layout. Viewport,
  selection, theme and dock chrome are deliberately *not* wrapped — the camera is not undoable. History
  is session-only, and `open()` clears it.

- **Hand-set node sizes live in the sidecar as `w` / `h`; `views[].size` is only the *automatic*
  size.** The automatic size is rebuilt on reparse, not on layout changes, so `effectiveSize` applies
  the override inside `toFlow`. Put any new size logic there, not in `buildViews`, or a resize will not
  show until the next reparse. The row geometry is size-dependent for the same reason, and is also
  computed in `toFlow`.

- **Reroute waypoints are keyed by `rerouteKey`, which includes the edge's written target suffix**
  (`a->b.stitch`). Dropping the suffix re-merges wires that arrive at different stitches into one
  bundle, and then there is no way to tell which wire lands where. Changing this key orphans existing
  sidecar entries; `pruneLayout` drops them on the next save.

- **The sidecar is the only file layout changes ever touch.** Positions never go into ink files: ink has
  no metadata syntax beyond comments, and layout churn in a `.ink` file poisons git diffs.

## CSS and layout

- **Every child of `.app` needs `min-height: 0`.** Grid items default to `min-height: auto`, so a panel
  taller than the viewport stretches the row and hands the scrollbar to the window instead of scrolling
  inside itself — which is what makes the docked editor's own scroller stop working.

## Tooling and the dev loop

- **Editing a file under `src/store/` or `src/model/` while `npm run dev` is open triggers a full page
  reload**, which discards unsaved edits in the running app. Save your work in the app before touching
  those files.

- **The browser dev server's Open dialog is a PowerShell `OpenFileDialog` spawned by the server
  (`GET /api/pick`), and it is Windows-only** — the server owns file access, so the dialog has to run
  server-side. Other platforms get a 501 and fall back to the typed-path box. The packaged desktop app
  does not use this path at all: it answers `/api/pick` with Electron's native
  `dialog.showOpenDialog`, which works everywhere.
