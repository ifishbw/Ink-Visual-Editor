=== house ===
= field
~ here = "field"
{ house.field > 1: You are {&back in the field|still in the field|in the field, yes, still}. The house has not moved.}
<- verbs(-> field)
+ [Approach the house]
    The front door is unlocked. Of course it is. Locked doors are DLC.
    -> kitchen
+ [Inspect the mailbox]
    -> mailbox
+ [Wander the field]
    You {&amble|shuffle|mosey} through the grass. A bird judges you.
    { TURNS() > 8: The narrator checks its watch.}
    -> field

= mailbox
{ Facts ? mailbox_opened:
    -> opened
}
The mailbox has a tiny brass door and the energy of a retired butler.
* "Hello?"[] you try.
    "MAIL," it says, which is all it knows.
    ** "Any parcels?"
        "MAIL."
    ** "I'll just open you, then."
        It sighs, a tiny metal sigh.
    -- It flaps its little door, once, for emphasis.
* [Open it without asking]
    You flip the latch. The mailbox makes a note of your manners.
    ~ Facts += kicked_mailbox
    ~ preferred_ending = -> ending_petty
* [Kick the mailbox]
    It clangs in Morse code. You suspect the message is rude.
    ~ Facts += kicked_mailbox
    ~ preferred_ending = -> ending_petty
- (opened)
{ Facts ? mailbox_opened:
    The mailbox is empty, and smug about it.
- else:
    ~ Facts += mailbox_opened
    Inside: a leaflet, and two gold coins that have been waiting since 1977.
    ~ take(leaflet)
    ~ take(coins)
    ~ gold += 2
    The leaflet reads, "{motto_line()}".
}
<- verbs(-> opened)
+ [Leave the mailbox] -> field

= kitchen
~ here = "kitchen"
You are in the kitchen of the white house. A table stands in the centre. <>
On the table {has(sandwich): is a sandwich-shaped absence|{&is a suspiciously intact sandwich|the sandwich is still trying}}.
<- verbs(-> kitchen)
<- get_lamp_joke(-> kitchen)
* {not has(lantern)} [Take the brass lantern]
    A brass lantern, slightly sticky. You GET LAMP. The genre nods.
    ~ take(lantern)
    -> kitchen
* {not has(sandwich)} [Take the sandwich]
    ~ take(sandwich)
    It is {~ham|jam|existential}. Either way, it keeps.
    -> kitchen
* {not has(bottle)} [Take the bottle]
    ~ take(bottle)
    A bottle labelled DRINK ME. You do not. You have read that book.
    -> kitchen
* [Rummage the junk drawer]
    -> rummage_drawer -> kitchen
+ [Climb to the attic] -> attic
+ [Push through to the café] -> café
+ [Open the cellar door] -> cellar
+ {house.kitchen > 2} [Admire the crumbs]
    The crumbs have seen things.
    -> kitchen

= attic
~ here = "attic"
The attic is mostly unfinished sentences.
TODO: put a skeleton up here, or at least a plausible backstory
<- verbs(-> attic)
* {not has(rope)} [Take the rope]
    ~ take(rope)
    Adventuring rope. Rated for one (1) dramatic swing, unused.
    -> attic
+ [Back down] -> kitchen

= café
~ here = "cafe"
The white house has been renovated. There are tiny chairs. There is foam art of a grue.
A chalkboard lists today's specials: "GET LAMP, but make it brunch."
<- verbs(-> café)
* [Order something]
    "We're not a parser either," says the barista. "We have three buttons."
    ** [Espresso]
        Bitter. Honest. Gone.
    ** [The lantern latte]
        It does not light. It does have nutmeg.
    ** [Just water]
        The barista looks betrayed.
    -- You are caffeinated and no wiser.
        -> café
+ [Back to the kitchen] -> kitchen

= cellar
~ here = "cellar"
{ Lamp == lit:
    The cellar is a room after all. At the far wall, a cave mouth yawns, theatrical as ever.
    { TURNS_SINCE(-> light_the_lantern) > 12:
        The lantern {~flickers|coughs|sings a little dirge}.
        ~ Lamp = snuffed
        Then it dies, as lanterns do when the plot needs a grue.
        -> cellar
    }
    <- verbs(-> cellar)
    * [Pick up a coin in the dust]
        ~ gold += 1
        ~ score++
        A third coin, as if someone had counted on you bringing a sandwich instead.
        -> cellar
    + [Enter the cave] -> dungeon
    + [Upstairs] -> kitchen
- else:
    {GRUE_WARNING} # mood: dark
    {came_from(-> light_the_lantern): The dark rushes back in, petty as ever.}
    + {has(lantern) && Lamp != lit} [Light the brass lantern]
        -> light_the_lantern -> cellar
    * {has(sandwich)} [Eat the sandwich in the dark]
        You eat. It does not help. It does taste like adventure, which is to say: dry.
        ~ Inventory -= sandwich
        -> cellar
    + {CHOICE_COUNT() == 0} [Fumble around]
        You fumble. You find a wall, and then the same wall again.
        -> cellar
    + [Wait in the dark]
        -> ending_grue
    + [Flee upstairs] -> kitchen
    <- verbs(-> cellar)
}

=== rummage_drawer
The drawer contains the history of every adventure game, in no particular order.
* [A spoon]
    A spoon. Useless. Classic.
    -> rummage_drawer
* [A cork]
    A cork. You do not have a wine dungeon.
    -> rummage_drawer
* [A second lantern, for some reason]
    It is painted on. You admire the commitment.
    -> rummage_drawer
* ->
    The drawer is empty. So is the metaphor.
    ->->

=== get_lamp_joke(-> back)
* {not has(lantern)} [GET LAMP]
    -> parser_scold -> back
-> DONE

=== function motto_line()
    ~ return "WELCOME TO ADVENTURE. ALSO, GET LAMP."
