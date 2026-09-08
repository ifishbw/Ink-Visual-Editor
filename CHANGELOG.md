# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-07

First public release, and the first with desktop builds.

### Added

**The graph**

- One node per ink knot, laid out on a pan-and-zoom canvas. The root file's top-level content becomes a
  **Start** node; an included file's top-level content becomes a node only when it holds code, linked
  from Start the way ink splices it in.
- A **compressed structure preview** as each node's body: choices with their labels, gathers, diverts
  with their targets, stitch anchors, condition marks, and prose as bars whose width steps with the
  line's length. Indentation is weave depth. It renders identically at every zoom level — there is no
  level-of-detail switch.
- **One wire per divert**, derived from the text and never authored separately. A wire leaves the exact
  line that wrote the divert and arrives at the line of the stitch it names. Tunnels, threads and
  divert references are styled distinctly; `END` / `DONE` / dynamic diverts and self-loops become
  badges on the node rather than wires.
- Red **missing-target stubs** for diverts that name a knot that does not exist yet; the stub's **+**
  creates that knot beside the one that named it.
- **Reroute dots**: double-click a wire to add a waypoint and route a detour by hand.
- Automatic layout with dagre for nodes that have no saved position; manual placement is never
  overwritten.
- Node **collapse** and **resize**, with a one-click return to the automatic size.
- File colours, per-file visibility toggles, and a "hide functions" toggle.

**Editing**

- A docked **CodeMirror 6** editor for the selected knot, with ink syntax highlighting in both themes,
  adjustable font size, four-space indent, and wrapped lines that keep their weave indentation.
- Divert targets in the editor are **links**: click the name to travel to the knot it points at — the
  dock follows, the cursor lands on the stitch, and the canvas flies over. Alt+click edits the name
  instead. Clicking a preview row on a card puts the cursor on that source line.
- Create knots (double-click the canvas, or **New knot**), create new `.ink` files (the `INCLUDE` is
  written into the root for you), connect knots by dragging from a node's handle (which appends the
  divert to the source knot's text), and delete knots with a confirmation you can switch off.
- **Undo and redo** across both ink text and graph layout, on one chronological stack — typing,
  creating, deleting, connecting, moving, resizing, collapsing, waypoints and auto-layout. Session-only;
  the camera, selection and theme are deliberately not undoable.
- Byte-exact round trip: a file is an ordered list of text segments and saving is a plain join, so
  nothing InkVisual writes reformats a line it did not change.

**Play mode**

- Compile and run the story in the app: run, step forward, step back, restart, and run-to-cursor.
- **Breakpoints**, a **live variable watch** (with editing), and **coverage** paint.
- The playhead is painted onto the canvas — the card and the exact preview row producing the current
  line — with optional camera-follow and editor-follow.

**Files and projects**

- Opens a root `.ink` file plus everything it `INCLUDE`s, resolving paths relative to the root file's
  directory the way inklecate does, at any nesting depth.
- Native **Open** dialog, a recent-projects list, and a `?root=` URL parameter in the browser dev
  server.
- Save with Ctrl+S, or autosave (off by default). Writes are atomic and hash-guarded: if a file changed
  on disk since it was loaded, the save is refused and a banner offers reload or overwrite.
- **Live reload** when files change on disk — edits made in Inky, VS Code or by git are picked up
  immediately; a dirty file shows a keep-mine / reload banner instead of being overwritten.
- Node positions, sizes, viewport, collapsed flags, reroute waypoints and file colours persist in a
  sidecar `<root>.inkvisual.json`. Ink files are never touched by layout changes.
- A diagnostics list from the real inkjs parser — errors, warnings and `TODO:` lines — that jumps to
  the knot and line, plus knot search that flies the canvas to its result.
- A list of `.ink` files in the project tree that the root does not reach, with one click to include
  them.

**Themes and shell**

- An Inky-like dark theme (default) and a light theme, applied to the canvas, the editor and React
  Flow's own controls.
- A collapsible file panel and a draggable editor/canvas divider, both remembered across sessions.
- **Desktop builds** via Electron and electron-builder: a Windows NSIS installer and portable exe, and
  Linux AppImage and `.deb` packages, released from CI. The desktop app serves the renderer over a
  privileged `app://inkvisual/` scheme rather than a localhost port, so the origin is stable and
  remembered settings survive a restart, and it uses the OS-native file dialog on every platform.

**Developer tooling**

- `npm run dump -- <root.ink>` prints a project's nodes, edges and diagnostics without the UI.
- Vitest coverage of the pure model — splitter round-trip, ink parsing, graph derivation, edit
  operations, layout, the preview scanner against the whole example corpus, the undo stack — plus the
  pure wire-routing, editor-link and theme helpers.
- Two example projects (`examples/saving-tortuga`, `examples/tech-demo`) and two test fixture projects
  (`tests/fixtures/`).
- Both examples are walked 200 times with a seeded random player on every test run, so neither can ship
  a dead end. (An exhausted ink choice set does not fall through to its gather, so a knot that is
  re-entered can run out of content mid-scene; several such dead ends were fixed before this release.)

### Known limitations

- There is no rename refactor yet: renaming a knot in the editor keeps its position, but references to
  the old name elsewhere become missing-target stubs until you update them.
- There is no context menu, and no way to move a knot to another file from inside the app.
- The docked editor shows one knot at a time and is a fixed-width panel with a draggable divider, not a
  full split view.
- The browser dev server's Open dialog is Windows-only; other platforms type the path or use `?root=`.
  The packaged desktop app has a native dialog everywhere.
- There are no automated tests for the store or the React components.

[Unreleased]: https://github.com/ifishbw/Ink-Visual-Editor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ifishbw/Ink-Visual-Editor/releases/tag/v0.1.0
