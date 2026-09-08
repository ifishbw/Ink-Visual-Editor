INCLUDE caves/maze.ink

=== dungeon ===
~ here = "cave"
The cave smells like old puzzles and damp felt.
-> bridge

= bridge
~ here = "cave"
{ Facts ? paid_troll:
    Brad the troll waves you through, a professional. His nametag is on straight.
    <- verbs(-> bridge)
    + [Enter the maze] -> maze
    + [Back to the cellar] -> house.cellar
- else:
    A troll occupies the entire corridor. His nametag says BRAD.
    "Toll," Brad says. "Three gold. Or a snack. Fighting is extra and I do not recommend it."
    <- verbs(-> bridge)
    + [Talk to Brad]
        -> troll_chat -> bridge
    + [Back to the cellar] -> house.cellar
}

=== troll_chat
Brad folds his arms. The corridor folds with him.
- (opts)
* [Ask what he wants]
    "Three gold," Brad says. "Inflation. Also I am trying to eat more sandwiches."
    -> opts
* {gold >= TROLL_TOLL} [Pay {TROLL_TOLL} gold]
    ~ pay(gold, TROLL_TOLL)
    ~ Facts += paid_troll
    ~ score++
    "Pleasure doing business," says Brad. "Watch the maze. It has opinions."
    ->->
* {has(sandwich)} [Offer the sandwich]
    ~ Inventory -= sandwich
    ~ Facts += paid_troll
    ~ score++
    Brad unwraps it with surprising delicacy. "Ham-adjacent. I accept."
    ->->
* [Fight Brad]
    You have no sword. You have {has(leaflet): a leaflet|your fists, which is worse}.
    Brad looks tired, not angry. "Okay."
    ->-> ending_eaten
+ [Not now]
    Brad nods. He has nowhere else to be. He is the corridor.
    ->->

=== dragon ===
~ here = "lair"
~ Facts += dragon_met
~ dragon_hue = "{~vermillion|chartreuse|mauve|the colour of old gold}"
The dragon is {dragon_hue}, unionized, and currently on a legally mandated break.
A cardboard trophy sits on a velvet cushion labelled MACGUFFIN.
- (lair)
<- verbs(-> lair)
* {not has(trophy)} [Ask about the union]
    "Local 1977," it says, smoke rings drifting into tiny picket signs. "No hoarding off the clock."
    -> lair
* {not has(trophy)} [Ask for the trophy]
    "Fill out form 9-B," it says. "Or wait until I nap. I nap a lot."
    ** [Wait]
        You wait. The dragon's eyelids droop. Then they snap open.
        "Nice try."
        -> lair
    ** [Fill out form 9-B]
        There is no form 9-B. There is never a form 9-B.
        -> lair
    -- The trophy remains, smug as the mailbox.
        -> lair
* {not has(trophy)} [Steal the trophy while it talks]
    { RANDOM(1, 6) >= 4:
        You tiptoe. You GET TROPHY. The dragon is mid-sentence about dental.
        ~ take(trophy)
        -> preferred_ending
    - else:
        The dragon notices. Dragons always notice. It is in the handbook.
        -> ending_eaten
    }
* {not has(trophy)} [Wait politely for a nap]
    The dragon dozes. Union breaks are sacred. You take the cardboard trophy and leave a polite note.
    ~ take(trophy)
    -> preferred_ending
+ {has(trophy)} [Leave, like a winner]
    -> preferred_ending
+ [Back into the maze] -> maze.trophy_hall
