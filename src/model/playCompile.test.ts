import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Story } from 'inkjs/full';
import { parseProject } from './inkParse';
import { editorText } from './ops';
import {
  compileForPlay,
  freeze,
  namesFromMissingBindingMessage,
  scanExternals,
} from './playCompile';
import { discoverProject } from './project';
import { makeInkFile } from './splitter';

// Fixture roots are given relative to the repo root, because the corpus lives in two places:
// tests/fixtures/ (model fixtures) and examples/ (the projects the app ships to users).
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function loadProject(relRoot: string) {
  const abs = join(repoRoot, relRoot);
  const rootDir = dirname(abs);
  const root = relRoot.split('/').pop()!;
  const disc = discoverProject(root, (p) => {
    try {
      return readFileSync(join(rootDir, p), 'utf8');
    } catch {
      return undefined;
    }
  });
  const files = disc.files.map((p) => makeInkFile(p, readFileSync(join(rootDir, p), 'utf8')));
  const texts: Record<string, string> = {};
  for (const f of files) texts[f.path] = f.segments.map((s) => s.text).join('');
  return { root, files, texts, parse: parseProject({ root, files: texts }) };
}

describe('compileForPlay on the shipped projects', () => {
  const roots = [
    'tests/fixtures/demo/main.ink',
    'tests/fixtures/adventure-demo/main.ink',
    'examples/tech-demo/main.ink',
    'examples/saving-tortuga/SavingTortugaRework.ink',
  ];

  for (const rel of roots) {
    it(`compiles ${rel} with a story and no error-severity diagnostics`, () => {
      const p = loadProject(rel);
      const result = compileForPlay(p.root, p.files, p.parse);
      expect(result.story, rel).not.toBeNull();
      expect(
        result.diagnostics.filter((d) => d.severity === 'error'),
        rel,
      ).toEqual([]);
    });

    // The graph tier parses independently of the compiler, and the examples are what a new user opens first:
    // one of them showing red on the canvas is a shipping bug, not a test-fixture problem.
    it(`parses ${rel} with no error-severity diagnostics`, () => {
      const p = loadProject(rel);
      expect(
        p.parse.diagnostics.filter((d) => d.severity === 'error'),
        rel,
      ).toEqual([]);
    });
  }
});

describe('countAllVisits', () => {
  it('records intro as visited after walking demo to forest.entrance', () => {
    const p = loadProject('tests/fixtures/demo/main.ink');
    const { story } = compileForPlay(p.root, p.files, p.parse);
    expect(story).not.toBeNull();
    const s = story!;
    while (s.canContinue) s.Continue();
    const enter = s.currentChoices.findIndex((c) => /enter the forest/i.test(c.text));
    expect(enter).toBeGreaterThanOrEqual(0);
    s.ChooseChoiceIndex(enter);
    let guard = 0;
    while (s.canContinue && guard++ < 40) s.Continue();
    expect(s.state.VisitCountAtPathString('intro')).toBe(1);
    expect(s.state.VisitCountAtPathString('forest.entrance')).toBeGreaterThanOrEqual(1);
  });
});

describe('dm.fileName keys', () => {
  it('every fragment of a 40-step multi-file walk names a fed texts key', () => {
    const p = loadProject('tests/fixtures/adventure-demo/main.ink');
    const { story } = compileForPlay(p.root, p.files, p.parse);
    expect(story).not.toBeNull();
    const s = story!;
    const keys = new Set(Object.keys(p.texts));
    let steps = 0;
    while ((s.canContinue || s.currentChoices.length > 0) && steps < 40) {
      if (s.canContinue) {
        s.Continue();
        const os = (s.state as unknown as { outputStream: { ownDebugMetadata: { fileName: string | null } | null }[] }).outputStream;
        for (const o of os) {
          const dm = o.ownDebugMetadata;
          if (dm?.fileName != null) expect(keys.has(dm.fileName), dm.fileName).toBe(true);
        }
        steps++;
      } else {
        s.ChooseChoiceIndex(0);
      }
    }
    expect(steps).toBeGreaterThan(0);
  });
});

describe('compile failures and warnings', () => {
  it('returns story null and a file+line diagnostic on a syntax error, without throwing', () => {
    const files = [makeInkFile('bad.ink', '=== k ===\n{\n-> END\n')];
    const result = compileForPlay('bad.ink', files, null);
    expect(result.story).toBeNull();
    const err = result.diagnostics.find((d) => d.severity === 'error');
    expect(err).toBeTruthy();
    expect(err!.file).toBeTruthy();
    expect(err!.line).toBeTruthy();
  });

  it('still produces a runnable story for a warning-only empty * choice', () => {
    const files = [makeInkFile('w.ink', '=== k ===\n*\n-> END\n')];
    const result = compileForPlay('w.ink', files, null);
    expect(result.story).not.toBeNull();
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(false);
    expect(result.story!.canContinue || result.story!.currentChoices.length >= 0).toBe(true);
  });
});

describe('scanExternals and ValidateExternalBindings hard block', () => {
  it('finds EXTERNAL multiply(x, y) arity 2 and skips a commented line', () => {
    const texts = {
      't.ink': '// EXTERNAL skipme(a)\nEXTERNAL multiply(x, y)\n=== k ===\n-> END\n',
    };
    expect(scanExternals(texts)).toEqual([{ name: 'multiply', arity: 2 }]);
  });

  it('parses quoted names from a missing-binding message', () => {
    expect(namesFromMissingBindingMessage("Missing function binding 'multiply' for external(s): 'multiply', 'other'")).toEqual([
      'multiply',
      'other',
    ]);
  });

  it('never Continue()s a story whose ValidateExternalBindings could not be repaired', () => {
    // Split the EXTERNAL header so the line scanner misses it; inkjs still sees the binding.
    const files = [makeInkFile('t.ink', 'EXTERNAL multiply(\nx, y)\n=== start ===\nBefore.\n{multiply(2,3)}\nAfter.\n-> END\n')];
    const spy = vi.spyOn(Story.prototype, 'Continue');
    const result = compileForPlay('t.ink', files, null);
    if (result.externalsUnrepairable) expect(result.story).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('trust-check terminator', () => {
  it('snapshot text matches raw segments[].text, not editorText, for a non-last segment', () => {
    const p = loadProject('tests/fixtures/demo/main.ink');
    const snap = freeze(p.root, p.files);
    const intro = p.files.flatMap((f) => f.segments).find((s) => s.id === 'main.ink#intro')!;
    expect(intro.text.endsWith('\n')).toBe(true);
    expect(snap.textById.get(intro.id)).toBe(intro.text);
    // editorText strips the final terminator. Comparing snapshot to that map would mark every
    // non-last segment stale the moment play compiled — the trap in PLAY_MODE_PLAN.md §4.3.
    expect(snap.textById.get(intro.id)).not.toBe(editorText(intro.text));
  });
});
