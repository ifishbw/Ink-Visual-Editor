/**
 * The shipped examples are the first thing a new user opens and plays, so a dead end in
 * one of them reads as a bug in InkVisual. Compiling is not enough to catch that: ink only
 * fails at *runtime* when a choice set empties out with nowhere to fall through to, which
 * happens on a second visit to a knot whose exits are all once-only. This walks each
 * example many times with a seeded RNG so any such dead end is caught, and reproducibly.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseProject } from '../src/model/inkParse';
import { compileForPlay } from '../src/model/playCompile';
import { discoverProject } from '../src/model/project';
import { makeInkFile } from '../src/model/splitter';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

/** Mulberry32 — deterministic, so a failure names a seed you can replay. */
function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function compile(relRoot: string) {
  const abs = join(repoRoot, relRoot);
  const dir = dirname(abs);
  const rootName = relRoot.split('/').pop()!;
  const disc = discoverProject(rootName, (p) => {
    try {
      return readFileSync(join(dir, p), 'utf8');
    } catch {
      return undefined;
    }
  });
  const files = disc.files.map((p) => makeInkFile(p, readFileSync(join(dir, p), 'utf8')));
  const texts: Record<string, string> = {};
  for (const f of files) texts[f.path] = f.segments.map((s) => s.text).join('');
  return compileForPlay(rootName, files, parseProject({ root: rootName, files: texts }));
}

/** Play once, choosing at random. Returns the runtime error and the choice path, or null. */
function walk(story: NonNullable<ReturnType<typeof compile>['story']>, seed: number): string | null {
  const rand = rng(seed);
  story.ResetState();
  const path: number[] = [];
  const problems: string[] = [];
  story.onError = (msg: string, type: number) => {
    if (type !== 0) problems.push(msg);
  };
  for (let step = 0; step < 1500; step++) {
    while (story.canContinue) {
      story.Continue();
      if (problems.length) return `${problems[0]} (seed ${seed}, choices [${path.join(',')}])`;
    }
    if (story.currentChoices.length === 0) return null; // a real ending
    const pick = Math.floor(rand() * story.currentChoices.length);
    path.push(pick);
    story.ChooseChoiceIndex(pick);
  }
  return null; // hit the step cap: a long loop, not a defect
}

// Every example, keyed by its root file relative to the repo.
const EXAMPLES = ['examples/tech-demo/main.ink', 'examples/saving-tortuga/SavingTortugaRework.ink'];

describe('the shipped examples', () => {
  for (const rel of EXAMPLES) {
    describe(rel, () => {
      const result = compile(rel);

      it('compiles with a story and no error-severity diagnostics', () => {
        expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(result.story).not.toBeNull();
      });

      it('survives 200 randomized playthroughs without running out of content', () => {
        const failures = Array.from({ length: 200 }, (_, seed) => walk(result.story!, seed)).filter(Boolean);
        expect(failures.slice(0, 3)).toEqual([]);
      });
    });
  }
});
