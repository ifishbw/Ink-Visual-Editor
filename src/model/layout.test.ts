import { describe, expect, it } from 'vitest';
import type { Graph, GraphNode } from './graph';
import { emptyLayout, layoutFileName, layoutKey, parseLayout, placeNodes, pruneLayout, rerouteKey } from './layout';

const node = (id: string, kind: GraphNode['kind'] = 'knot', name = id.split('#')[1] ?? id): GraphNode => ({
  id,
  kind,
  name,
  file: 'm.ink',
  isFunction: false,
  stitches: [],
  startLine: 1,
  flags: { end: false, done: false, dynamic: [], loops: 0 },
  errorCount: 0,
});
const edge = (id: string, source: string, target: string) => ({ id, source, target, kind: 'divert' as const, inChoice: false, sourceLine: null, targetLine: null });
const graph: Graph = {
  nodes: [node('m.ink#', 'preamble', 'Start'), node('m.ink#a'), node('m.ink#b'), node('missing#ghost', 'missing', 'ghost')],
  edges: [edge('1', 'm.ink#', 'm.ink#a'), edge('2', 'm.ink#a', 'm.ink#b'), edge('3', 'm.ink#b', 'missing#ghost')],
};
const size = () => ({ width: 200, height: 60 });

describe('layout keys and file name', () => {
  it('keys knots by name and other nodes by id', () => {
    expect(layoutKey(node('m.ink#a'))).toBe('a');
    expect(layoutKey(node('m.ink#', 'preamble', 'Start'))).toBe('m.ink#');
    expect(layoutFileName('story/main.ink')).toBe('story/main.inkvisual.json');
  });
  it('shares a reroute chain between wires that arrive at the same place, and only those', () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const to = (label?: string) => ({ ...edge('e', 'm.ink#a', 'm.ink#b'), label });
    // Several diverts from one knot to another ride one detour...
    expect(rerouteKey(to(), byId)).toBe(rerouteKey({ ...to(), id: 'e2' }, byId));
    // ...but a wire that enters at a stitch keeps its own, or the bundle would hide which wire lands where.
    expect(rerouteKey(to('.middle'), byId)).not.toBe(rerouteKey(to(), byId));
    expect(rerouteKey(to('.middle'), byId)).not.toBe(rerouteKey(to('.end'), byId));
    expect(rerouteKey(to(), byId)).toBe('a->b');
    expect(rerouteKey(to('.middle'), byId)).toBe('a->b.middle');
  });
  it('parses tolerant of garbage', () => {
    expect(parseLayout(null)).toEqual(emptyLayout());
    expect(parseLayout('not json')).toEqual(emptyLayout());
    expect(parseLayout('{"nodes":{"a":{"x":1,"y":2}}}').nodes).toEqual({ a: { x: 1, y: 2 } });
  });
});

describe('placeNodes', () => {
  it('lays out everything with dagre when nothing is saved, left to right, and reports placements', () => {
    const { positions, placed } = placeNodes(graph, emptyLayout(), size);
    expect(Object.keys(positions).sort()).toEqual(['m.ink#', 'm.ink#a', 'm.ink#b', 'missing#ghost'].sort());
    expect(positions['m.ink#']!.x).toBeLessThan(positions['m.ink#a']!.x);
    expect(positions['m.ink#a']!.x).toBeLessThan(positions['m.ink#b']!.x);
    expect(Object.keys(placed).sort()).toEqual(['a', 'b', 'm.ink#']);
  });

  it('keeps saved positions and puts new nodes below them', () => {
    const layout = emptyLayout();
    layout.nodes = { 'm.ink#': { x: 0, y: 0 }, a: { x: 300, y: 10 } };
    const { positions, placed } = placeNodes(graph, layout, size);
    expect(positions['m.ink#a']).toEqual({ x: 300, y: 10 });
    expect(positions['m.ink#b']!.y).toBeGreaterThanOrEqual(10 + 60 + 80);
    expect(Object.keys(placed)).toEqual(['b']);
  });

  it('spawns a missing stub to the right of the knot that diverted to it', () => {
    const layout = emptyLayout();
    layout.nodes = { 'm.ink#': { x: 0, y: 0 }, a: { x: 100, y: 20 }, b: { x: 400, y: 20 } };
    const { positions, placed } = placeNodes(graph, layout, size);
    expect(positions['missing#ghost']!.x).toBe(400 + 200 + 80);
    expect(positions['missing#ghost']!.y).toBe(20);
    expect(placed['missing#ghost']).toBeUndefined();
  });

  it('prunes entries for nodes and reroutes that are gone', () => {
    const layout = emptyLayout();
    layout.nodes = { a: { x: 0, y: 0 }, zombie: { x: 1, y: 1 }, ghost: { x: 2, y: 2 } };
    layout.reroutes = { 'a->b': [{ x: 5, y: 5 }], 'a->zombie': [{ x: 1, y: 1 }], 'b->missing#ghost': [], 'm.ink#->a': [{ x: 9, y: 9 }] };
    const pruned = pruneLayout(layout, graph);
    expect(Object.keys(pruned.nodes)).toEqual(['a']);
    expect(Object.keys(pruned.reroutes).sort()).toEqual(['a->b', 'm.ink#->a']);
  });
  it('reads reroutes from older sidecars as empty', () => {
    expect(parseLayout('{"nodes":{}}').reroutes).toEqual({});
  });
});
