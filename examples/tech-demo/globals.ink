// Not a standalone story — open main.ink (the project root) in Inky.
// Shared state for the tech demo. These lines are not printed; they register
// names the rest of the project can read and write.
//
// VAR  — mutable. Numbers, bools, strings, lists, or divert targets.
// CONST — immutable. Prefer numbers and strings. (A CONST divert target is
//         legal ink, but some JS runtimes skip semantic checks if you use one.)
// LIST — an ordered set of named items. Parentheses mark the initial value;
//         `item = N` sets that item's integer value.

VAR score = 0
VAR flagged = false
VAR player_name = "reader"
VAR next_stop = -> hub

CONST MAX_SCORE = 99
CONST DEMO_TITLE = "Ink Syntax Tech Demo"

LIST weapons = sword, bow, staff, (fists)
LIST colors = (red), green, blue
LIST volume = quiet, (medium), loud
