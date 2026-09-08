// Glue, tags, comments, TODO. Prose that is still "syntax".
//
//   <>              glue: suppress the newline between this line and the next
//   text # tag      tags: metadata, never printed (several per line is fine)
//   // comment      line comment
//   /* block */     block comment (may span lines; may contain fake === headers)
//   TODO: message   author note — compiled and reported, not a comment

=== doc_text ===
Most lines are plain prose. A few marks change how they print or how
tools see them. Literal syntax is in the comments at the top of this file.
* [Glue]
    Glue joins this sentence to the next line <>
    so they print as one paragraph.
    It is also how a prompt wraps around a choice:
    "Greetings, <>
    * * [Dave]
    * * [Anna]
    -- !"
    -> after_text
* [Tags]
    Tags never print. They are metadata for the engine (or for this editor).
    This next line has two. # location: atrium # mood: calm
    -> after_text
* [Comments]
    Line comments and block comments produce no output.
    You cannot see the rest of this sentence. // hidden
    /* also hidden */
    -> after_text
* [TODO notes]
    A TODO note is not a comment. The compiler reports it as an author note,
    and InkVisual lists it in diagnostics.
    TODO: replace this reminder with real scene text
    -> after_text
+ [Return]
    ->->

= after_text
+ [More text features] -> doc_text
+ [Hub]
    ->->
