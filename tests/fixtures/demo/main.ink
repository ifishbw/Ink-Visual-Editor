// Demo project for InkVisual model tests. Exercises every divert kind.
INCLUDE part2.ink

VAR visited_town = false
VAR current_epilogue = -> everybody_lives
CONST MAX_TRIES = 3

Welcome to the demo. // preamble content is the story start
-> intro

=== intro ===
You stand at the edge of a forest. # mood: calm
* [Look around] -> look_around
* [Enter the forest] -> forest
* {visited_town} [Go back to town] -> town
- -> DONE

=== look_around ===
There is a path leading in, and a road leading back.
- (loop)
    * [Wait] -> loop
    * [Enter] -> forest.entrance
    + [Give up] -> END

=== forest ===
The trees close in behind you.
-> entrance

= entrance
{ visited_town:
    You remember the town.
- else:
    -> deeper
}
-> deeper

= deeper
<- ambient_sound
I { waited.|waited some more.|gave up and left. -> safe }
-> town -> danger

= safe
You find a clearing. -> current_epilogue

= danger
~ visited_town = true
Something moves. -> forest.deeper

=== function describe(x) ===
~ return "It is {x}."

=== everybody_lives ===
And so it ends, well.
-> END
