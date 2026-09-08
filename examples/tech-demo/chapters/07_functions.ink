// Functions, knot parameters, ref, divert-typed parameters, EXTERNAL.
//
//   === function name(args) ===
//   ~ return value
//   {name()}            call from text (interpolates the return)
//   ~ name()            call from logic (side effect; return discarded unless assigned)
//   === function f(ref x) ===   ref: modify the caller's variable
//   === knot(x) ===             knots may take parameters too
//   === knot(-> dest) ===       divert-typed parameter (a target, not a jump)
//   -> knot(1) ->               call / tunnel with arguments
//   EXTERNAL name(args)         provided by the game engine; an ink function
//                               of the same name is the fallback

EXTERNAL play_sound(name)

=== doc_functions ===
A function header uses the function keyword. It can return a value and is
called from braces or from a tilde line. A knot can also take parameters;
unlike a function it may contain choices and tunnels.
Describe: {describe("a function call")}.
* [Call a function for a side effect]
    ~ score += twice(2)
    twice(2) returned 4; score is now {score}.
    -> after_fn
* [ref parameter]
    A ref parameter lets a function modify the caller's variable.
    Score before: {score}.
    ~ alter(score, 5)
    After alter by 5: {score}.
    -> after_fn
* [Parameterized knot as a nested tunnel]
    -> greet("reader") ->
    The greet knot returned into this one.
    -> after_fn
* [Divert-typed parameter]
    travel takes a destination parameter. The arrow in the header is a
    parameter, not a jump. The call below leaves this tunnel.
    -> travel(-> util_landing, "the landing pad")
* [Engine binding with fallback]
    play_sound is declared EXTERNAL at the top of this file. The game engine
    is meant to implement it; Inky and inkjs use the ink function of the
    same name as a fallback.
    ~ play_sound("beep")
    If you heard nothing, the fallback ran (it yields 0 and prints nothing).
    -> after_fn
+ [Return]
    ->->

= after_fn
+ [More functions] -> doc_functions
+ [Hub]
    ->->

=== function describe(x) ===
~ return "«{x}»"

=== function twice(n) ===
~ return n * 2

=== function alter(ref x, n) ===
~ x = x + n

=== function play_sound(name) ===
// Fallback when no engine has bound the EXTERNAL.
~ return 0

=== greet(name) ===
Hello, {name}. This is a parameterized knot, not a function, so it can
come back from a tunnel.
->->

=== travel(-> dest, place) ===
You set out for {place}. The next line jumps to whatever was passed in.
-> dest
