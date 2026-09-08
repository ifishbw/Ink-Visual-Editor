// Nested INCLUDE — level 2 of 3.
// Still rooted at TechDemoExample/, not at nested/deeper/.

INCLUDE nested/deeper/deepest/level3.ink
INCLUDE nested/deeper/deepest/no-ext.ink

=== nested_level2 ===
Second INCLUDE hop. This knot is in `nested/deeper/level2.ink`.
From here the project still sees every knot by name — files are not
namespaces, only colours on the graph.
* [Deeper still] -> nested_level3
* [The deepest include] -> nested_no_ext
+ [Back to the include chapter] -> doc_includes
