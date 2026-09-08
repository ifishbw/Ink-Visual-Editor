// Variables, temps, expressions, conditionals, switches, game queries.
//
//   ~ x = 1          assign (also ~ x++, ~ x--)
//   ~ temp y = 2     local to this flow
//   {x}              interpolate in text
//   {cond: yes|no}   inline condition
//   { cond:          multiline condition
//   - else:              (the dash here is a branch, not a gather)
//   }
//   { x:             switch on a value
//   - 0: zero
//   - else: other
//   }
//   and or not   == != < > <= >=   + - * / mod   && || !
//   INT FLOOR FLOAT POW RANDOM TURNS TURNS_SINCE CHOICE_COUNT SEED_RANDOM
//   {knot}           visit count    TURNS_SINCE(-> knot)  (reference, not a jump)

=== doc_logic ===
A tilde starts a logic line: assign, increment, or call a function for its
side effect. Braces in text interpolate a value or a condition.
~ score++
~ temp bonus = 3
Score is {score} (capped conceptually at {MAX_SCORE}). Temp bonus: {bonus}.
* [Inline condition]
    {flagged: Flag is set.|Flag is clear.}
    {score > 0: Score is positive.}
    -> after_logic
* [Multiline condition]
    { flagged:
        The multiline form uses indented branches.
    - else:
        The else branch is a switch arm, not a gather.
    }
    -> after_logic
* [Switch on a value]
    { score:
    - 0: Zero.
    - 1: One.
    - else: Something else ({score}).
    }
    -> after_logic
* [Expressions]
    Arithmetic: 7 mod 3 = {7 mod 3}, 2 * 4 + 1 = {2 * 4 + 1}.
    Comparisons use the usual operators; logic uses and / or / not.
    Casts: INT(3.7) = {INT(3.7)}, FLOOR(3.7) = {FLOOR(3.7)}, POW(2, 3) = {POW(2, 3)}.
    -> after_logic
* [Game queries]
    Turns elapsed: {TURNS()}. Random 1–6: {RANDOM(1, 6)}. Choices on the
    last menu: {CHOICE_COUNT()}.
    TURNS_SINCE takes a divert-typed argument — an arrow that is not a
    jump, only a reference to a knot.
    Turns since the hub: {TURNS_SINCE(-> hub)}.
    Visit count of this knot: {doc_logic}.
    -> after_logic
+ [Return]
    ->->

= after_logic
+ [More logic] -> doc_logic
+ [Hub]
    ->->
