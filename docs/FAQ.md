# FAQ and troubleshooting

If your problem is not here, open an issue at
[github.com/ifishbw/Ink-Visual-Editor/issues](https://github.com/ifishbw/Ink-Visual-Editor/issues).

---

## Opening a project

### I opened a file and nothing appeared

Three usual causes, in order of likelihood.

**1. You opened a chapter, not the root file.** InkVisual builds the project by starting at the file you open
and following its `INCLUDE` lines. If you open `chapters/03_flow.ink`, you get that file's knots and nothing
else. Open the file that contains the story's opening text and the `INCLUDE` list — `main.ink` in the tech
demo.

**2. The file has a syntax error near the top.** Look at the **Diagnostics** section at the bottom of the file
panel. Every error the ink parser reported is listed there with its file and line; click one to jump to it.
InkVisual keeps drawing knots even when the parser fails, so you usually still see cards — but wires can be
missing, because wires come from the parser.

**3. The project genuinely has no knots** — the whole story is in the root file's top level. In that case you
should see a single card named **Start**. If you see only that, that is correct.

If the file panel shows a red error line instead, it is telling you what went wrong — a path that does not
exist, or a file InkVisual is not allowed to read (it only reads `.ink` and `.inkvisual.json` files inside the
folder you opened).

### The file list shows "includes missing file …"

An `INCLUDE` names a file that is not there. Remember that **include paths resolve relative to the root file's
folder**, not to the folder of the file doing the including. A file at `nested/deeper/level2.ink` that wants a
neighbour must write `INCLUDE nested/deeper/deepest/level3.ink`, not `INCLUDE deepest/level3.ink`. That is how
`inklecate` and Inky behave too; InkVisual is just showing you the same failure earlier.

### There are `.ink` files in my folder that don't show up

They are listed under **Unused files** in the file panel. Nothing in the project `INCLUDE`s them, so they are
not part of the story. Add an `INCLUDE` for one if it should be.

### The file dialog didn't open

Use the path box under the Open button instead: type or paste the full path to the root `.ink` file and press
**Go**. If the dialog is failing consistently, that is a bug worth reporting — say which OS and desktop
environment you use.

---

## Things on the canvas

### There is a red card called "missing: something"

Something in your ink diverts to a knot that does not exist. Usually a typo, or a knot you have not written
yet. The red dashed wire shows you which knot names it and which line.

Two fixes: correct the name in the editor, or click **+ create** in the red card's header and InkVisual writes
the knot for you.

### A card has a `⚠` badge

The ink parser reported errors inside that knot. Open the **Diagnostics** list in the file panel and click the
matching entry to jump to the line.

### The Diagnostics list says "Semantic checks skipped"

The full message reads roughly: *"Semantic checks skipped: inkjs failed (…). Known trigger: a `CONST` whose
value is a divert target."*

This is a bug in inkjs, the JavaScript ink parser InkVisual uses. When a project contains a `CONST` holding a
divert target, for example:

```ink
CONST START_POINT = -> hub
```

inkjs throws while running its reference-resolution pass. InkVisual catches that and carries on — your graph
and all your knots are fine — but that pass is also where **undefined-target errors** are found. So while the
warning is showing, InkVisual cannot tell you about broken diverts in that project, and red "missing" stubs
may not appear.

**The fix is one character:** change the `CONST` to a `VAR`.

```ink
VAR start_point = -> hub
```

That is legal ink, does the same job in practice, and restores the checks. (`inklecate` itself does not have
this problem, so a `CONST` divert target still compiles fine — it is only the JavaScript parser that trips.)

### A knot shows `→?` and its divert has no wire

That knot diverts to a target that is only known at runtime — a variable holding a divert target, or a
divert-typed parameter such as `=== travel(-> dest, place) ===`. There is no fixed destination to draw a wire
to. The badge tells you the divert exists; hover it for the name.

### My card's labels vanished and it is all bars

The card is too short for the text to fit, so the rows collapsed to bars. Select the card and drag its bottom
edge down. `⤡` in the header puts it back to the automatic size.

### The graph is a mess

Click **Auto layout** in the file panel. It arranges everything left to right. It is one undo (`Ctrl+Z`) away
if you hate the result.

For a long backwards divert that crosses the whole graph, double-click the wire to drop a reroute dot and drag
it out of the way.

---

## Editing and saving

### External edits are not showing up

InkVisual watches the project folder and reloads when files change. If a change is not appearing:

- **Did the other program actually save?** Inky in particular can hold unsaved changes.
- **Is the file part of this project?** Only files reached from the root through `INCLUDE` are watched.
- **Do you have unsaved edits to that same file?** Then InkVisual will not overwrite your work silently — it
  shows a banner in the file panel asking whether to keep yours or reload from disk. Answer the banner.
- **Is the file outside the project folder?** InkVisual only reads inside the folder you opened.

Reopening the project from the **Recent…** dropdown always forces a clean reload.

### "changed on disk since you loaded it" — what do I do?

Your save was refused because the file on disk is not the file InkVisual loaded. Something else wrote it while
you were working.

- **Overwrite disk** — your version wins, the other change is lost.
- **Discard mine** — reload from disk, losing your unsaved edits to that file.

If you are unsure which is which, copy your knot's text out of the editor first, then reload from disk and
compare.

### Does InkVisual change my ink?

Only when you tell it to, and only where you told it to.

It never regenerates ink from an internal model. Each file is held as an ordered list of text slices, one per
knot, and saving joins them back together byte for byte. Editing a knot replaces exactly that knot's slice.
Your indentation, comment style, blank lines, tags and anything else stay untouched.

The actions that write ink are: typing in the editor, creating a knot, deleting a knot, dragging a connection
between two cards (which appends a `-> target` line), creating a knot from a red stub, and creating a new
`.ink` file (which also inserts the `INCLUDE` in the root). Moving cards around does not touch your ink at
all — that goes in the sidecar.

### Where does the layout live, and can I delete it?

In a file next to your root script, named after it: `main.ink` gets `main.inkvisual.json`. It holds node
positions, hand-set sizes, collapsed flags, the camera, per-file colour overrides and reroute dot positions —
nothing about your story.

You can delete it safely. The next time you open the project InkVisual lays everything out automatically and
starts a new one. You lose your arrangement, nothing else.

Commit it to git if you want your team to share the map. It is small and human-readable. The only reason not
to is diff noise when several people rearrange the graph.

### Undo did not undo what I expected

The undo stack covers changes to your document: typing, creating, deleting, connecting, moving, resizing,
collapsing, reroute dots, auto layout. It does **not** cover panning and zooming, selection, theme, hiding a
file, panel widths, or saving.

It is also session-only: it is cleared when you open another project, when the project is reloaded from disk
because something changed externally, and when you close the app.

---

## Play mode

### The player says it can't run

Read the note it shows. The two common ones:

- **"N errors — can't run"** with the first message. Your ink does not compile. Fix the error; the
  Diagnostics list has all of them.
- **"can't run: unbound EXTERNAL …"** — your story calls an `EXTERNAL` function that the game engine would
  normally provide. InkVisual stubs external functions with a number you can edit, but some cannot be stubbed
  automatically.

### Coverage looks wrong after I edited something

Coverage for a knot you edited mid-run shows `—` until you restart, because the line numbers it was recorded
against have moved. Restart the run to re-anchor it. The same is true of breakpoints, which are marked
`(moved)` in the Breakpoints drawer.

Coverage is also per-session and does not rewind when you step backwards — it means "what this session has
explored", not "where the playhead has been since the last rewind".

### A variable is shown as "(locked)"

`LIST` values and variables holding divert targets cannot be edited from the Variables drawer. Play from a
point where the story sets them instead.

`CONST`s do not appear in the list at all: they are compile-time literals, not runtime state.

---

## Installing and running

### Windows says "Windows protected your PC"

Expected. The builds are not code-signed, and SmartScreen shows that box for any unsigned program it has not
seen often. Click **More info**, then **Run anyway**. Full walkthrough in [INSTALL.md](INSTALL.md#windows).

### The AppImage will not start

Almost always the missing FUSE 2 library. Either run it without FUSE:

```sh
./InkVisual-*.AppImage --appimage-extract-and-run
```

or install the library (`sudo apt install libfuse2`, or `libfuse2t64` on Ubuntu 24.04; `sudo dnf install
fuse-libs` on Fedora).

Also check you made it executable: `chmod +x InkVisual-*.AppImage`.

### Is there a macOS build?

Not yet. Nothing is published for macOS. A Mac user comfortable with a terminal can build from source — see
[CONTRIBUTING.md](../CONTRIBUTING.md) — but that path is untested and unsigned.

---

## About the app

### Does this replace Inky?

No, and it is not trying to. Inky is a good writing environment with a compiler and a player built in.
InkVisual is a map: it is for seeing the shape of a project, finding the knot you meant, spotting the branch
you never wired up, and debugging flow.

They read and write the same `.ink` files with no lock and no project format, so you can run both at once —
edit prose in Inky, arrange structure in InkVisual, and each picks up the other's saves.

### How big a project can it handle?

The whole project is parsed on a short delay after every edit, and every visible knot is drawn as a card, so
very large projects will feel it. If yours does:

- **Hide files you are not working on** with the `●` toggle in the file panel — hidden knots are not drawn.
- **Untick "show functions"** if you have a lot of function knots.
- **Collapse cards** you only need as landmarks.

There is no hard limit and no paging; performance work for very large projects is a known future task.

### What does it store outside my project folder?

Only interface preferences: the last project you opened, the recent-projects list, the theme, the panel widths
and the editor font size. Your story, and everything about its layout, lives in your project folder.
