# Saving Tortuga

A branching pirate story in a single 795-line file. **Open `SavingTortugaRework.ink`.**

You are a deacon sent to Havton to meet Jon, who has gone to the pirate fort of Tortuga on a mission from an
angel. Jon is missing. You investigate the town, take a ship, and end up choosing a side.

This is a rework of an existing story, and its own header comment says what changed:

- **Tunnels.** Conversations and minigames end with `->->` so the caller decides where the player comes back
  to. They are entered with `-> knot ->`.
- **Nested tunnels.** The priest's topics are tunnels inside the priest conversation, which is itself a tunnel
  from the town square.
- **Shared knots.** Both sea voyages spend a day the same way — gamble, chat, be bored — through one
  parameterised knot rather than two copies.
- **`LIST`s.** Two lists, `Inventory` and `Intel`, replace what used to be a pile of booleans.

The player-facing prose is the original's, spelling and all. One logic fix was made: `murdered` starts
`false`, so the hill ending can actually branch.

## What to look at in the graph

**Fifty-odd knots in one file, so one colour.** With a single `.ink` file, the file colour-coding has nothing
to distinguish, and the graph is carried entirely by shape and position. That is the opposite of the
[tech demo](../tech-demo/README.md), and it is worth seeing both.

**The hub-and-spoke pattern of a tunnel.** Find `Town_Square`. Its body is five choice rows, and the wires
leaving it are drawn with long dashes and labelled `tunnel`:

```ink
+ {not knows(prisoner_freed)} [Talk to prisoner]
    -> prisoner -> Town_Square
```

That reads "run the `prisoner` knot, then come back and continue at `Town_Square`". A tunnel is why the
conversation knots each have a wire in *and* a wire back, and why the square does not need a separate return
divert per topic. Compare `Outside_Inn`, which tunnels into the tiny `wait` knot — three lines and a `->->` —
just to say "some time passes".

**Nested tunnels.** `priest` is entered as a tunnel from `Town_Square`, and its own choices are tunnels again:
`-> ask_prisoner -> opts`, `-> provide_evi ->`, `-> ask_for_key ->`, `-> steal_keys ->`. Some of those are
followed by `{has(stocks_key): ->->}` — return out of the priest conversation entirely if you got what you
came for, otherwise fall back to the gather `(opts)` and keep talking. That whole pattern is visible on the
card as a stack of choice rows at depth 1 with a gather above them.

Its first line is `-> first_meeting ->`: a tunnel whose whole job is "say the introduction, but only the first
time" — `first_meeting` guards its text with `{first_meeting == 1: ...}`, using its own visit count.

**Condition pips.** Most of the choices in `Town_Square`, `priest` and `YourBoat` are guarded — `{has(...)}`,
`{knows(...)}`, `{not ...}`. On the cards those rows carry a small round pip at their left edge. Scan a card
for pips and you are scanning for "what is gated here".

**Parameterised, shared knots.** `spend_a_day(on_pirate_ship)` and `bored_at_sea(on_pirate_ship)` are each
called from both voyages with a different argument, and branch on it internally. On the graph they show up as
knots with two wires arriving from opposite ends of the story — the visual signature of a shared subroutine,
and the reason the two voyages did not have to be written twice.

**Function knots.** `has`, `knows`, `take`, `learn`, `rolldie`, `placebet` and `die_symbol` carry an `ƒ` badge.
The first four are the `LIST` interface — `has(item)` is `Inventory ? item`, `take(item)` is
`Inventory += item` — which is why the rest of the story reads as English rather than as list arithmetic.
Untick **show functions** in the file panel to drop all seven and see the story's own shape.

**The minigame.** `crown_and_anchor(piratess)` is the longest knot in the project — a dice game with betting,
a real weave, and a lot of logic. On the canvas it is a tall card that is mostly bars: prose and `~` lines,
few choices. That is what "this knot is machinery, not branching" looks like at a glance. Drag it taller if
you want to read its labels.

**Where the story splits.** `morning` is the fork: `side_with_pirates` or `side_with_priest`, and from there
two separate voyages (`ship_with_pirates` / `holy_boat` → `sailing_holy`) that reconverge on Tortuga at
`hike_into_tortuga` and `tortuga`. Zoomed out, that hourglass is the whole plot.

**`TURNS_SINCE`.** The priest's later options are gated with
`{not has(stocks_key) && TURNS_SINCE(-> ask_prisoner) != -1}` — "only once you have raised the prisoner".
The `-> ask_prisoner` inside it is a divert *target*, not a jump; InkVisual draws it as a quiet grey dashed
wire rather than a flow wire, because nothing actually goes there.

## Playing it

Open the player and press `▶ Run`. It plays from the start with no setup.

Because so much of the story is gated on `Inventory` and `Intel`, this is a good project for the **Variables**
drawer: watch the two lists fill up as you investigate. They are shown as `(locked)` — list variables cannot be
typed into — so to reach a late branch, use the start-point dropdown in the player toolbar to launch straight
into `tortuga` or `pirate_lord` instead.

Tick **dim unvisited** and play once through. The branch you did not take stays dark, which is the quickest
honest answer to "how much of this story does one playthrough actually see".
