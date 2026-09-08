import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildGraph, type Graph, type GraphEdge, type GraphNode } from './graph';
import { parseProject } from './inkParse';
import { editorText, setSegmentText } from './ops';
import { freeze } from './playCompile';
import {
  edgeFor,
  liveSegText,
  mapPos,
  paintLevel,
  varNamesChanged,
  withPlayEdgeClasses,
} from './playMap';
import { discoverProject } from './project';
import { buildPreview, lineToRow } from './preview';
import { makeInkFile } from './splitter';

// Roots are relative to the repo root: fixtures live under tests/fixtures/, shipped projects under examples/.
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

function node(partial: Partial<GraphNode> & Pick<GraphNode, 'id'>): GraphNode {
  return {
    kind: 'knot',
    name: partial.id.split('#').pop() || partial.id,
    file: partial.id.split('#')[0] || 'm.ink',
    isFunction: false,
    stitches: [],
    startLine: 1,
    flags: { end: false, done: false, dynamic: [], loops: 0 },
    errorCount: 0,
    ...partial,
  };
}

describe('mapPos', () => {
  const demo = loadProject('tests/fixtures/demo/main.ink');
  const snap = freeze(demo.root, demo.files);

  it('maps a known demo {file, line} to {segId, relLine}', () => {
    // `You stand at the edge of a forest.` is line 12 of main.ink, knot intro at line 11.
    expect(mapPos(snap, { file: 'main.ink', line: 12 })).toEqual({ segId: 'main.ink#intro', relLine: 1 });
  });

  it('§2.1: growing an earlier segment does not move a frozen mapping or fail the trust check', () => {
    const forest = mapPos(snap, { file: 'main.ink', line: 25 });
    expect(forest).toEqual({ segId: 'main.ink#forest', relLine: 0 });
    const preamble = demo.files.find((f) => f.path === 'main.ink')!.segments.find((s) => s.id === 'main.ink#')!;
    const grown = demo.files.map((f) => (f.path === 'main.ink' ? setSegmentText(f, 'main.ink#', preamble.text + 'PAD\n'.repeat(12)) : f));
    // Live startLines have shifted; the snapshot must still resolve the original runtime line.
    expect(mapPos(snap, { file: 'main.ink', line: 25 })).toEqual(forest);
    expect(liveSegText(grown, 'main.ink#forest')).toBe(snap.textById.get('main.ink#forest'));
  });

  it('maps line 1 of a file that starts with a knot header to that knot, not the empty preamble', () => {
    const text = readFileSync(join(repoRoot, 'tests/fixtures/adventure-demo/house.ink'), 'utf8');
    const files = [makeInkFile('house.ink', text)];
    const house = freeze('house.ink', files);
    expect(files[0]!.segments[0]).toMatchObject({ id: 'house.ink#', text: '', startLine: 1 });
    expect(mapPos(house, { file: 'house.ink', line: 1 })).toEqual({ segId: 'house.ink#house', relLine: 0 });
  });

  it('maps the last line of a file with no trailing newline', () => {
    const files = [makeInkFile('m.ink', '=== k ===\nHello.')];
    const snapNoNl = freeze('m.ink', files);
    expect(files[0]!.segments.at(-1)!.text.endsWith('\n')).toBe(false);
    expect(mapPos(snapNoNl, { file: 'm.ink', line: 2 })).toEqual({ segId: 'm.ink#k', relLine: 1 });
  });
});

describe('paintLevel five-rung ladder', () => {
  const files = [makeInkFile('m.ink', '=== k ===\nHello.\n-> END\n')];
  const snap = freeze('m.ink', files);
  const k = node({ id: 'm.ink#k', file: 'm.ink', startLine: 1 });
  const mapped = { segId: 'm.ink#k', relLine: 1 };

  it('row when live text still matches the snapshot', () => {
    expect(paintLevel({ mapped, snap, files, node: k, hiddenFiles: {}, showFunctions: true })).toEqual({
      level: 'row',
      segId: 'm.ink#k',
      relLine: 1,
    });
  });

  it('card when the executing segment text changed', () => {
    const edited = [setSegmentText(files[0]!, 'm.ink#k', '=== k ===\nChanged.\n-> END\n')];
    expect(paintLevel({ mapped, snap, files: edited, node: k, hiddenFiles: {}, showFunctions: true })).toEqual({
      level: 'card',
      segId: 'm.ink#k',
    });
  });

  it('hidden when the file is hidden or the knot is a hidden function', () => {
    expect(paintLevel({ mapped, snap, files, node: k, hiddenFiles: { 'm.ink': true }, showFunctions: true }).level).toBe('hidden');
    expect(
      paintLevel({
        mapped,
        snap,
        files,
        node: { ...k, isFunction: true },
        hiddenFiles: {},
        showFunctions: false,
      }).level,
    ).toBe('hidden');
  });

  it('gone when the id is absent from the graph, never "renamed"', () => {
    expect(paintLevel({ mapped, snap, files, node: undefined, hiddenFiles: {}, showFunctions: true })).toEqual({
      level: 'gone',
      name: 'k',
    });
  });

  it('none when there is no mapped fragment, and does not throw on an unknown file', () => {
    expect(paintLevel({ mapped: null, snap, files, node: k, hiddenFiles: {}, showFunctions: true })).toEqual({ level: 'none' });
    expect(mapPos(snap, { file: 'nope.ink', line: 1 })).toBeNull();
  });
});

describe('edgeFor', () => {
  const src = node({ id: 'm.ink#a', startLine: 10 });
  const tgt = node({ id: 'm.ink#b', startLine: 20 });
  const e = (id: string, sourceLine: number | null): GraphEdge => ({
    id,
    source: 'm.ink#a',
    target: 'm.ink#b',
    kind: 'divert',
    inChoice: false,
    sourceLine,
    targetLine: null,
  });
  const graph: Graph = { nodes: [src, tgt], edges: [] };

  it('returns the only candidate', () => {
    expect(edgeFor({ ...graph, edges: [e('a->b', 12)] }, 'm.ink#a', 'm.ink#b', 2, 'row')).toBe('a->b');
  });

  it('picks the nearest relative line', () => {
    const edges = [e('near', 13), e('far', 19)];
    expect(edgeFor({ ...graph, edges }, 'm.ink#a', 'm.ink#b', 3, 'row')).toBe('near');
  });

  it('returns null on a tie', () => {
    const edges = [e('x', 12), e('y', 16)];
    expect(edgeFor({ ...graph, edges }, 'm.ink#a', 'm.ink#b', 4, 'row')).toBeNull();
  });

  it('returns null when no edge exists', () => {
    expect(edgeFor(graph, 'm.ink#a', 'm.ink#b', 0, 'row')).toBeNull();
  });

  it('returns null whenever sourceRung is not row', () => {
    expect(edgeFor({ ...graph, edges: [e('a->b', 12)] }, 'm.ink#a', 'm.ink#b', 2, 'card')).toBeNull();
  });
});

describe('withPlayEdgeClasses', () => {
  it('matches gid and gid#0, preserves identity, and clears classes when fx is empty', () => {
    const a = { id: 'e1', className: undefined as string | undefined };
    const b = { id: 'e2#0', className: undefined as string | undefined };
    const lit = withPlayEdgeClasses([a, b], { e1: 'lit', e2: 'now' });
    expect(lit[0]).toEqual({ id: 'e1', className: 'play-lit' });
    expect(lit[1]).toEqual({ id: 'e2#0', className: 'play-lit play-lit-now' });
    expect(withPlayEdgeClasses(lit, { e1: 'lit', e2: 'now' })[0]).toBe(lit[0]);
    const cleared = withPlayEdgeClasses(lit, {});
    expect(cleared[0]?.className).toBeUndefined();
    expect(cleared[0]).not.toBe(lit[0]);
  });
});

// A totality check over one large, real, hand-written script: every line of every segment must land on a
// row that exists. Small hand-made snippets cannot cover the shapes real ink actually contains.
describe('lineToRow totality on a full-length real script', () => {
  it('maps every relative line of every segment to an in-bounds row', () => {
    const text = readFileSync(join(repoRoot, 'examples/saving-tortuga/SavingTortugaRework.ink'), 'utf8');
    const file = makeInkFile('SavingTortugaRework.ink', text);
    for (const s of file.segments) {
      const preview = buildPreview(editorText(s.text));
      expect(preview.rows.length).toBeGreaterThan(0);
      for (let i = 0; i < preview.rowOf.length; i++) {
        const row = lineToRow(preview, i);
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThan(preview.rows.length);
      }
    }
  });
});

describe('varNamesChanged', () => {
  it('includes a key present in a and absent in b (returned to default)', () => {
    const prev = JSON.stringify({ variablesState: { gold: 5, teacup: true } });
    const next = JSON.stringify({ variablesState: { gold: 5 } });
    expect(varNamesChanged(prev, next)).toEqual(['teacup']);
  });

  it('reports a value change', () => {
    const prev = JSON.stringify({ variablesState: { gold: 5 } });
    const next = JSON.stringify({ variablesState: { gold: 3 } });
    expect(varNamesChanged(prev, next)).toEqual(['gold']);
  });
});

describe('buildGraph still loads demo for edgeFor on real edges', () => {
  it('identifies the unique intro → look_around divert', () => {
    const demo = loadProject('tests/fixtures/demo/main.ink');
    const graph = buildGraph(demo.files, demo.parse, demo.root);
    const id = edgeFor(graph, 'main.ink#intro', 'main.ink#look_around', 2, 'row');
    expect(id).toBeTruthy();
  });
});
