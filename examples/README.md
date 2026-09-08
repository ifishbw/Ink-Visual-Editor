# Example projects

Two complete ink projects to open in InkVisual. Both are real, playable stories — not fragments — chosen to
show different shapes of project.

| Folder | Open this file | What it shows |
|---|---|---|
| [`tech-demo/`](tech-demo/) | `main.ink` | A multi-file tour of ink's features. Nine chapters, a hub, and a deliberately deep chain of nested `INCLUDE`s. Start here. |
| [`saving-tortuga/`](saving-tortuga/) | `SavingTortugaRework.ink` | One 795-line file: a real branching story built around tunnels and `LIST`s. |

Each folder has its own README explaining what to look at on the graph.

## How to open one

1. Launch InkVisual.
2. Click **Open ink file…** in the left-hand panel.
3. Navigate to the folder and pick the file named in the table above — the **root** file. Opening a chapter
   file instead gives you that chapter's knots and a lot of red "missing target" stubs.

Both folders already contain an `.inkvisual.json` sidecar, so the graph opens with the knots arranged rather
than in an automatic layout. Delete the sidecar if you would rather see what InkVisual's automatic layout does
with the project — nothing in the story is lost, and it regenerates.

## Where the examples are after you install the app

Copies ship inside the installed application, under `resources/examples`:

| Install | Path |
|---|---|
| Windows installer | `C:\Users\<you>\AppData\Local\Programs\InkVisual\resources\examples` |
| Windows portable | Inside the folder the `.exe` unpacks itself into at launch. Easier to use the copies from this repository. |
| Linux `.deb` | `/opt/InkVisual/resources/examples` |
| Linux AppImage | Inside the AppImage's mount, which changes each run. Easier to use the copies from this repository. |

**Copy an example somewhere writable before editing it.** The bundled copies sit in a read-only or
system-owned location, so InkVisual will not be able to save your changes or write the layout sidecar there.
Copy the folder to your documents first, then open it from the copy.

The simplest route, if you have this repository: open the examples straight from it. Or download the
repository as a ZIP from
[github.com/ifishbw/Ink-Visual-Editor](https://github.com/ifishbw/Ink-Visual-Editor) — the source is not
needed to run the app, but the example folders come with it.

## Playing them

Both stories run in the app. Open the player with the **Play** button in the file panel and press `▶ Run`, or
press `Ctrl+Enter`. You can also start a run from any knot with the dropdown in the player's toolbar, which is
the fastest way to exercise one branch of a big story.

See the [User Guide](../docs/USER_GUIDE.md) for the rest.
