import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { withPlayEdgeClasses } from '../model/playMap';
import { isValidKnotName } from '../model/ops';
import { usePlayStore } from '../store/playStore';
import { useProjectStore } from '../store/projectStore';
import { askText, confirmDeleteKnots } from './Dialog';
import { parseRerouteId, toFlow, REROUTE_SIZE, type FlowEdgeData, type FlowNode, type KnotFlowNode } from './flow';
import { StructureNode } from './StructureNode';
import { RerouteNode } from './RerouteNode';

const nodeTypes: NodeTypes = { knot: StructureNode, reroute: RerouteNode };

export function Canvas() {
  const graph = useProjectStore((s) => s.graph);
  const positions = useProjectStore((s) => s.positions);
  const views = useProjectStore((s) => s.views);
  const layout = useProjectStore((s) => s.layout);
  const hiddenFiles = useProjectStore((s) => s.hiddenFiles);
  const showFunctions = useProjectStore((s) => s.showFunctions);
  const theme = useProjectStore((s) => s.theme);
  const root = useProjectStore((s) => s.root);
  const moveNode = useProjectStore((s) => s.moveNode);
  const setViewport = useProjectStore((s) => s.setViewport);
  const addDivert = useProjectStore((s) => s.addDivert);
  const createKnot = useProjectStore((s) => s.createKnot);
  const deleteKnot = useProjectStore((s) => s.deleteKnot);
  const addWaypoint = useProjectStore((s) => s.addWaypoint);
  const removeWaypoint = useProjectStore((s) => s.removeWaypoint);
  const setSelected = useProjectStore((s) => s.setSelected);
  const batch = useProjectStore((s) => s.batch);
  const reveal = useProjectStore((s) => s.reveal);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const rf = useReactFlow();
  const fittedFor = useRef<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectHint, setConnectHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHint = useCallback((msg: string) => {
    setConnectHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setConnectHint(null), 2500);
  }, []);

  // Derive React Flow nodes/edges from the store; keep the user's selection across rebuilds.
  useEffect(() => {
    const flow = toFlow({ graph, positions, views, layout, hiddenFiles, showFunctions, theme });
    setNodes((prev) => {
      const selected = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return flow.nodes.map((n) => ({ ...n, selected: selected.has(n.id) }) as FlowNode);
    });
    setEdges(withPlayEdgeClasses(flow.edges, usePlayStore.getState().edgeFx));
  }, [graph, positions, views, layout, hiddenFiles, showFunctions, theme, setNodes, setEdges]);

  const edgeFx = usePlayStore((s) => s.edgeFx);
  useEffect(() => {
    setEdges((prev) => withPlayEdgeClasses(prev, edgeFx));
  }, [edgeFx, setEdges]);

  // First view of a project: restore the saved viewport or fit everything.
  useEffect(() => {
    if (!root || graph.nodes.length === 0 || fittedFor.current === root) return;
    fittedFor.current = root;
    const saved = layout.viewport;
    const t = setTimeout(() => {
      if (saved) void rf.setViewport(saved);
      else void rf.fitView({ padding: 0.15 });
    }, 80);
    return () => clearTimeout(t);
  }, [root, graph, layout.viewport, rf]);

  // Undo/redo of an off-screen change pans to it without changing zoom (the camera is not undoable).
  // Selection goes through our own setNodes so it cannot race React Flow's store behind the derive effect.
  useEffect(() => {
    if (!reveal) return;
    const zoom = rf.getZoom();
    const vp = rf.getViewport();
    let cx: number | null = null;
    let cy: number | null = null;
    const dot = parseRerouteId(reveal.id);
    if (dot) {
      const p = layout.reroutes[dot.key]?.[dot.index];
      if (p) {
        cx = p.x + REROUTE_SIZE / 2;
        cy = p.y + REROUTE_SIZE / 2;
      }
    } else {
      const pos = positions[reveal.id];
      const size = views[reveal.id]?.size;
      if (pos && size) {
        cx = pos.x + size.width / 2;
        cy = pos.y + size.height / 2;
      }
    }
    if (cx !== null && cy !== null) {
      const screenX = cx * vp.zoom + vp.x;
      const screenY = cy * vp.zoom + vp.y;
      const host = document.querySelector('.canvas-host');
      const r = host?.getBoundingClientRect();
      const pad = 48;
      const left = r?.left ?? 0;
      const top = r?.top ?? 0;
      const right = r?.right ?? window.innerWidth;
      const bottom = r?.bottom ?? window.innerHeight;
      const visible = screenX > left + pad && screenX < right - pad && screenY > top + pad && screenY < bottom - pad;
      if (!visible) void rf.setCenter(cx, cy, { zoom, duration: 280 });
    }
    if (reveal.focusDock && !parseRerouteId(reveal.id)) {
      setNodes((ns) => ns.map((node) => ({ ...node, selected: node.id === reveal.id })));
      setSelected(reveal.id);
    }
  }, [reveal, rf, setSelected, setNodes, positions, views, layout.reroutes]);

  // Dragging a connection from A's header handle to B appends `-> B` to A's text.
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      const target = graph.nodes.find((n) => n.id === c.target);
      if (!target || target.kind === 'preamble') return;
      addDivert(c.source, target.name);
    },
    [graph, addDivert],
  );

  const onConnectStart = useCallback(() => setConnecting(true), []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: { isValid: boolean | null; fromNode: { id: string; type?: string } | null; toNode: { id: string; type?: string } | null }) => {
      setConnecting(false);
      if (state.isValid) return;
      const fromId = state.fromNode?.id;
      if (!fromId || state.fromNode?.type === 'reroute') {
        showHint('Drop on another knot to add a divert');
        return;
      }
      const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0]! : event;
      const hit = document.elementFromPoint(clientX, clientY)?.closest('.react-flow__node');
      const toId = state.toNode?.id ?? hit?.getAttribute('data-id');
      if (!toId || toId === fromId || hit?.classList.contains('react-flow__node-reroute')) {
        showHint('Drop on another knot to add a divert');
        return;
      }
      const target = graph.nodes.find((n) => n.id === toId);
      if (!target || target.kind === 'preamble') {
        showHint('Drop on another knot to add a divert');
        return;
      }
      addDivert(fromId, target.name);
    },
    [graph, addDivert, showHint],
  );

  // The dock follows the selected knot. Selecting only reroute dots must not clear it: that would
  // remount the editor just because the user grabbed a wire's waypoint.
  const onSelectionChange = useCallback(
    ({ nodes: picked }: { nodes: FlowNode[] }) => {
      const knot = picked.find((n) => n.type === 'knot');
      if (knot) setSelected(knot.id);
      else if (picked.length === 0) setSelected(null);
    },
    [setSelected],
  );

  // Double-click on empty canvas creates a knot there.
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // The pane contains the viewport, so nodes and edges are inside it too: only react to truly empty space.
      const t = e.target as HTMLElement;
      if (!t.closest('.react-flow__pane') || t.closest('.react-flow__node, .react-flow__edge, .react-flow__edgelabel-renderer, .react-flow__controls, .react-flow__minimap')) return;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      void (async () => {
        const name = await askText({
          title: 'New knot',
          placeholder: 'name',
          submitLabel: 'Create',
          hint: 'You can also type === name === in the editor to split a knot.',
          validate: (v) => (isValidKnotName(v) ? null : 'Letters, digits and _ only'),
        });
        if (!name) return;
        const result = createKnot(name, pos);
        if (!result.includes('#')) showHint(result);
      })();
    },
    [createKnot, rf, showHint],
  );

  // Double-click on an edge inserts a reroute dot there.
  const onEdgeDoubleClick = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      const data = edge.data as FlowEdgeData | undefined;
      if (!data?.key) return;
      addWaypoint(data.key, data.index, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [addWaypoint, rf],
  );

  // Delete removes selected reroute dots silently and selected knots after confirmation (editors stop this key).
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Delete') return;
      const selected = rf.getNodes().filter((n) => n.selected);
      const dots = selected.map((n) => parseRerouteId(n.id)).filter((d): d is { key: string; index: number } => d !== null);
      const knots = selected.filter((n) => n.type === 'knot' && (n as KnotFlowNode).data.node.kind === 'knot');
      if (dots.length === 0 && knots.length === 0) return;
      e.preventDefault();
      void (async () => {
        if (knots.length > 0) {
          const names = knots.map((n) => (n as KnotFlowNode).data.node.name);
          if (!(await confirmDeleteKnots(names))) return;
        }
        batch(knots.length ? `delete ${knots.length === 1 ? 'knot' : `${knots.length} knots`}` : 'remove waypoint', () => {
          dots.sort((a, b) => b.index - a.index).forEach((d) => removeWaypoint(d.key, d.index));
          knots.forEach((n) => deleteKnot(n.id));
        });
      })();
    },
    [rf, deleteKnot, removeWaypoint, batch],
  );

  const setZoomVar = useCallback((zoom: number) => {
    const host = document.querySelector('.canvas-host') as HTMLElement | null;
    host?.style.setProperty('--canvas-zoom', String(zoom));
  }, []);

  return (
    <div className={`canvas-host${connecting ? ' connecting' : ''}`} onDoubleClick={onDoubleClick} onKeyDown={onKeyDown}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        colorMode={theme}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        connectionRadius={80}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onNodeDragStop={(_, __, dragged) => {
          if (dragged.length === 0) return;
          const label = dragged.length > 1 ? `move ${dragged.length} nodes` : 'move node';
          batch(label, () => dragged.forEach((n) => moveNode(n.id, n.position)));
        }}
        onSelectionChange={onSelectionChange}
        onMove={(_, viewport) => setZoomVar(viewport.zoom)}
        onMoveEnd={(_, viewport) => {
          setZoomVar(viewport.zoom);
          setViewport(viewport);
        }}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        panOnScroll
        selectionOnDrag={false}
        minZoom={0.05}
        maxZoom={2}
        edgesFocusable={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(n) => (n.type === 'reroute' ? 'transparent' : (n as KnotFlowNode).data.view.color)} nodeStrokeWidth={2} />
      </ReactFlow>
      {connectHint && <div className="canvas-toast">{connectHint}</div>}
    </div>
  );
}
