// Diverts, tunnels, threads, DONE / END, variable divert targets.
//
//   -> knot              jump (this flow ends there)
//   -> knot.stitch       jump to a stitch
//   -> DONE              end this flow (other threads may continue)
//   -> END               end the whole story
//   -> knot ->           tunnel: run that knot, then continue
//   ->->                 return from a tunnel
//   ->-> somewhere       return, then divert
//   <- knot              thread: run in parallel until the next choice
//   VAR x = -> knot
//   -> x                 follow a stored target

=== doc_flow ===
Flow instructions are the wires on the graph. The comments at the top of
this file list every kind. The lines below are live examples.
<- util_thread
The line above started a thread. Its whisper mixes into this flow until
the next choice, then the thread dies.
* [Tunnel out and back]
    A tunnel runs another knot and comes back. The callee returns with
    a double arrow.
    -> util_tunnel ->
    The tunnel returned; this line is still in doc_flow.
    -> after_flow
* [Nested tunnel]
    Tunnels nest: this knot is itself a tunnel from the hub.
    -> util_tunnel ->
    Inner return, then we still have to return to the hub.
    -> after_flow
* [Variable divert]
    A VAR can store a divert target. Following that variable jumps to
    whatever it currently names (here, the hub — so this leaves the tunnel).
    -> next_stop
* [Leave the tunnel early] -> util_landing
+ [Return to the hub]
    ->->

= after_flow
+ [Again] -> doc_flow
+ [Hub]
    ->->

=== util_tunnel ===
This knot is meant to be tunneled into. Its last instruction must return
(double arrow), optionally naming a destination after the return.
You pass through the tunnel.
->->

=== util_thread ===
(A thread whispers: this content is mixed into the current flow.)
-> DONE

=== util_landing ===
You diverted out of a tunnel instead of returning, so the hub did not
resume automatically. The next line is an ordinary jump home.
-> hub
