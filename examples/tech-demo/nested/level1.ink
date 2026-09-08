// Not a standalone story — open ../main.ink (the project root) in Inky.
// Nested INCLUDE — level 1 of 3.
// Every INCLUDE path is relative to the project root (main.ink's folder),
// not to this file. This file lives in nested/ but still writes:
//   INCLUDE nested/deeper/level2.ink

INCLUDE nested/deeper/level2.ink

=== doc_includes ===
This knot lives in `nested/level1.ink`, included from `main.ink`.
That file includes nested/deeper/level2.ink, which includes both
level3.ink and no-ext.ink further down.
Four files, three INCLUDE hops, one global knot table.
* [Go one level deeper] -> nested_level2
* [Skip to the deepest include] -> nested_no_ext
+ [Return to the hub]
    ->->
