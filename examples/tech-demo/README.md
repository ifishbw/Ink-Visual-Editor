# Ink Syntax Tech Demo

A playable tour of ink's features, written as a real multi-file project.

**Open `main.ink`.** That is the project root — the file with the `INCLUDE` list and the story's opening text.
Opening a chapter file instead gives you that chapter's knots on their own, and red "missing target" stubs for
everything it diverts to.

## What it is

The story is a hub with nine chapters. Each chapter explains one part of ink's syntax, demonstrates it live,
and hands you back to the hub. Every chapter file begins with a comment block listing the literal syntax it
covers, so the files double as a cheat sheet.

```
main.ink            the root: tags, INCLUDE list, story-start prose, the hub knot
globals.ink         VAR / CONST / LIST declarations for the whole project
chapters/
  01_structure.ink  knots, stitches, labels
  02_choices.ink    once-only and sticky choices, choice-only text, weaves and gathers
  03_flow.ink       diverts, tunnels, threads, DONE / END, divert-target variables
  04_logic.ink      variables, temps, conditionals, switches
  05_alternatives.ink  sequences, cycles, once-only, shuffle
  06_lists.ink      LIST values, membership, and the LIST_ functions
  07_functions.ink  functions, parameters, ref, divert-typed parameters, EXTERNAL
  08_text.ink       glue, tags, comments, TODO
nested/
  level1.ink              -> nested/deeper/level2.ink
    deeper/level2.ink       -> deepest/level3.ink and deepest/no-ext.ink
      deepest/level3.ink
      deepest/no-ext.ink
```

Fourteen `.ink` files in all. It is deliberately more scattered than a project this size needs to be.

## What to look at in the graph

**The hub is the shape of the story.** Find the card named `hub`. Its body is a stack of choice rows, and each
one has a `→ doc_…` on the right. Those are the nine chapters. The wires leaving it are drawn with long
dashes and labelled `tunnel`, because the hub calls each chapter with `-> doc_structure -> menu` rather than
jumping to it — the chapter runs, then flow returns and continues at the gather named `menu`. That is a tunnel,
and it is the difference between a chapter and a dead end.

**Colours are files.** Every `.ink` file gets its own hue, and every card from that file wears it. Look at the
graph zoomed out: the chapters group themselves by colour without anyone arranging them. That is the whole
meaning of the colour — not chapter, not depth, just "which file is this knot in".

**Cards for the top of a file.** `main.ink`'s content before the first knot becomes a card called **Start** —
the story really does begin there. `globals.ink` has no knots at all, only declarations, so it appears as a
single card labelled `globals.ink (top level)` full of thin "logic" rows: that is what a file of `VAR`, `CONST`
and `LIST` lines looks like as a diagram.

**Stitches inside a card.** Open `doc_structure` (from `chapters/01_structure.ink`). Its header badge says
`2 st`, and inside the body two rows are drawn with a tall bar in the left column: the stitches `anatomy` and
`labelled`. Wires from elsewhere that write `-> doc_structure.anatomy` land on that exact row, not on the
card's header.

**Nested INCLUDEs.** Follow the chain: `main.ink` includes `nested/level1.ink`, which includes
`nested/deeper/level2.ink`, which includes both files in `nested/deeper/deepest/`. Four files, three hops, and
four different colours on the graph — but one flat namespace, so `nested_no_ext` can be diverted to by name
from anywhere.

The interesting detail is in the source: **every one of those `INCLUDE` lines is written relative to
`main.ink`'s folder**, not to the file doing the including. `nested/deeper/level2.ink` writes
`INCLUDE nested/deeper/deepest/level3.ink`. That is how `inklecate` and Inky resolve includes, and how
InkVisual resolves them. If you have ever had an include work in one project and not another, this is usually
why.

(`no-ext.ink` is named for a test of extension-less includes; it keeps the `.ink` suffix in the end, because
Inky only copies `.ink` files into its compile sandbox.)

**Tunnels and threads side by side.** `doc_flow` in `chapters/03_flow.ink` demonstrates both, and the graph
draws them differently: a tunnel is a long-dashed wire labelled `tunnel`, a thread (`<- util_thread`) is a
fine-dotted wire labelled `thread`. `util_tunnel`, `util_thread` and `util_landing` are the small knots it
calls.

**Function knots.** `chapters/07_functions.ink` holds six of them, each with an `ƒ` badge. Untick **show
functions** in the file panel to take them out of the graph and see how much smaller the story gets. The knot
`travel(-> dest, place)` takes a divert-typed parameter, so its jump has no fixed destination — its card
carries a `→?` badge instead of a wire, because the target is only known at runtime.

## Playing it

Open the player (**Play**, or `Ctrl+Enter`) and run from the story start. Each chapter is a tunnel, so you can
take one, come back, and take another without restarting.

Two things worth doing with it running:

- Tick **dim unvisited**. Chapters you have not opened stay dark, so the graph becomes a map of what you have
  and have not read.
- Use the start-point dropdown in the player's toolbar to launch straight into `doc_lists` or `doc_logic`.
  That is how you test one branch of a large story without playing through to it.

`07_functions.ink` declares `EXTERNAL play_sound(name)` with an ink fallback of the same name, so the demo runs
without a game engine attached.
