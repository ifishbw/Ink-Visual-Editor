/**
 * Builds React Flow nodes and edges from the graph, layout and view state.
 * Pure so it can be reasoned about without the canvas: visibility filters, per-line handles, reroute dots.
 */
import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';
import type { Graph, GraphNode } from '../model/graph';
import { effectiveSize, layoutKey, rerouteKey, type LayoutFile, type Position as XY, type Size } from '../model/layout';
import { PREVIEW_MAX_H, layoutRows, lineToRow, type KnotPreview, type RowGeometry } from '../model/preview';
import type { NodeView } from '../store/projectStore';
import { MISSING_COLOR } from './colors';
import type { Theme } from './inkTheme';

/** Node geometry, shared by the card and by the wire routing. Row heights themselves live in `preview.ts`. */
export const HEADER_H = 32;
/** `.knot`'s 1px border, top and bottom. `box-sizing: border-box` takes it out of the body's height. */
export const CARD_BORDER = 2;
export const HEADER_HANDLE_TOP = 16;
/** Diameter of a reroute dot; also its CSS size. */
export const REROUTE_SIZE = 12;

/**
 * How much height the preview may take before its bar rows start squeezing. A hand-set node gives the body
 * whatever is left under the header -- which is what makes dragging a node taller reveal more of its labels.
 */
export function capFor(height: number, sized: boolean): number {
  return sized ? Math.max(0, height - HEADER_H - CARD_BORDER) : PREVIEW_MAX_H;
}

/**
 * Offset from the top of a node card to the handle for one of its source lines: the middle of the preview row
 * that line is drawn on. `layoutRows` is the single source of truth for row y, so the card and the wires
 * cannot disagree.
 */
export function handleTop(line: number, opts: { compact: boolean; preview: KnotPreview; geom: RowGeometry }): number {
  if (opts.compact) return HEADER_HANDLE_TOP;
  const row = lineToRow(opts.preview, line);
  // Row 0 of a knot is its `=== name ===` line, which the card draws as the header itself.
  if (opts.preview.rows[row]?.kind === 'header') return HEADER_HANDLE_TOP;
  return HEADER_H + (opts.geom.tops[row] ?? 0) + (opts.geom.heights[row] ?? 0) / 2;
}

export interface KnotNodeData {
  node: GraphNode;
  view: NodeView;
  /** The knot's rows. Recomputed only on reparse, and reference-stable while the knot's text is unchanged. */
  preview: KnotPreview;
  /** Where each row sits. Computed here, not in the card, so the card and the wires cannot disagree. */
  geom: RowGeometry;
  collapsed: boolean;
  /** True when the user has set the height by hand: the preview squeezes to fill exactly that height. */
  sized: boolean;
  /** Segment-relative lines (0 = header line) that have an outgoing divert. */
  outLines: number[];
  /** Segment-relative lines of stitch headers that are divert targets. */
  inLines: number[];
  [key: string]: unknown;
}
export type KnotFlowNode = Node<KnotNodeData, 'knot'>;
export interface RerouteData {
  key: string;
  index: number;
  [key: string]: unknown;
}
export type RerouteFlowNode = Node<RerouteData, 'reroute'>;
export type FlowNode = KnotFlowNode | RerouteFlowNode;

export interface FlowEdgeData {
  /** Reroute key of the underlying edge, or null for include edges without one. */
  key: string | null;
  /** Segment index; a waypoint inserted on this segment goes at this array index. */
  index: number;
  [key: string]: unknown;
}

export const REROUTE_PREFIX = 'reroute:';

/** The four sides a reroute dot can take a wire in or out of. */
export const SIDES = ['left', 'right', 'top', 'bottom'] as const;
export type Side = (typeof SIDES)[number];
export const SIDE_POSITION: Record<Side, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};
export const OPPOSITE_SIDE: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
export const rerouteHandle = (dir: 'in' | 'out', side: Side): string => `${dir}-${side}`;

export function rerouteNodeId(key: string, index: number): string {
  return `${REROUTE_PREFIX}${key}:${index}`;
}

export function parseRerouteId(id: string): { key: string; index: number } | null {
  if (!id.startsWith(REROUTE_PREFIX)) return null;
  const rest = id.slice(REROUTE_PREFIX.length);
  const cut = rest.lastIndexOf(':');
  if (cut < 0) return null;
  return { key: rest.slice(0, cut), index: Number(rest.slice(cut + 1)) };
}

/** The side a vector points at. Horizontal wins ties so wires keep reading left to right. */
export function sideOf(v: XY): Side {
  if (Math.abs(v.x) >= Math.abs(v.y)) return v.x >= 0 ? 'right' : 'left';
  return v.y >= 0 ? 'bottom' : 'top';
}

/** Unit vector from `a` to `b`; zero when they coincide. */
function direction(a: XY, b: XY): XY {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
}

/**
 * The handle sides for a chain of reroute dots between two anchors.
 *
 * A dot's two handles are always on **opposite** sides, so the wire keeps its heading through the dot and
 * flows past it instead of turning a right angle inside it. The axis is the bisector of the two legs (the
 * sum of the unit vectors in and out), which is the direction that bends both legs the least: a dot in the
 * middle of a straight run lines up exactly, and a wire that doubles back still enters from the right and
 * leaves to the left. A corner has to bend one of its two legs whatever we pick; the bisector bends the
 * shallower one.
 */
export function rerouteSides(from: XY, dots: readonly XY[], to: XY): { in: Side; out: Side }[] {
  const centers = dots.map((p) => ({ x: p.x + REROUTE_SIZE / 2, y: p.y + REROUTE_SIZE / 2 }));
  return centers.map((c, i) => {
    const arriving = direction(i === 0 ? from : centers[i - 1]!, c);
    const leaving = direction(c, i === centers.length - 1 ? to : centers[i + 1]!);
    const bisector = { x: arriving.x + leaving.x, y: arriving.y + leaving.y };
    // An exact reversal cancels out; fall back to where the wire is headed.
    const axis = Math.hypot(bisector.x, bisector.y) < 1e-6 ? leaving : bisector;
    const out = sideOf(axis);
    return { in: OPPOSITE_SIDE[out], out };
  });
}

export interface FlowInput {
  graph: Graph;
  positions: Record<string, XY>;
  views: Record<string, NodeView>;
  layout: LayoutFile;
  hiddenFiles: Record<string, true>;
  showFunctions: boolean;
  theme: Theme;
}

export function toFlow(input: FlowInput): { nodes: FlowNode[]; edges: Edge[] } {
  const { graph, positions, views, layout, hiddenFiles, showFunctions, theme } = input;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const visible = (n: GraphNode) => n.kind === 'missing' || (!hiddenFiles[n.file] && (showFunctions || !n.isFunction));
  const edges = graph.edges.filter((e) => {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    return s && t && visible(s) && visible(t);
  });
  const targetedMissing = new Set(edges.map((e) => e.target));
  const nodes = graph.nodes.filter((n) => (n.kind === 'missing' ? targetedMissing.has(n.id) : visible(n)));

  const outLines = new Map<string, Set<number>>();
  const inLines = new Map<string, Set<number>>();
  for (const e of edges) {
    const s = byId.get(e.source)!;
    const t = byId.get(e.target)!;
    if (e.sourceLine !== null && s.kind !== 'missing') add(outLines, s.id, relativeLine(e.sourceLine, s.startLine));
    if (e.targetLine !== null && t.kind !== 'missing') add(inLines, t.id, relativeLine(e.targetLine, t.startLine));
  }

  // Sizes come from the layout, not from `views`, so a resize shows up without waiting for a reparse. The row
  // geometry depends on that drawn size, so it belongs here too and never in `buildViews`.
  const shape = new Map<string, { pos: XY; size: Size; compact: boolean; collapsed: boolean; sized: boolean; preview: KnotPreview; geom: RowGeometry }>();
  for (const n of nodes) {
    const entry = n.kind === 'missing' ? undefined : layout.nodes[layoutKey(n)];
    const collapsed = entry?.collapsed === true;
    const compact = n.kind === 'missing' || collapsed;
    const size = effectiveSize(views[n.id]!.size, entry, compact);
    const sized = !compact && entry?.h !== undefined;
    const preview = views[n.id]!.preview;
    shape.set(n.id, {
      pos: positions[n.id] ?? { x: 0, y: 0 },
      size,
      compact,
      collapsed,
      sized,
      preview,
      geom: layoutRows(preview, capFor(size.height, sized), sized),
    });
  }

  /** Where a wire physically leaves or enters a node, used to aim the reroute dots. */
  const nodeAnchor = (id: string, dir: 'out' | 'in', line: number | null): XY => {
    const g = shape.get(id);
    if (!g) return positions[id] ?? { x: 0, y: 0 };
    const top = line === null ? HEADER_HANDLE_TOP : handleTop(line, g);
    return { x: dir === 'out' ? g.pos.x + g.size.width : g.pos.x, y: g.pos.y + top };
  };

  const flowNodes: FlowNode[] = nodes.map((n) => {
    const g = shape.get(n.id)!;
    return {
      id: n.id,
      type: 'knot' as const,
      position: g.pos,
      width: g.size.width,
      // Only pin the height when the user set one; otherwise the card sizes itself to its text.
      height: g.sized ? g.size.height : undefined,
      data: {
        node: n,
        view: { ...views[n.id]!, size: g.size },
        preview: g.preview,
        geom: g.geom,
        collapsed: g.collapsed,
        sized: g.sized,
        outLines: [...(outLines.get(n.id) ?? [])].sort((a, b) => a - b),
        inLines: [...(inLines.get(n.id) ?? [])].sort((a, b) => a - b),
      },
      draggable: n.kind !== 'missing',
    };
  });

  const colors = theme === 'dark' ? { flow: '#7aa2ff', quiet: '#6b6f7c', label: '#a9abb3' } : { flow: '#3b5bdb', quiet: '#9a9eb0', label: '#4a5170' };
  const missingIds = new Set(nodes.filter((n) => n.kind === 'missing').map((n) => n.id));
  const flowEdges: Edge[] = [];
  /** Handle sides per reroute chain: the dots are shared by every wire between the same two knots. */
  const dotSides = new Map<string, { in: Side; out: Side }[]>();

  for (const e of edges) {
    const s = byId.get(e.source)!;
    const t = byId.get(e.target)!;
    const key = rerouteKey(e, byId);
    const waypoints = key ? (layout.reroutes[key] ?? []) : [];
    const toMissing = missingIds.has(e.target);
    const quiet = e.kind === 'reference' || e.kind === 'include';
    const color = toMissing ? MISSING_COLOR : quiet ? colors.quiet : colors.flow;
    const dash = e.kind === 'tunnel' ? '8 5' : e.kind === 'thread' ? '2 5' : quiet || toMissing ? '5 5' : undefined;
    const style = { stroke: color, strokeWidth: e.inChoice ? 1.4 : 2.2, strokeDasharray: dash };
    const labelParts = [e.label, e.kind === 'tunnel' ? 'tunnel' : e.kind === 'thread' ? 'thread' : null];
    const label = labelParts.filter(Boolean).join(' ') || undefined;
    const sourceLine = e.sourceLine !== null && s.kind !== 'missing' ? relativeLine(e.sourceLine, s.startLine) : null;
    const targetLine = e.targetLine !== null && t.kind !== 'missing' ? relativeLine(e.targetLine, t.startLine) : null;
    const sourceHandle = sourceLine !== null ? `out:${sourceLine}` : 'out';
    const targetHandle = targetLine !== null ? `in:${targetLine}` : 'in';
    const ends = { markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }, label, labelStyle: { fill: colors.label, fontSize: 11 }, labelBgStyle: { fill: 'var(--panel)', fillOpacity: 0.9 } };

    if (waypoints.length === 0 || !key) {
      flowEdges.push({ id: e.id, source: e.source, target: e.target, sourceHandle, targetHandle, style, data: { key, index: 0 } satisfies FlowEdgeData, ...ends });
      continue;
    }
    let sides = dotSides.get(key);
    if (!sides) {
      sides = rerouteSides(nodeAnchor(e.source, 'out', sourceLine), waypoints, nodeAnchor(e.target, 'in', targetLine));
      dotSides.set(key, sides);
      waypoints.forEach((p, i) => flowNodes.push({ id: rerouteNodeId(key, i), type: 'reroute', position: p, data: { key, index: i }, draggable: true }));
    }
    const hops = [e.source, ...waypoints.map((_, i) => rerouteNodeId(key, i)), e.target];
    for (let i = 0; i < hops.length - 1; i++) {
      const last = i === hops.length - 2;
      flowEdges.push({
        id: `${e.id}#${i}`,
        source: hops[i]!,
        target: hops[i + 1]!,
        sourceHandle: i === 0 ? sourceHandle : rerouteHandle('out', sides[i - 1]!.out),
        targetHandle: last ? targetHandle : rerouteHandle('in', sides[i]!.in),
        style,
        data: { key, index: i } satisfies FlowEdgeData,
        ...(last ? ends : {}),
      });
    }
  }
  return { nodes: flowNodes, edges: flowEdges };
}

/**
 * A file line as an offset inside its segment. Clamped, not dropped: a duplicate knot name across two files
 * makes the parser attribute a divert to the first knot of that name, which can put the divert above the
 * segment it was blamed on. Both the handle ids and the rendered handles must agree about what to do with
 * that, or the edge names a handle the card never drew and React Flow refuses to route it.
 */
export function relativeLine(line: number, startLine: number): number {
  return Math.max(0, line - startLine);
}

function add(map: Map<string, Set<number>>, id: string, line: number): void {
  let set = map.get(id);
  if (!set) map.set(id, (set = new Set()));
  set.add(line);
}

export function edgeColorFor(theme: Theme): string {
  return theme === 'dark' ? '#7aa2ff' : '#3b5bdb';
}
