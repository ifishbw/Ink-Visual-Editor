/**
 * The coloured strip at the top of a canvas card: name, badges, file, and the card's own actions.
 * Extracted so the structure preview and any future node type share one header instead of copying it.
 */
import { headerFxOf, parseHeaderFx } from '../model/playFx';
import { usePlayStore } from '../store/playStore';
import { useProjectStore } from '../store/projectStore';
import { confirmDeleteKnots } from './Dialog';
import type { KnotNodeData } from './flow';

export function NodeHeader({ id, data }: { id: string; data: KnotNodeData }) {
  const { node, view, collapsed, sized } = data;
  const deleteKnot = useProjectStore((s) => s.deleteKnot);
  const createMissing = useProjectStore((s) => s.createMissing);
  const toggleCollapsed = useProjectStore((s) => s.toggleCollapsed);
  const resizeNode = useProjectStore((s) => s.resizeNode);
  const hdr = usePlayStore((s) => headerFxOf(s, id));
  const play = parseHeaderFx(hdr);

  if (node.kind === 'missing') {
    return (
      <div className="knot-header" style={{ background: view.color }}>
        <span className="name">missing: {node.name}</span>
        <button className="nodrag act" title="Create this knot" onClick={() => createMissing(node.id)}>
          + create
        </button>
      </div>
    );
  }

  const { flags } = node;
  return (
    <div className="knot-header" style={{ background: view.color }}>
      <button className="nodrag act toggle" title={collapsed ? 'Expand' : 'Collapse'} onClick={() => toggleCollapsed(node.id)}>
        {collapsed ? '▸' : '▾'}
      </button>
      <span className="name">{node.name}</span>
      <span className="badges">
        {play.now && <b title="playhead">▶</b>}
        {play.cov && <b title="session line coverage">{play.cov}</b>}
        {play.visits != null && play.visits > 0 && <b title="visit count this session">{play.visits}×</b>}
        {node.isFunction && <b title="function knot">ƒ</b>}
        {node.stitches.length > 0 && <b title={node.stitches.join(', ')}>{node.stitches.length} st</b>}
        {flags.end && <b title="diverts to END">END</b>}
        {flags.done && <b title="diverts to DONE">DONE</b>}
        {flags.loops > 0 && <b title="diverts to itself">↻{flags.loops}</b>}
        {flags.dynamic.length > 0 && <b title={`dynamic target: ${flags.dynamic.join(', ')}`}>→?</b>}
        {node.errorCount > 0 && (
          <b className="err" title="errors in this knot">
            ⚠{node.errorCount}
          </b>
        )}
      </span>
      <span className="file" title={node.file}>
        {node.file}
      </span>
      {sized && (
        <button className="nodrag act" title="Back to automatic size" onClick={() => resizeNode(id, null)}>
          ⤡
        </button>
      )}
      {node.kind === 'knot' && (
        <button
          type="button"
          className="nodrag act"
          title="Delete this knot and its text"
          onClick={(e) => {
            e.stopPropagation();
            void (async () => {
              if (await confirmDeleteKnots([node.name])) deleteKnot(node.id);
            })();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
