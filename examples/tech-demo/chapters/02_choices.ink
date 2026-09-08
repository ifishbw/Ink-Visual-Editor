// Choices and weaves.
//
//   *     once-only choice (disappears after it is taken)
//   +     sticky choice (remains)
//   [x]   choice-only text (shown to the player, not printed)
//   a[b]c choice shows "abc", output prints "ac" (or the reverse with [choice])
//   * {cond} [label]   conditional choice
//   * -> target        fallback: taken automatically when nothing else is valid
//
// Weave: nest * / + and gather with -, --, --- (depth = number of markers).

=== doc_choices ===
Asterisk choices are once-only: after you take one, it never appears again.
Plus choices are sticky: they remain. Revisit this chapter from the hub
to see the difference.
* [Once-only choice]
    You can only read this paragraph the first time through.
    -> after_once
+ [Sticky choice]
    This option stays on later visits.
    -> after_once
+ [Choice-only vs output text]
    Square brackets hide text from one side: the player sees the bracket;
    the output drops it — or the reverse.
    + + Hello[.], the guard says.
        The player chose "Hello."; the output was "Hello, the guard says."
        -> after_once
    + + [Leave quietly]
        Output-only: the player saw "Leave quietly" and the story printed
        nothing extra from the choice line itself.
        -> after_once
+ [Conditional choice]
    The next option is wrapped in a condition on flagged — it only appears
    when that variable is true (the hub sets it).
    + + {flagged} [Visible because flagged is true]
        Condition succeeded.
        -> after_once
    + + [Continue regardless]
        -> after_once
+ [Fallback choice]
    A choice that is only an arrow to a target fires automatically when
    every other option is false. The next beat has two impossible options,
    so the fallback runs at once.
    + + {false} [You will not see this]
        -> fallback
    + + {false} [Nor this]
        -> fallback
    + + -> fallback
+ [Open the weave demo] -> doc_weave ->
    Back from the weave.
    -> after_once
+ [Return to the hub]
    ->->

= after_once
-> doc_choices

= fallback
The fallback choice took itself. Use this for "otherwise" in a menu.
-> after_once

=== doc_weave ===
A weave is nested choices with gathers. Depth is the number of markers.
Gathers pull those branches back together (the more dashes, the deeper
the level they close).
You meet a guard at a door.
+ "Let me through."
    "No," he says.
    + + "Please?"
        He sighs.
        + + + "It's urgent."
            "Fine. Five minutes."
        + + + "I can pay."
            He pockets the coin.
        --- Both nested pleas gather here.
    + + "Then I'll go."
        He nods.
    -- Either inner option gathers here.
+ "Never mind."
    You step back.
- Everyone meets on this top-level gather.
->->
