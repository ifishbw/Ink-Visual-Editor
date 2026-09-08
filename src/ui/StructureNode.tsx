/**
 * The canvas card: a compressed structure preview of one knot, in place of its raw ink.
 *
 * It is deliberately a different component from an editor-in-a-node. It never edits, it renders the same way
 * at every zoom (no level-of-detail switching), its row heights are fixed by `layoutRows` rather than by a
 * text layout engine, and it is cheap enough to mount for every knot on the canvas at once. Editing lives in
 * the docked editor; clicking a row sends the cursor there.
 *
 * Every row is a plain div, which is what buys free ellipsis truncation, free theming through CSS variables,
 * free hit testing, and text that stays sharp under React Flow's transform at any zoom.
 */
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef } from 'react';
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH } from '../model/layout';
import { nodeFxOf, parseRowFx, rowFxOf } from '../model/playFx';
import { DEFAULT_METRICS, barWidth, isTextRow, rowToLine, type KnotPreview, type PreviewRow, type RowGeometry } from '../model/preview';
import { usePlayStore } from '../store/playStore';
import { useProjectStore } from '../store/projectStore';
import { HEADER_HANDLE_TOP, handleTop, type KnotFlowNode } from './flow';
import { NodeHeader } from './NodeHeader';

export const StructureNode = memo(function StructureNode({ id, data, selected }: NodeProps<KnotFlowNode>) {
  const { node, view, preview, geom, collapsed, outLines, inLines } = data;
  const resizeNode = useProjectStore((s) => s.resizeNode);
  const moveNode = useProjectStore((s) => s.moveNode);
  const batch = useProjectStore((s) => s.batch);
  const fx = usePlayStore((s) => nodeFxOf(s, id));

  const compact = collapsed || node.kind === 'missing';
  const lineTop = (line: number) => handleTop(line, { compact, preview, geom });
  const playCls = fx.split(' ').filter(Boolean).map((k) => `play-${k}`);

  const cls = ['knot', node.kind, selected ? 'selected' : '', compact ? 'compact' : '', ...playCls].join(' ');
  return (
    <div className={cls}>
      {node.kind !== 'missing' && (
        /* Select a node, then drag any edge or corner. A hand-set height also decides how much the preview
           squeezes, so dragging a node taller is how you get its labels back on a very long knot. */
        <NodeResizer
          isVisible={selected === true}
          minWidth={MIN_NODE_WIDTH}
          minHeight={collapsed ? 32 : MIN_NODE_HEIGHT}
          onResizeEnd={(_, p) => {
            batch(`resize ${node.name}`, () => {
              moveNode(id, { x: p.x, y: p.y });
              resizeNode(id, { width: p.width, height: p.height });
            });
          }}
        />
      )}
      <Handle type="target" id="in" position={Position.Left} style={{ top: HEADER_HANDLE_TOP }} />
      {inLines.map((l) => (
        <Handle key={`in:${l}`} type="target" id={`in:${l}`} position={Position.Left} isConnectable={false} className="line-handle" style={{ top: lineTop(l) }} />
      ))}
      <NodeHeader id={id} data={data} />
      {!compact && <PreviewBody segId={node.id} preview={preview} geom={geom} stale={fx.includes('stale')} />}
      {/* A missing stub has no segment to append a divert to, so it gets no source handle: dragging from one
          would complete the gesture and then silently do nothing. */}
      {node.kind !== 'missing' && (
        <Handle type="source" id="out" position={Position.Right} style={{ top: HEADER_HANDLE_TOP }} title="Drag to another knot to add a divert" />
      )}
      {outLines.map((l) => (
        <Handle key={`out:${l}`} type="source" id={`out:${l}`} position={Position.Right} isConnectable={false} className="line-handle" style={{ top: lineTop(l) }} />
      ))}
    </div>
  );
});

function PreviewBody({ segId, preview, geom, stale }: { segId: string; preview: KnotPreview; geom: RowGeometry; stale: boolean }) {
  const setFocusLine = useProjectStore((s) => s.setFocusLine);
  const toggleBreakpoint = usePlayStore((s) => s.toggleBreakpoint);
  const rowsFx = usePlayStore((s) => rowFxOf(s, segId));
  const fx = parseRowFx(rowsFx);
  const host = useRef<HTMLDivElement>(null);
  useGeometryCanary(host, geom);

  return (
    <div className="knot-structure" ref={host} style={{ paddingTop: DEFAULT_METRICS.pad, paddingBottom: DEFAULT_METRICS.pad }}>
      {preview.rows.map((row, i) => (
        <Row
          key={i}
          row={row}
          height={geom.heights[i]!}
          showText={geom.showText}
          index={i}
          playClass={rowPlayClass(row, i, fx, stale)}
          onPick={() => setFocusLine(segId, rowToLine(preview, i))}
          onAltClick={() => toggleBreakpoint(segId, row.from)}
        />
      ))}
    </div>
  );
}

function rowPlayClass(row: PreviewRow, index: number, fx: ReturnType<typeof parseRowFx>, stale: boolean): string {
  const bits: string[] = [];
  if (fx.now.has(index)) bits.push('play-now');
  else if (fx.step.has(index)) bits.push('play-step');
  let bp = false;
  let covered = false;
  for (let L = row.from; L <= row.to; L++) {
    if (fx.bp.has(L)) bp = true;
    if (fx.cov.has(L)) covered = true;
  }
  if (bp) bits.push('play-bp');
  if (fx.dim && !stale && !covered && !fx.now.has(index)) bits.push('play-cold');
  return bits.join(' ');
}

function Row({
  row,
  height,
  showText,
  index,
  playClass,
  onPick,
  onAltClick,
}: {
  row: PreviewRow;
  height: number;
  showText: boolean;
  index: number;
  playClass: string;
  onPick: () => void;
  onAltClick: () => void;
}) {
  const own = row.name ?? row.text;
  const goes = row.targets?.length ? `→ ${row.targets.join(', ')}` : '';
  // A row with no words of its own reads as its destination. A row that has words shows both: the label gives
  // up space first, because "which choice is this" survives truncation and "where does it go" does not.
  const label = own || goes;
  const text = isTextRow(row) && showText && label !== '';
  // Choices, stitches and diverts are pure text rows. Prose and gathers keep their bar even when they carry a
  // divert as well, so a line of dialogue that ends in a jump still reports that it holds dialogue.
  const bar = row.chars > 0 && row.kind !== 'choice' && row.kind !== 'stitch' && row.kind !== 'divert';
  const width = `${(Math.min(barWidth(row.chars), text ? 0.32 : 1) * 100).toFixed(0)}%`;
  const cls = ['pv-row', `pv-${row.kind}`, row.cond ? 'pv-cond-on' : '', row.braceDepth > 0 ? 'pv-rail' : '', own ? '' : 'pv-target', playClass].join(' ');
  return (
    <div
      className={cls}
      data-row={index}
      data-line={row.from}
      style={{ height, paddingLeft: DEFAULT_METRICS.pad + row.depth * DEFAULT_METRICS.indent }}
      onClick={(e) => {
        if (e.altKey) {
          e.stopPropagation();
          e.preventDefault();
          onAltClick();
          return;
        }
        onPick();
      }}
      title={label || undefined}
    >
      <span className="pv-pip" />
      <span className="pv-mark" />
      {bar && <span className="pv-bar" style={{ width }} />}
      {text && <span className="pv-text">{label}</span>}
      {text && own !== '' && goes !== '' && <span className="pv-goto">{goes}</span>}
    </div>
  );
}

/**
 * Wire handles are placed from `geom.tops`, but the rows are laid out by the browser. If a CSS padding ever
 * drifts from the model the wires quietly stop meeting their rows, which is easy to miss and annoying to
 * debug. In dev, say so loudly; in a build this compiles away to nothing.
 */
function useGeometryCanary(host: React.RefObject<HTMLDivElement | null>, geom: RowGeometry) {
  useEffect(() => {
    if (!import.meta.env.DEV || !host.current) return;
    const rows = host.current.querySelectorAll<HTMLElement>('.pv-row');
    for (let i = 0; i < rows.length; i++) {
      const drift = rows[i]!.offsetTop - (geom.tops[i] ?? 0);
      if (Math.abs(drift) > 1) {
        console.warn(`preview geometry drift: row ${i} is ${drift}px off (model says ${geom.tops[i]}, DOM says ${rows[i]!.offsetTop})`);
        return;
      }
    }
  }, [host, geom]);
}
