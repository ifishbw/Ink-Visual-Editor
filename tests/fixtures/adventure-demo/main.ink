// Adventure demo — a tiny parser-fiction parody.
// Open the mailbox, GET LAMP, bribe a troll, get lost on purpose.
// Split across files the way a real ink story is, not as a feature checklist.

INCLUDE house.ink
INCLUDE dungeon.ink
INCLUDE endings.ink

LIST Stuff = leaflet, lantern, sandwich, bottle, rope, coins, trophy
VAR Inventory = ()

LIST Lamp = (unlit), lit, snuffed
VAR here = "field"

LIST Facts = mailbox_opened, paid_troll, kicked_mailbox, dragon_met

CONST TROLL_TOLL = 3
CONST MAX_SCORE = 10
CONST GRUE_WARNING = "It is pitch black. You are likely to be eaten by a grue."

VAR gold = 0
VAR score = 0
VAR dragon_hue = "red"
VAR preferred_ending = -> ending_hero

~ SEED_RANDOM(1977)

You are standing in an open field west of a white house. # location: field
A small mailbox stands here, trying to look significant.
-> house

=== function has(item)
    ~ return Inventory ? item

=== function take(item)
    ~ Inventory += item
    ~ score++
    Taken.

=== function pay(ref wallet, amount)
    ~ wallet -= amount

=== function came_from(-> x)
    ~ return TURNS_SINCE(x) == 0

=== function lamp_looks()
    { Lamp:
    - unlit:
        ~ return "dark"
    - lit:
        ~ return "glowing"
    - else:
        ~ return "dead"
    }

=== function points_left()
    ~ return MAX_SCORE - score

=== verbs(-> back)
+ [LOOK]
    -> glance -> back
+ [INVENTORY]
    { LIST_COUNT(Inventory) == 0:
        You are empty-handed. A classic.
    - else:
        You are carrying: {Inventory}. {has(lantern): The lantern is {lamp_looks()}.}
    }
    { gold > 0: Gold: {gold}.}
    -> back
+ [SCORE]
    Adventure points: {score} / {MAX_SCORE}. Turns: {TURNS()}. <>
    {points_left() > 0: You could still grab {points_left()} more.|A perfect run. The narrator is obliged to clap.}
    -> back
+ [QUIT]
    -> ending_quit
-> DONE

=== glance
{
- here == "field":
    White house. Mailbox. Grass. The whole genre in one screenshot.
- here == "kitchen":
    A table, a lantern{has(lantern): hook with nothing on it|, still on its hook}, and crumbs with a sense of history.
- here == "attic":
    Dust, a coil of rope, and a note that just says TODO.
- here == "cafe":
    Espresso machines in a colonial farmhouse. History has left the building.
- here == "cellar":
    { Lamp == lit: Damp stone, now photogenic. | {GRUE_WARNING} }
- here == "cave":
    A troll bridge. Very OSHA.
- here == "maze":
    Twisty. Little. Passages. You know the rest.
- here == "lair":
    Gold, bones, and a union notice on fireproof paper.
- else:
    You look at the looking.
}
->->

=== light_the_lantern
~ Lamp = lit
~ score++
The lantern coughs, then glows. Moths form a support group.
->->

=== parser_scold
The story clears its throat.
"There is no parser. This is a choice game. 'GET LAMP' is not a sentence you type. It is a button."
->->
