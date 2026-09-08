# Contributing to InkVisual

Thanks for taking a look. InkVisual is a graph-based editor and viewer for inkle's
[ink](https://github.com/inkle/ink) narrative language: every knot is a node on a canvas, every divert
is a wire, and the raw ink is edited in a docked CodeMirror panel beside the graph.

This document covers getting the app running, the shape of the codebase, and the handful of rules that
are not negotiable. Two more documents are worth your time before you write code:

- [`docs/dev/ARCHITECTURE.md`](docs/dev/ARCHITECTURE.md) — how the app is put together and why.
- [`docs/dev/PITFALLS.md`](docs/dev/PITFALLS.md) — every trap learned from a real bug, with its
  reasoning. **A pull request that touches the wire routing, the preview scanner or the history stack
  must read this first.** Those three areas have the highest ratio of "looks obviously wrong" to "is
  load-bearing", and the fastest way to reintroduce a fixed bug is to tidy one of them up.

## Prerequisites

- **Node.js 20 or newer** and npm. Nothing else — no Rust toolchain, no global CLI.
- On Linux, building the desktop installers additionally needs the usual `electron-builder` system
  packages; see [`docs/dev/RELEASING.md`](docs/dev/RELEASING.md).

## Getting set up

```bash
git clone https://github.com/ifishbw/Ink-Visual-Editor.git
cd Ink-Visual-Editor
npm install
```

## The dev loop

There are two ways to run the app. Use the browser one unless you are working on the desktop shell.

### `npm run dev` — in a browser (fastest)

Starts Vite with the file API mounted at `/api`, with hot module replacement. Open the URL it prints
with a `?root=` query parameter naming the root `.ink` file of the project you want to open — the path
is relative to the repo, or absolute:

```
http://localhost:5173/?root=examples/tech-demo/main.ink
```

Without `?root=` the app opens the last project you used (it remembers it in `localStorage`), and on a
truly fresh profile it opens nothing at all — so pass `?root=` the first time. The in-app
"Open ink file…" button works here too, but only on Windows: the browser cannot hand a file path to the
server, so the dialog runs server-side through PowerShell. Everywhere else, type the path or use
`?root=`.

Two things to know about HMR while you are developing: editing anything under `src/store/` or
`src/model/` triggers a **full page reload**, which discards unsaved ink edits in the running app; and
the app writes real files, so point it at `examples/` or a scratch project rather than something you
care about.

### `npm run dev:app` — in an Electron window

Starts the Vite dev server and an Electron window pointed at it. Slower to start, and you still get
HMR for the renderer, but changes to `electron/` need a restart. Use this when you are working on the
main process, the `app://inkvisual/` protocol handler, the native file dialog, or file watching.

### The rest of the scripts

```bash
npm test                                    # vitest, once
npm run test:watch                          # vitest, watching
npm run typecheck                           # tsc --noEmit
npm run dump -- examples/tech-demo/main.ink # print a project's nodes, edges and diagnostics, no UI
npm run build                               # typecheck + vite build + bundle the Electron main/preload
```

`npm run dump` is the quickest way to check what the model thinks of an ink file without opening
anything.

### Building installers

```bash
npm run dist:win      # NSIS installer + portable exe   (must run on Windows)
npm run dist:linux    # AppImage + .deb                 (must run on Linux)
```

**Linux targets need a Linux host** — electron-builder cannot cross-build them from Windows, and the
project does not try. CI builds both platforms on release; see
[`docs/dev/RELEASING.md`](docs/dev/RELEASING.md).

## The five principles

These are why the project is shaped the way it is. A change that breaks one of them will not be merged,
however convenient it is.

1. **The `.ink` files are the only source of truth.** Node positions and UI state live in a sidecar
   `*.inkvisual.json` next to the root file, never inside ink files. Ink has no metadata syntax beyond
   comments, and layout churn inside a `.ink` file poisons git diffs.

2. **Never regenerate ink from an AST.** A file is an ordered list of text segments — a preamble plus
   one per knot. Saving a file is `segments.map(s => s.text).join('')`, byte-exact. An edit replaces one
   segment's text and nothing else. Anything that would pretty-print, normalise or re-emit a user's ink
   is out.

3. **Two-tier parsing.** A small "splitter" (a header scan) decides what the nodes are and owns the
   text. The `inkjs` parser only supplies edges, stitches and diagnostics. The graph must never lose a
   node because the parser hit a syntax error — the author is typing, so the file is *usually* invalid.

4. **Small codebase, mainstream libraries.** Prefer copying a documented React Flow or CodeMirror
   pattern over inventing one. Pure model code in `src/model/` has no React imports and is unit tested
   with Vitest.

5. **The preview scanner is advisory.** `src/model/preview.ts` is a tolerant, regex-level scanner in the
   same tier as the splitter. It decides what a node *looks* like, never what the graph *is*: wire
   handles are placed through its `rowOf` map alone, and the authoritative divert set stays the inkjs
   parser's. A scanner mistake may mislabel a row; it must never move or lose a wire.

## Code style

- **TypeScript strict**, with `noUncheckedIndexedAccess` on. `npm run typecheck` must pass. Avoid `any`;
  where an untyped library shape genuinely forces a cast, narrow it to one named type at the boundary
  and comment why.
- **No React imports in `src/model/`.** That directory is pure TypeScript with no framework, no DOM and
  no inkjs runtime state, which is what makes it cheap to unit test. Pure helpers that a component
  needs may live beside it in `src/ui/` (`flow.ts`, `inkLinks.ts`, `inkTheme.ts` all do) as long as they
  stay pure and testable.
- **Every new pure model function gets a Vitest test.** Existing tests are the pattern to copy.
- **Comments explain *why*, not what.** The code says what it does. Write the comment when the obvious
  simplification is wrong, and say what breaks if someone makes it. Most comments in this codebase are
  one bug's worth of hard-won context; keep that voice.
- Keep functions and files small. If a change adds a lot of surface area, say so in the pull request
  and explain what it buys.

## Tests, fixtures and examples

- Tests live next to the code as `*.test.ts` (`src/model/splitter.test.ts`, `src/ui/flow.test.ts`, …)
  and run with `npm test`.
- **Test fixtures live in `tests/fixtures/`** — `demo/` (a small two-file project with a sidecar) and
  `adventure-demo/` (a multi-file project with a subdirectory). Fixtures exist to be parsed by tests;
  change one only when the test that reads it is changing too, and expect pinned counts to move.
- **`examples/` is user-facing** — `saving-tortuga/` and `tech-demo/`. People open these to see what the
  app does, and they are what a bug report will most often reference. They must stay openable and
  **error-free**: after any change that could affect parsing, open both in the app (or run
  `npm run dump -- examples/tech-demo/main.ink`) and confirm the diagnostics list is clean.

Some of the preview scanner's tests pin exact counts across the example corpus — the number of choices,
gathers, stitches, diverts and condition rows it produces. If your change moves one of those numbers,
that is not automatically a failure, but it means the classifier changed its mind about real ink.
Say so in the pull request and explain which cases moved and why the new answer is right.

## Pull requests

- One concern per pull request. Explain the *why* in the description; the diff shows the what.
- Run `npm test` and `npm run typecheck` before you push.
- If you touched anything the app writes to disk, confirm a real project still round-trips: open it,
  edit a knot, save, and check `git diff` on the `.ink` file shows only your edit.
- If you learned something the hard way, add it to `docs/dev/PITFALLS.md` with its reasoning. That file
  is the most valuable thing in this repository.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to
abide by it.

## Licence

InkVisual is MIT licensed. Contributions are accepted under the same licence.
