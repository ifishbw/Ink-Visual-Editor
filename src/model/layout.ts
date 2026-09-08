/**
 * The sidecar layout file (`<root>.inkvisual.json`) and automatic placement of nodes that have no saved position.
 * Keyed by knot name because ink knot names are unique across the whole project.
 */
import dagre from '@dagrejs/dagre';
import type { Graph, GraphEdge, GraphNode } from './graph';

export interface NodeLayout {
  x: number;
  y: number;
  /** Hand-set size, in flow units. Absent means "size to fit the knot's text". */
  w?: number;
  h?: number;
  collapsed?: boolean;
}

export type Position = { x: number; y: number };

export interface LayoutFile {
  version: 1;
  viewport?: { x: number; y: number; zoom: number };
  nodes: Record<string, NodeLayout>;
  files: Record<string, { color?: string }>;
  /** Reroute waypoints per source/target pair, e.g. `"intro->forest": [{x,y}, ...]`. Purely visual. */
  reroutes: Record<string, Position[]>;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_NODE_WIDTH = 180;
export const MIN_NODE_HEIGHT = 80;

/**
 * The size a node is actually drawn at: the hand-set width and height from the sidecar where they exist,
 * otherwise the automatic size derived from the knot's text. A collapsed node ignores a saved height.
 */
export function effectiveSize(auto: Size, entry: NodeLayout | undefined, compact: boolean): Size {
  return {
    width: entry?.w === undefined ? auto.width : Math.max(MIN_NODE_WIDTH, Math.round(entry.w)),
    height: compact || entry?.h === undefined ? auto.height : Math.max(MIN_NODE_HEIGHT, Math.round(entry.h)),
  };
}

export const emptyLayout = (): LayoutFile => ({ version: 1, nodes: {}, files: {}, reroutes: {} });

export function layoutFileName(root: string): string {
  return root.replace(/\.ink$/i, '') + '.inkvisual.json';
}

/** Knots are keyed by name; everything else (Start, included-file headers) by node id. Missing stubs are never saved. */
export function layoutKey(node: GraphNode): string {
  return node.kind === 'knot' ? node.name : node.id;
}

/**
 * Waypoints are shared by every edge that leaves one node and arrives at the same place on another. Sharing is
 * the point -- several diverts to one knot ride one tidy detour -- but it stops at the arrival point: wires
 * that enter at different stitches keep their own chains, or a merged bundle would hide which wire lands where.
 * Keyed by the written target suffix rather than by line number, so it survives editing above the stitch.
 */
export function rerouteKey(edge: GraphEdge, nodesById: Map<string, GraphNode>): string | null {
  const s = nodesById.get(edge.source);
  const t = nodesById.get(edge.target);
  if (!s || !t) return null;
  return `${layoutKey(s)}->${layoutKey(t)}${edge.label ?? ''}`;
}

export function parseLayout(text: string | null): LayoutFile {
  if (!text) return emptyLayout();
  try {
    const raw = JSON.parse(text) as Partial<LayoutFile>;
    return {
      version: 1,
      viewport: raw.viewport,
      nodes: typeof raw.nodes === 'object' && raw.nodes ? raw.nodes : {},
      files: typeof raw.files === 'object' && raw.files ? raw.files : {},
      reroutes: typeof raw.reroutes === 'object' && raw.reroutes ? raw.reroutes : {},
    };
  } catch {
    return emptyLayout();
  }
}

/** Run dagre over the given nodes and edges; returns top-left positions. */
export function dagreLayout(
  nodes: { id: string; width: number; height: number }[],
  edges: { source: string; target: string }[],
  rankdir: 'LR' | 'TB' = 'LR',
): Record<string, Position> {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, nodesep: 40, ranksep: 90, marginx: 20, marginy: 20 });
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });
  for (const e of edges) if (ids.has(e.source) && ids.has(e.target) && e.source !== e.target) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const out: Record<string, Position> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    out[n.id] = { x: Math.round(p.x - n.width / 2), y: Math.round(p.y - n.height / 2) };
  }
  return out;
}

/**
 * Positions for every graph node. Nodes with a saved layout keep it; unplaced knots are laid out by
 * dagre among themselves and placed below everything that already has a position. Missing stubs are
 * not saved: a new one spawns immediately to the right of the knot that diverted to it, so it is
 * findable next to what created it rather than in an arbitrary pile to the left.
 */
export function placeNodes(
  graph: Graph,
  layout: LayoutFile,
  sizeOf: (node: GraphNode) => Size,
): { positions: Record<string, Position>; placed: Record<string, Position> } {
  const positions: Record<string, Position> = {};
  const unplaced: GraphNode[] = [];
  for (const n of graph.nodes) {
    const saved = n.kind === 'missing' ? undefined : layout.nodes[layoutKey(n)];
    if (saved) positions[n.id] = { x: saved.x, y: saved.y };
    else unplaced.push(n);
  }
  const placed: Record<string, Position> = {};
  const missing = unplaced.filter((n) => n.kind === 'missing');
  const rest = unplaced.filter((n) => n.kind !== 'missing');

  if (rest.length > 0) {
    const auto = dagreLayout(
      rest.map((n) => ({ id: n.id, ...sizeOf(n) })),
      graph.edges,
    );
    let offsetY = 0;
    const placedIds = Object.keys(positions);
    if (placedIds.length > 0) {
      const bottom = Math.max(...placedIds.map((id) => positions[id]!.y + sizeOf(graph.nodes.find((n) => n.id === id)!).height));
      offsetY = bottom + 80;
    }
    for (const n of rest) {
      const p = auto[n.id]!;
      positions[n.id] = { x: p.x, y: p.y + offsetY };
      placed[layoutKey(n)] = positions[n.id]!;
    }
  }

  const STUB_GAP_X = 80;
  const STUB_GAP_Y = 48;
  const slots: Record<string, number> = {};
  const leftover: GraphNode[] = [];
  for (const n of missing) {
    const srcId = graph.edges.find((e) => e.target === n.id && positions[e.source])?.source;
    if (!srcId) {
      leftover.push(n);
      continue;
    }
    const src = graph.nodes.find((x) => x.id === srcId)!;
    const sp = positions[srcId]!;
    const ss = sizeOf(src);
    const slot = slots[srcId] ?? 0;
    slots[srcId] = slot + 1;
    positions[n.id] = { x: sp.x + ss.width + STUB_GAP_X, y: sp.y + slot * STUB_GAP_Y };
  }
  if (leftover.length > 0) {
    const auto = dagreLayout(
      leftover.map((n) => ({ id: n.id, ...sizeOf(n) })),
      graph.edges,
    );
    let offsetY = 0;
    const placedIds = Object.keys(positions);
    if (placedIds.length > 0) {
      const bottom = Math.max(...placedIds.map((id) => positions[id]!.y + sizeOf(graph.nodes.find((n) => n.id === id)!).height));
      offsetY = bottom + 80;
    }
    for (const n of leftover) {
      const p = auto[n.id] ?? { x: 0, y: 0 };
      positions[n.id] = { x: p.x, y: p.y + offsetY };
    }
  }
  return { positions, placed };
}

/** Drop layout entries and reroutes for nodes and edges that no longer exist. */
export function pruneLayout(layout: LayoutFile, graph: Graph): LayoutFile {
  const keep = new Set(graph.nodes.filter((n) => n.kind !== 'missing').map(layoutKey));
  const nodes: LayoutFile['nodes'] = {};
  for (const [k, v] of Object.entries(layout.nodes)) if (keep.has(k)) nodes[k] = v;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const liveKeys = new Set(graph.edges.map((e) => rerouteKey(e, byId)).filter((k): k is string => k !== null));
  const reroutes: LayoutFile['reroutes'] = {};
  for (const [k, v] of Object.entries(layout.reroutes)) if (liveKeys.has(k) && v.length > 0) reroutes[k] = v;
  return { ...layout, nodes, reroutes };
}
