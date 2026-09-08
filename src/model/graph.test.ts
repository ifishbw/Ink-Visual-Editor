import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildGraph } from './graph';
import { parseProject } from './inkParse';
import { makeInkFile } from './splitter';

const demoDir = fileURLToPath(new URL('../../tests/fixtures/demo/', import.meta.url));
const texts = {
  'main.ink': readFileSync(demoDir + 'main.ink', 'utf8'),
  'part2.ink': readFileSync(demoDir + 'part2.ink', 'utf8'),
};
const files = Object.entries(texts).map(([p, t]) => makeInkFile(p, t));
const graph = buildGraph(files, parseProject({ root: 'main.ink', files: texts }), 'main.ink');
const edge = (source: string, target: string) => graph.edges.filter((e) => e.source === source && e.target === target);
const node = (id: string) => graph.nodes.find((n) => n.id === id);

describe('buildGraph on the demo fixture', () => {
  it('creates one node per knot plus the Start node, and no missing stubs', () => {
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(
      [
        'main.ink#',
        'main.ink#intro',
        'main.ink#look_around',
        'main.ink#forest',
        'main.ink#describe',
        'main.ink#everybody_lives',
        'part2.ink#town',
        'part2.ink#ambient_sound',
      ].sort(),
    );
    expect(node('main.ink#')?.name).toBe('Start');
    expect(node('main.ink#forest')?.stitches).toEqual(['entrance', 'deeper', 'safe', 'danger']);
    expect(node('main.ink#describe')?.isFunction).toBe(true);
  });

  it('draws edges by kind and labels stitch targets', () => {
    expect(edge('main.ink#', 'main.ink#intro')).toHaveLength(1);
    expect(edge('main.ink#', 'main.ink#everybody_lives')[0]?.kind).toBe('reference');
    expect(edge('main.ink#intro', 'main.ink#look_around')[0]).toMatchObject({ kind: 'divert', inChoice: true, sourceLine: 13 });
    expect(edge('main.ink#look_around', 'main.ink#forest')[0]).toMatchObject({ label: '.entrance', targetLine: 29 });
    expect(edge('main.ink#forest', 'part2.ink#ambient_sound')[0]?.kind).toBe('thread');
    expect(edge('main.ink#forest', 'part2.ink#town')[0]?.kind).toBe('tunnel');
    expect(edge('part2.ink#town', 'main.ink#forest')[0]).toMatchObject({ inChoice: true });
  });

  it('turns END, DONE, self-diverts and dynamic targets into flags instead of edges', () => {
    expect(node('main.ink#look_around')?.flags.end).toBe(true);
    expect(node('main.ink#intro')?.flags.done).toBe(true);
    expect(node('main.ink#forest')?.flags).toMatchObject({ dynamic: ['current_epilogue'], loops: 1 });
    expect(edge('main.ink#forest', 'main.ink#forest')).toHaveLength(0);
    expect(graph.edges.every((e) => e.target !== 'missing#END' && e.target !== 'missing#DONE')).toBe(true);
  });

  it('does not draw edges for function calls', () => {
    expect(edge('part2.ink#town', 'main.ink#describe')).toHaveLength(0);
  });
});

describe('buildGraph edge cases', () => {
  it('creates a missing stub for an unknown target and keeps parallel diverts as separate edges', () => {
    const text = '-> a\n=== a ===\n-> ghost.stitch\n* [x] -> b\n* [y] -> b\n=== b ===\n-> END\n';
    const f = [makeInkFile('m.ink', text)];
    const g = buildGraph(f, parseProject({ root: 'm.ink', files: { 'm.ink': text } }), 'm.ink');
    expect(g.nodes.find((n) => n.kind === 'missing')).toMatchObject({ id: 'missing#ghost', name: 'ghost' });
    expect(g.edges.find((e) => e.target === 'missing#ghost')).toMatchObject({ source: 'm.ink#a', label: '.stitch' });
    const ab = g.edges.filter((e) => e.source === 'm.ink#a' && e.target === 'm.ink#b');
    expect(ab.map((e) => e.sourceLine)).toEqual([4, 5]);
    expect(ab.every((e) => e.inChoice)).toBe(true);
    expect(new Set(g.edges.map((e) => e.id)).size).toBe(g.edges.length);
    expect(g.nodes.find((n) => n.id === 'm.ink#a')?.errorCount).toBe(1);
  });

  it('treats top-level labels as internal jumps, not missing knots', () => {
    const text = 'Hello.\n* [Loop] -> loop\n- (loop)\nAgain.\n-> DONE\n=== a ===\n-> END\n';
    const g = buildGraph([makeInkFile('m.ink', text)], parseProject({ root: 'm.ink', files: { 'm.ink': text } }), 'm.ink');
    expect(g.nodes.some((n) => n.kind === 'missing')).toBe(false);
    expect(g.edges).toEqual([]);
    expect(g.nodes.find((n) => n.id === 'm.ink#')?.flags.done).toBe(true);
  });

  it('scopes divert-typed parameters: another knot using the same name gets a missing stub', () => {
    const text = '-> a(-> c)\n=== a(-> x) ===\n-> x\n=== e ===\n-> x\n=== c ===\n-> END\n';
    const g = buildGraph([makeInkFile('m.ink', text)], parseProject({ root: 'm.ink', files: { 'm.ink': text } }), 'm.ink');
    expect(g.nodes.find((n) => n.id === 'm.ink#a')?.flags.dynamic).toEqual(['x']);
    expect(g.nodes.find((n) => n.id === 'm.ink#e')?.flags.dynamic).toEqual([]);
    expect(g.edges.find((e) => e.source === 'm.ink#e')).toMatchObject({ target: 'missing#x' });
  });

  it('gives an included file with top-level code its own node, linked from Start, and attributes its errors', () => {
    const texts = { 'main.ink': 'INCLUDE b.ink\n-> k\n=== k ===\n-> END\n', 'b.ink': 'VAR z = 1\n{ broken\n' };
    const files = Object.entries(texts).map(([p, t]) => makeInkFile(p, t));
    const g = buildGraph(files, parseProject({ root: 'main.ink', files: texts }), 'main.ink');
    expect(g.nodes.find((n) => n.id === 'b.ink#')).toMatchObject({ kind: 'preamble', errorCount: 1 });
    expect(g.edges).toContainEqual(expect.objectContaining({ source: 'main.ink#', target: 'b.ink#', kind: 'include' }));
  });

  it('keeps a node for every knot even when the parser fails on it', () => {
    const text = '=== bad ===\n{ broken\n=== good ===\n-> bad\n';
    const f = [makeInkFile('m.ink', text)];
    const g = buildGraph(f, parseProject({ root: 'm.ink', files: { 'm.ink': text } }), 'm.ink');
    expect(g.nodes.map((n) => n.id)).toEqual(['m.ink#', 'm.ink#bad', 'm.ink#good']);
    expect(g.nodes.find((n) => n.id === 'm.ink#bad')?.errorCount).toBeGreaterThan(0);
  });
});
