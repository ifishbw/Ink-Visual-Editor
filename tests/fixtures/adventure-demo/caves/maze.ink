/* A maze of twisty little passages.
   All alike. Yes, including this comment. */

=== maze ===
You step into the maze. The walls rearrange themselves out of habit, not malice.
-> twisty

= twisty
~ here = "maze"
You are in a maze of twisty little passages, all {&alike|alike, still|alike, and they know you know}.
- (search)
<- verbs(-> search)
* [Go north]
    {A wall.|Another wall.|The same wall, wearing a hat.}
    -> search
* [Go east]
    A passage! It leads to a passage. The passage leads to this passage.
    -> search
* [Go west]
    You find a skeleton holding a sign that says GET LAMP.
    {has(lantern): You hold up the lantern. The skeleton looks unimpressed.|You do not have a lamp. The skeleton looks smug.}
    -> search
* {has(rope)} [Tie the rope to a rock and follow it]
    ~ Inventory -= rope
    The rope points, smugly, toward a draught.
    -> twistier
* [Follow a faint breeze]
    -> twistier
* [Sit down and wait to be rescued]
    You have tried every foolish idea.
    -> ending_lost

= twistier
~ here = "maze"
The passages here are twisty and little, but they are not alike. One of them has a houseplant.
- (more)
+ [Talk to the houseplant]
    "I'm a stitch," it whispers. "Don't tell the knots."
    -> more
+ [Water it with the bottle]
    {has(bottle):
        ~ Inventory -= bottle
        The plant flourishes. It does not open a door. It is a plant.
    - else:
        You have no bottle. You mime watering. The plant is polite about it.
    }
    -> more
+ [Squeeze past the houseplant] -> trophy_hall
+ [Back to the alike bit] -> twisty

= trophy_hall
~ here = "maze"
A wider cave. Warm air. Gold light. Something large is snoring in 4/4 time.
<- verbs(-> trophy_hall)
+ [Tiptoe toward the snoring] -> dragon
+ [Retreat into twisty little cowardice] -> twistier
