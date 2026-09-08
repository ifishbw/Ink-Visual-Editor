# InkVisual User Guide

InkVisual shows an ink project as a map. Each knot is a card; each divert between knots is a wire. You edit
the raw ink in a panel beside the map, and you can run the story without leaving the app.

This guide assumes you already write ink. It does not teach the language — [inkle's ink
guide](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md) does that. If you have not
installed InkVisual yet, start with [INSTALL.md](INSTALL.md).

**Contents**

- [Opening a project](#opening-a-project)
- [The layout of the window](#the-layout-of-the-window)
- [Reading the canvas](#reading-the-canvas)
- [Editing ink](#editing-ink)
- [Structural editing](#structural-editing)
- [Undo and redo](#undo-and-redo)
- [Play mode](#play-mode)
- [Themes](#themes)
- [Working alongside Inky, VS Code and git](#working-alongside-inky-vs-code-and-git)
- [Keyboard shortcuts](#keyboard-shortcuts)

---

## Opening a project

Click **Open ink file…** at the top of the left-hand panel and choose a file. A file dialog opens; pick the
**root** `.ink` file.

### What "the root file" means

An ink project is one script that pulls in others with `INCLUDE`. The root file is the one you would hand to
`inklecate` or open in Inky — the one that contains the story's opening text and the `INCLUDE` lines. In the
bundled tech demo that is `main.ink`, not one of the chapter files.

InkVisual reads the root, follows every `INCLUDE` it finds, then follows the `INCLUDE`s in those files, and so
on. It builds one graph from all of them; knot names are a single global namespace across the whole project,
exactly as in ink.

**Include paths resolve relative to the root file's folder**, not to the folder of the file doing the
including. That matches `inklecate` and Inky. So a file at `nested/deeper/level2.ink` that wants its
neighbour writes `INCLUDE nested/deeper/deepest/level3.ink`, not `INCLUDE deepest/level3.ink`.

If you open a chapter file by mistake you will see only that chapter's knots, and probably a lot of red
"missing target" stubs for everything it diverts to. Open the root instead.

### The path box and recent projects

Under the Open button there is a text box — type or paste a path to a `.ink` file and press **Go**. Useful
when you already know the path.

Once you have opened a project it appears in the **Recent…** dropdown next to the Open button. InkVisual also
reopens the last project you had open when it starts.

Under those, once a project is loaded, a line reports how many knots and edges it found and whether the layout
sidecar is saved.

---

## The layout of the window

Four columns, left to right:

1. **The file panel.** Open/recent projects, saving, the file list, buttons for new knots and files, the knot
   search box, and the diagnostics list. Collapse it with the **‹** button in its title bar; it shrinks to a
   `files ›` strip you can click to bring it back.
2. **The canvas.** The graph, with React Flow's zoom controls and a minimap in the corners.
3. **The ink editor** (the "dock"). Shows the selected knot's raw ink. Collapse it with **›**; it becomes a
   `‹ ink` strip. Drag its left edge to resize it.
4. **The play panel.** Hidden until you open it with the **Play** button in the file panel or the `▶ Play`
   strip on the right. Drag its left edge to resize it.

The file panel width, editor width, editor font size and theme are remembered between sessions.

---

## Reading the canvas

This is the part worth learning. A card is not a screenshot of your ink — it is a diagram of it, with one
visual channel per fact.

### A card is a knot

One `=== knot ===` header, one card. The card's coloured strip at the top is its header.

Two other kinds of card exist:

- **Start** — the top-level content of your root file, before the first knot. This is where the story begins,
  so it gets its own card. An included file whose top-level content contains real code (declarations, text, a
  divert) also gets a card, labelled `path/to/file.ink (top level)`.
- **A red "missing" stub** — a knot that something diverts to but which does not exist. See below.

### The header strip

Left to right:

| Element | Meaning |
|---|---|
| `▾` / `▸` | Collapse or expand the card. Collapsed cards keep their wires. |
| The name | The knot's name. |
| Badges | See the table below. |
| The file name | Which `.ink` file this knot lives in. |
| `⤡` | Only appears on a card you have resized by hand: click to return it to its automatic size. |
| `×` | Delete this knot and its text (with a confirmation). |

Badges, in the order they appear:

| Badge | Meaning |
|---|---|
| `▶` | The playhead is here right now (play mode only). |
| `7/9` | Lines of this knot run in the current play session, out of its total. `—` if the knot has been edited since the run started. |
| `3×` | How many times this knot has been entered in the current play session. |
| `ƒ` | This is a function knot (`=== function name(args) ===`). |
| `2 st` | The knot has 2 stitches. Hover to see their names. |
| `END` | Something in this knot diverts to `END`. |
| `DONE` | Something in this knot diverts to `DONE`. |
| `↻2` | The knot diverts to itself, twice. |
| `→?` | The knot has a divert to a dynamic target — a variable holding a divert target, or a divert-typed parameter. Hover for the name. Wires cannot be drawn for these, because the destination is only known at runtime. |
| `⚠1` | Errors reported inside this knot. Click through from the Diagnostics list in the file panel to find them. |

### The colour of a card's header

Every `.ink` file in the project gets its own colour, assigned in order from a fixed palette. All the knots in
`chapters/03_flow.ink` share one hue. That is the whole meaning of the colour: **which file this knot lives
in**. The same colours are used for the dots in the search results list and for the cards in the minimap.

Missing-target stubs are always red.

### The card body: the structure preview

The body is a stack of thin rows, one per meaningful line of the knot (runs of consecutive prose merge into a
single row). It is deliberately abstract — it shows you the *shape* of a knot without you having to read it.

Four channels, four facts:

- **Vertical position is source order.** Row 1 is the line after the header, and so on down.
- **The left edge is weave depth.** A `*` choice nested inside another is drawn one step further right. Five
  levels of indent are shown; anything deeper is drawn at level five.
- **The marker on the left tells you the kind of line.**
- **Readable text is only ever names and divert targets, never prose.**

The markers:

| Marker | Row kind | What the line is |
|---|---|---|
| A small square | **choice** | A `*` or `+` choice, at any depth, including inside a `{...}` block. Its label is printed next to it. |
| A short horizontal dash | **gather** | A weave `-` gather. If it is named, `(name)`, the name is printed. |
| A tall vertical bar in the left column | **stitch** | A `= stitch_name` header — an addressable anchor inside the knot. The name is printed. |
| A small right-pointing triangle | **divert** | A line whose only job is flow: `-> target`, `->->`, `<- thread`. The target is printed. |
| No marker, just a bar | **prose** | Narrative text. |
| No marker, a thinner bar | **logic** | `~` lines, `VAR` / `CONST` / `LIST` / `EXTERNAL` / `INCLUDE`, `TODO`. |
| A pale bar | **cond** | The scaffolding of a multiline `{...}` block: its opening line, its `-` branches, its `- else:`, its closing `}`. |

Two more marks:

- **A round pip at the far left** means the line carries a condition, or is guarded by one — a `{...}` is
  involved.
- **A vertical rail down its own column** on the left means the row is *inside* a multiline `{...}` block. The
  rail is a separate column on purpose: brace nesting never adds indentation, because indentation already
  means weave depth.

### Prose bars

A prose row is drawn as a bar rather than as words. The bar's width steps through three lengths — short,
medium, long — depending on how many characters of text sit behind it. It is texture, not measurement: it
tells you "there is a wall of text here" versus "there is one line here" at a glance. Do not try to read
lengths off it.

### Rows that carry a destination

A choice that only jumps somewhere (`* [Go north] -> forest`) prints its destination on the same row — the
row for a bare `-> target` line following a choice is absorbed into the choice, so "go there" costs one row
rather than two.

A row that has *both* words of its own and a destination shows both: the label on the left, the `→ target` on
the right. When the card is too narrow the label gets truncated first, because "which choice is this" survives
truncation better than "where does it go".

### When labels disappear

If you squeeze a card very small — or a very long knot is drawn at its automatic size — the rows get thinner
until the text no longer fits, and the card falls back to bars alone. **Drag the card taller to get its labels
back.** Select it first; handles appear on every edge and corner.

### Wires

An edge is one divert. Not one per pair of knots — if a knot diverts to the same place three times, there are
three wires.

- **A wire leaves the card at the exact row that writes the divert**, and enters the target at the row of the
  stitch it names (`-> knot.stitch`), or at the target's header when it names the knot alone. That is why the
  cards' rows line up with the wires.
- **Solid, thick**: an ordinary divert.
- **Solid, thin**: a divert written inside a choice.
- **Long dashes, labelled `tunnel`**: a tunnel call, `-> knot ->`.
- **Fine dots, labelled `thread`**: a thread, `<- knot`.
- **Grey and dashed**: a quiet reference — a divert-typed argument, or the link from Start to an included
  file's top-level card.
- **Red and dashed**: it points at a knot that does not exist.
- A wire that arrives at a stitch is labelled with the written suffix, for example `.anatomy`.

### Missing targets

If your ink says `-> hidden_cave` and no such knot exists, InkVisual draws a red stub card named
`missing: hidden_cave` where the knot would be, with a red dashed wire pointing at it. That is a broken divert
made visible. Click **+ create** in its header and InkVisual writes a real knot with that name into your
project.

### Getting around

- Scroll to pan, `Ctrl`+scroll to zoom, or use the zoom controls in the bottom-left corner.
- The **minimap** in the bottom-right can be panned and zoomed.
- **Fit view** in the file panel frames the whole graph.
- **Find knot** in the file panel searches by name; click a result to fly to that card and select it.
- Clicking an entry in the **Diagnostics** list jumps to the knot and line the message is about.

The camera position is saved with your layout, so a project reopens where you left it.

---

## Editing ink

Click a card. Its raw ink appears in the editor on the right, with ink syntax highlighting.

**This is a single-knot dock, not a split view.** It shows one knot at a time — the selected one. You cannot
put two knots side by side in it. (That is a known limitation, not a hidden setting.)

Some things worth knowing:

- **Click a preview row on a card** to put the editor's cursor on that source line. This is the fastest way
  from "that choice looks wrong" to typing.
- **Divert targets in the editor are links.** Click the name in `-> forest` and the dock switches to that
  knot, the cursor lands on the line it points at (the stitch's line, if it named one), and the canvas flies
  over. A target inside the knot you are already looking at just moves the cursor. Clicking the rest of the
  line just places the cursor as usual.
  **Hold Alt and click to edit the name instead** of following it.
  Note that ink's highlighting underlines every name-like token, so variables can look like links; only real,
  resolvable targets change the pointer and tint on hover.
- **`A-` and `A+`** in the editor's header change the font size. It is remembered.
- **Tab indents** by four spaces. Wrapped lines keep their indentation, hanging under the line's text instead
  of resetting to column 0, so deep weaves stay readable.
- **Typing `=== name ===`** in the editor splits the knot in two, exactly as it would in any text editor. The
  new card appears on the canvas within a moment.

### Saving

`Ctrl+S`, or the **Save** button in the file panel, which shows how many files are unsaved. There is an
**autosave** checkbox next to it. A file with unsaved changes shows a `●` in the file list.

Saving writes back the exact bytes of your text. InkVisual does not reformat, re-indent, reorder or normalise
anything, and only files you actually changed are written.

### The disk-conflict banners

InkVisual remembers what each file looked like when it loaded it, and refuses to clobber someone else's work.

- **"`file.ink` changed on disk since you loaded it."** Your save was refused because the file moved under
  you. Choose **Overwrite disk** (your version wins) or **Discard mine** (reload the file from disk, losing
  your unsaved edits to it).
- **"`file.ink` changed on disk while you have unsaved edits."** Something else — Inky, git, an editor —
  wrote the file while you had unsaved changes to it. Choose **Keep mine** or **Reload from disk**. The same
  banner appears with "was deleted" if the file has gone.

If you have no unsaved edits to a file that changes on disk, InkVisual just reloads it silently and the graph
updates. That is the normal case.

---

## Structural editing

Everything here edits your actual ink or your layout sidecar. Nothing is hidden state.

### New knot

Double-click empty canvas, or click **New knot** in the file panel. Type a name (letters, digits and `_`).
The knot is created at that point on the canvas, in the file chosen by the **new knots go to** dropdown in the
file panel (visible once the project has more than one file).

A brand new knot is written with a `TODO: write <name>` line in it, because ink rejects a knot header with
nothing after it. That TODO shows up in the Diagnostics list until you replace it with real content.

### Connecting knots

Every card has a small round handle on its right edge, level with the header. Drag from there and drop
**anywhere on the target card**. InkVisual appends `-> target` to the source knot's ink — the wire exists because your ink now
says so. If you drop on empty canvas or on a reroute dot, a hint appears telling you where to drop.

### Deleting

Click `×` in a card's header, or select cards and press `Delete`. A confirmation appears listing the names;
it has a **Don't ask again** checkbox if you find it tiresome. Deleting a knot deletes its text from the file.

### Creating a missing target

Click **+ create** on a red stub. The knot is written into your project and a real card takes the stub's
place, positioned to the right of the knot that named it.

### New `.ink` file

**New file** in the file panel. Type a path relative to the project, such as `chapters/side.ink`. InkVisual
creates the file *and* inserts an `INCLUDE` for it into the root file, so it becomes part of the project
immediately.

The file panel also lists **Unused files** — `.ink` files sitting in the project folder that nothing
`INCLUDE`s. They are not part of the graph. If one should be, add an `INCLUDE` for it yourself.

### Hiding files

Click the `●` / `○` button on a file's row in the file panel to hide or show all the knots from that file.
Useful for a big project when you only want to see one chapter. Hiding is a view filter — it changes nothing
on disk and nothing about the story.

The **show functions** checkbox does the same for function knots.

### Collapsing and resizing cards

- `▾` in a card's header collapses it to just the header strip. Wires stay attached.
- Select a card and drag any edge or corner to resize it. A hand-set size is remembered. On a long knot,
  dragging it taller is how you get its row labels back. `⤡` in the header returns it to the automatic size.

### Reroute dots

Double-click a wire to drop a reroute dot on it, then drag the dot. The wire routes through it, which is how
you keep a long backwards divert from crossing half the graph. Select a dot and press `Delete` to remove it.

Reroute dots are shared by every wire that runs from one knot to the same arrival point on another, so a
bundle of diverts takes one tidy detour. They are purely visual and are never written into your ink.

### Auto layout

**Auto layout** in the file panel arranges the graph automatically (a left-to-right dagre layout). It moves
every card, so it is a big change — but it is undoable.

Cards that have never been positioned are placed automatically anyway when a project opens, so a project that
has never been opened in InkVisual still comes up as a readable graph.

---

## Undo and redo

`Ctrl+Z` undoes; `Ctrl+Shift+Z` or `Ctrl+Y` redoes. (`Cmd` works too.) There are also `↶` and `↷` buttons in
the editor's header, and hovering them tells you what the next undo or redo will do.

**One stack covers everything that changes your document**: typing in the editor, creating and deleting knots,
connecting knots, moving and resizing cards, collapsing them, adding and removing reroute dots, and auto
layout. Typing coalesces, so you undo a phrase rather than a keystroke.

**Not undoable:** panning and zooming, selecting things, switching theme, hiding a file, resizing the panels,
and saving. Those are not changes to your story.

Two more things to know:

- **The history is session-only.** Opening another project clears it, and so does closing the app.
- Undo after a save re-marks the file as unsaved, as you would expect. Undoing back to exactly what is on disk
  clears the unsaved marker again. If the project is reloaded from disk because something changed externally,
  the undo history is cleared and the file panel says so.

---

## Play mode

Open the player with the **Play** button in the file panel, or the `▶ Play` strip on the right-hand edge.
It runs your story with the ink runtime, using **the text currently in the editor**, saved or not.

### Running

| Control | Does |
|---|---|
| `▶ Run` | Start (or restart) from the current start point. `Ctrl+Enter`. |
| `⟲` | Restart. |
| `⏭` | Step one line. `Alt+→`, or plain `→` when you are not typing. |
| `⏴` | Step *backwards* one line. `Alt+Backspace`, or plain `Backspace` when not typing. `Shift+Backspace` goes back a whole turn. |
| `⤓` | Run to the cursor — runs until execution reaches the line the editor's cursor is on. Requires a cursor; click a preview row or click into the editor first. |
| The dropdown | Where to start: **Story start**, or any knot in the project. Function knots are listed but cannot be run. |
| `✕` | Hide the player. |

`Ctrl+Shift+Enter` runs from the knot currently selected on the canvas. `Escape` stops a run.

Story text appears in the transcript with turn separators. Tags are shown next to the line that emitted them.
Lines carry a small `file:line` badge where InkVisual can map them back to your source — click it to jump to
that line in the editor. Choices
appear as buttons at the bottom; click one, or press its number (`1`–`9`), or press `Enter` or `Space` to take
the first one.

### Watching the story run

While a story runs, the graph is painted:

- The card holding the playhead is highlighted and its current row is marked with `▶`.
- Wires light up as they are taken.
- Each card's header shows a visit count and how many of its lines have run this session.
- With **dim unvisited** ticked, rows you have not reached are dimmed, so unexplored branches are obvious.
- With **follow camera** ticked, the canvas scrolls to keep the playhead on screen. With **follow editor**
  ticked, the docked editor follows it too.

### Breakpoints

- **Alt+click a preview row** on a card to arm or disarm a breakpoint on that line.
- Or put the cursor on a line in the editor and click **+ add from cursor** in the **Breakpoints** drawer.

The drawer lists every breakpoint; click one to reveal its knot, or `×` to remove it. A breakpoint on a line
that has moved since the run started is marked `(moved)` — restart to re-anchor it.

### Variables

The **Variables** drawer lists every global variable with its current value, and a filter box. Values update
live as the story runs, and a changed value is flagged with its delta.

- **Type a new value** into a variable's field and press Enter to set it mid-run.
- **Click the flag** next to a variable to break whenever it changes.
- `LIST` values and divert-target variables are shown but marked `(locked)` — they cannot be edited here.
- `CONST`s do not appear: they are compile-time literals, not runtime state.

### Coverage

The **Coverage** drawer reports how many knots you have entered and what fraction of lines you have run this
session, and lists every knot you have never visited — click one to reveal it on the canvas. Coverage is for
the session and does not rewind when you step backwards: it means "what this session has explored".

### Editing while playing

You can keep editing. The player notices, tells you which knot has changed, and offers a restart to resync.
A knot edited mid-run shows its coverage as `—` until you restart. The player also records the choices you
made, so `⟳ Replay` recompiles and walks the same path again — and says so if the story has changed enough
that the path no longer exists.

If your project declares `EXTERNAL` functions with nothing bound to them, the player stubs them with a number
you can edit in the notes area, rather than refusing to run.

---

## Themes

The **Dark** / **Light** button in the file panel's title bar switches theme. Dark is the default and is tuned
to sit alongside Inky. The canvas, the cards and the ink editor's syntax colours all follow. The choice is
remembered.

---

## Working alongside Inky, VS Code and git

InkVisual has no project format of its own and takes no lock on your files. Keep Inky open on the same project
if you like.

- **External edits reload live.** InkVisual watches your project folder. Save in Inky, switch branches in git,
  run a script over your files — the graph updates. If a file you had unsaved edits in changes underneath you,
  you get the banner described in [Saving](#saving) and decide what happens.
- **Your ink is never regenerated.** InkVisual does not rebuild ink from a model of your story. It holds each
  file as an ordered list of text slices — one per knot — and saving joins them back together. Editing a knot
  replaces exactly one slice. Whitespace, comment style, and anything InkVisual does not understand come back
  out exactly as they went in.

### The `.inkvisual.json` sidecar

Next to your root script, InkVisual keeps a small JSON file named after it: `main.ink` gets
`main.inkvisual.json`.

It holds **only layout**: each node's position, any hand-set size, the collapsed flag, the saved camera
position, per-file colour overrides, and reroute dot positions. Nodes are keyed by knot name. No prose, no
story state, no settings that affect what your story does.

**Should you commit it to git?** Yes. It is your map, it is small and text-based, and without it everyone who
opens the project gets a fresh automatic layout instead of the one you arranged. It does churn when you move
things around, which makes for noisy diffs on a shared project — if that bothers your team more than losing
the layout would, `.gitignore` it and accept auto-layout.

**What if you delete it?** Nothing is lost from your story. InkVisual lays every knot out automatically the
next time you open the project, and starts a new sidecar as soon as you move anything.

Files InkVisual will read or write are limited to `.ink` and `.inkvisual.json` files inside the project
folder you opened. It touches nothing else.

---

## Keyboard shortcuts

On macOS, `Cmd` works wherever `Ctrl` is listed.

### Anywhere

| Shortcut | Does |
|---|---|
| `Ctrl+S` | Save all changed files. |
| `Ctrl+Z` | Undo. |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo. |
| `Ctrl+Enter` | Run the story, or restart it if it is already running. |
| `Ctrl+Shift+Enter` | Run from the knot selected on the canvas (or from the story start if none is selected). |

### On the canvas

| Shortcut | Does |
|---|---|
| `Delete` | Delete the selected knots (with confirmation) and reroute dots. |
| Double-click empty canvas | New knot here. |
| Double-click a wire | Add a reroute dot. |
| Click a preview row | Put the editor cursor on that line. |
| `Alt`+click a preview row | Toggle a breakpoint on that line. |
| Drag from a card's header handle | Add a divert to the card you drop on. |

### In the ink editor

| Shortcut | Does |
|---|---|
| `Tab` | Indent four spaces. |
| Click a divert target | Follow it: switch knot, move the cursor, fly the camera. |
| `Alt`+click a divert target | Put the cursor in the name to edit it, instead of following it. |

### While the story is playing

Plain keys work when the focus is not in the editor or a text field; the `Alt` versions work anywhere.

| Shortcut | Does |
|---|---|
| `1` – `9` (or `Alt+1` – `Alt+9`) | Take that numbered choice. |
| `Enter` or `Space` | Take the first choice, or step if there are none. |
| `→` (or `Alt+→`) | Step one line. |
| `Backspace` (or `Alt+Backspace`) | Step back one line. |
| `Shift+Backspace` | Step back one turn. |
| `Escape` | Stop the run. |

---

Problems? See the [FAQ](FAQ.md).
