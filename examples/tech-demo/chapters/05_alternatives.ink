// Sequences, cycles, once-only, shuffle — inline form and named form.
//
// Inline (pipe form):
//   {a|b|c}     stopping: play in order, then stick on the last
//   {&a|b}      cycling: loop from the start
//   {!a|b}      once-only: each once, then blank
//   {~a|b}      shuffle
//
// Named multiline form (dashes are arms, not gathers):
//   {stopping: - a - b }
//   {cycling:  - a - b }
//   {once:     - a - b }
//   {shuffle:  - a - b }          deal each once, then reshuffle
//   {shuffle once: - a - b }      then blank
//   {shuffle stopping: - a - b }  then stick on the last dealt
//
// A branch may contain a divert.

=== doc_alternatives ===
Curly alternatives pick a variant each time the line runs.
Revisit this chapter (or this choice) to see them advance.
The comments at the top of this file show the syntax.
* [Stopping sequence]
    Default pipe list: play in order, then stick on the last.
    {First visit.|Second.|Third and every time after.}
    -> after_alts
* [Cycle]
    Ampersand-pipe, or the named cycling form, loops back to the start.
    {&Spring.|Summer.|Autumn.|Winter.}
    -> after_alts
* [Once-only]
    Bang-pipe prints each once, then nothing.
    {!Said once.|Said twice, then silence.}
    -> after_alts
* [Shuffle]
    Tilde-pipe is random. Default shuffle deals each item once, then
    reshuffles. Shuffle-once then blanks; shuffle-stopping then sticks.
    {~Red.|Blue.|Green.}
    -> after_alts
* [Named multiline form]
    The dashes here are alternative arms, not gathers.
    {stopping:
    - The first time you read this.
    - The second time.
    - Every time after that.
    }
    -> after_alts
* [Alternative that diverts]
    A branch may contain a jump. The first two visits stay; the third leaves.
    {Still here.|Still here.|Leaving. -> util_landing}
    -> after_alts
+ [Return]
    ->->

= after_alts
+ [Again] -> doc_alternatives
+ [Hub]
    ->->
