// Knots, stitches and labels.
//
//   === knot_name ===     a knot (one graph node)
//   = stitch_name         a stitch (labelled sub-flow on that node)
//   - (label) / * (label) a gather or choice label (also a divert target)
//
// Diverts: -> knot | -> knot.stitch | -> label
// From inside the same knot, -> stitch is enough.

=== doc_structure ===
A knot is the unit of the graph: one header, one node.
This knot also has stitches and a labelled gather.
* [What is a stitch?] -> anatomy
* [What is a label?] -> labelled
+ [Skip to the end]
    ->->

= anatomy
A stitch begins with a single equals sign. Other knots divert to it as
knot-dot-stitch; from inside this knot, a bare stitch name is enough.
This line is the anatomy stitch of doc_structure.
* [See a label next] -> labelled
+ [Return to the hub]
    ->->

= labelled
- (rest)
The gather above is named rest. Diverts to rest jump here, including from
a choice. Choice labels work the same way: a name in parentheses after
the asterisk.
* (asked) [Ask about labels]
    You asked. Visit count of that choice: {asked}.
    * * [Ask again] -> rest
    * * [Done]
        ->->
+ [Return]
    ->->
