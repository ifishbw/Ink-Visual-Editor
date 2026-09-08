// LIST values: membership, add/remove, queries, and list functions.
//
//   LIST name = a, (b), c = 5     define; parentheses = initial; optional value
//   LIST mixed = list_a, list_b   combine existing lists
//   ~ x += item    ~ x -= item    add / remove
//   ~ x = ()                      empty
//   ~ x = (a, b)                  literal
//   {x ? item}   {x has item}     contains
//   {x !? item}  {x hasnt item}   does not contain
//   {x ? (a, b)}                  contains all of
//   LIST_COUNT LIST_MIN LIST_MAX LIST_ALL LIST_VALUE LIST_RANDOM LIST_RANGE LIST_INVERT

=== doc_lists ===
A LIST is an ordered set of named items. `weapons` starts with `fists`
equipped (the parenthesised item in globals.ink).
You are holding: {weapons}.
* [Take the sword]
    ~ weapons += sword
    Added sword. Now: {weapons}.
    Count {LIST_COUNT(weapons)}; min {LIST_MIN(weapons)}; max {LIST_MAX(weapons)}.
    -> after_lists
* [Drop fists]
    ~ weapons -= fists
    Removed fists. Now: {weapons}.
    -> after_lists
* [Test membership]
    {weapons ? fists: Fists are equipped.|Fists are not equipped.}
    `?` / `has` is "contains"; `!?` / `hasnt` is the inverse.
    {weapons ? (sword, bow): You hold both sword and bow.|Not both.}
    -> after_lists
* [List functions]
    All colours: {LIST_ALL(colors)}.
    Value of medium volume: {LIST_VALUE(medium)}.
    Random colour from the full set: {LIST_RANDOM(LIST_ALL(colors))}.
    Invert current colours: {LIST_INVERT(colors)}.
    Range from red to blue: {LIST_RANGE(LIST_ALL(colors), red, blue)}.
    -> after_lists
* [Empty and literals]
    ~ temp bag = ()
    `()` is the empty list. `(sword, bow)` is a literal of those items.
    ~ bag = (sword, bow)
    Bag: {bag}.
    -> after_lists
+ [Return]
    ->->

= after_lists
+ [More lists] -> doc_lists
+ [Hub]
    ->->
