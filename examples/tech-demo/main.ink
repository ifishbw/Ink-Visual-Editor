// Ink syntax tech demo — a playable tour of every documented ink feature.
//
// THIS is the project root. Open this file in Inky or InkVisual, not a chapter.
//   InkVisual: http://localhost:5173/?root=TechDemoExample/main.ink

//
// INCLUDE paths are always relative to THIS file's folder, even when an
// included file includes another. Knot names are a single global namespace.

# title: Ink Syntax Tech Demo
# author: InkVisual

INCLUDE globals.ink
INCLUDE chapters/01_structure.ink
INCLUDE chapters/02_choices.ink
INCLUDE chapters/03_flow.ink
INCLUDE chapters/04_logic.ink
INCLUDE chapters/05_alternatives.ink
INCLUDE chapters/06_lists.ink
INCLUDE chapters/07_functions.ink
INCLUDE chapters/08_text.ink
INCLUDE nested/level1.ink

/* Block comments are stripped before parsing.
   === not_a_knot ===  inside one must not become a node. */

This is the story start: content in the root file before the first knot.
The graph shows it as the preamble / Start node. # demo: preamble
-> hub

=== hub ===
~ flagged = true
{DEMO_TITLE}. Each chapter is a tunnel: it runs, then ink returns here.
- (menu)
* [How to read this]
    Knots are nodes. A divert between knots is a wire. A stitch is a labelled
    point on the same node. Files are colour-coded; INCLUDE builds the project.
    -> menu
+ [1. Knots, stitches, labels] -> doc_structure -> menu
+ [2. Choices and weaves] -> doc_choices -> menu
+ [3. Diverts, tunnels, threads] -> doc_flow -> menu
+ [4. Variables and conditionals] -> doc_logic -> menu
+ [5. Sequences and shuffle] -> doc_alternatives -> menu
+ [6. Lists] -> doc_lists -> menu
+ [7. Functions and parameters] -> doc_functions -> menu
+ [8. Glue, tags, comments] -> doc_text -> menu
+ [9. Nested INCLUDE files] -> doc_includes -> menu
+ [Finish] -> END
