# What this changes

<!-- One or two sentences. If it fixes an issue, write "Fixes #123". -->

## Why

<!-- The problem, not the patch. -->

## How to see it

<!-- The steps a reviewer runs: which example project to open, what to click, what should happen. -->

1.
2.

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (new pure-model behaviour has a test in `src/model/*.test.ts`)
- [ ] I ran the app (`npm run dev` in the browser, or `npm run dev:app` for the desktop shell) and used the changed feature

## The rules this project does not bend

- [ ] The `.ink` files stay the only source of truth — no state was moved into them, and layout/UI state still lives in the `*.inkvisual.json` sidecar.
- [ ] No ink is regenerated from a parsed tree. Saving a file is still its segments joined back together, byte for byte.
- [ ] A parse error still cannot lose a node: the splitter decides what the nodes are, `inkjs` only supplies edges and diagnostics.
- [ ] Document mutations run inside `transact` / `batch` and do not mutate `files` or `layout` in place (pointer equality is how undo decides a step happened).

<!-- If a box above cannot be ticked, say so here and explain — some changes legitimately need that conversation. -->

## Screenshots

<!-- Required for anything that changes the canvas, a node card, or the editor. Before and after if you can. -->
