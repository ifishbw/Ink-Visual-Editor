/**
 * Variables, Coverage and Breakpoints drawers for the Play panel.
 */
import { useMemo, useState } from 'react';
import { usePlayStore } from '../store/playStore';
import { useProjectStore } from '../store/projectStore';

export function PlayInspect() {
  const vars = usePlayStore((s) => s.vars);
  const varsOpen = usePlayStore((s) => s.varsOpen);
  const coverageOpen = usePlayStore((s) => s.coverageOpen);
  const bpOpen = usePlayStore((s) => s.bpOpen);
  const setDrawer = usePlayStore((s) => s.setDrawer);
  const setVar = usePlayStore((s) => s.setVar);
  const toggleWatch = usePlayStore((s) => s.toggleWatch);
  const watchNames = usePlayStore((s) => s.watchNames);
  const visits = usePlayStore((s) => s.visits);
  const covHits = usePlayStore((s) => s.covHits);
  const covTotal = usePlayStore((s) => s.covTotal);
  const staleSegs = usePlayStore((s) => s.staleSegs);
  const breakpoints = usePlayStore((s) => s.breakpoints);
  const toggleBreakpoint = usePlayStore((s) => s.toggleBreakpoint);
  const caret = usePlayStore((s) => s.caret);
  const revealNode = usePlayStore((s) => s.revealNode);
  const graph = useProjectStore((s) => s.graph);
  const [filter, setFilter] = useState('');

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? vars.filter((v) => v.name.toLowerCase().includes(q)) : vars;
  }, [vars, filter]);

  const knots = graph.nodes.filter((n) => n.kind === 'knot' && !n.isFunction);
  const neverVisited = knots.filter((n) => (visits[n.id] ?? 0) === 0);
  const coveredKnots = knots.filter((n) => (visits[n.id] ?? 0) > 0);
  const lineHits = Object.values(covHits).reduce((a, b) => a + b, 0);
  const lineTotal = Object.values(covTotal).reduce((a, b) => a + b, 0);
  const bpList: { segId: string; relLine: number; stale: boolean }[] = [];
  for (const [segId, lines] of Object.entries(breakpoints)) {
    for (const relLine of lines) bpList.push({ segId, relLine, stale: staleSegs.includes(segId) });
  }

  return (
    <div className="play-inspect">
      <section>
        <button className="play-twist" onClick={() => setDrawer('vars', !varsOpen)}>
          {varsOpen ? '▾' : '▸'} Variables ({vars.length})
        </button>
        {varsOpen && (
          <div className="play-vars">
            <input className="play-filter" placeholder="filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <p className="play-hint">CONSTs are compile-time literals and do not appear here.</p>
            {shown.map((v) => (
              <div key={v.name} className={`play-var ${v.delta ? 'changed' : ''} ${v.kind === 'locked' ? 'locked' : ''}`}>
                <button className="play-watch" title="Break when this variable changes" onClick={() => toggleWatch(v.name)}>
                  {watchNames.includes(v.name) ? '⚑' : '⚐'}
                </button>
                <span className="name" title={v.name}>
                  {v.name}
                </span>
                {v.kind === 'locked' ? (
                  <span className="val" title="LIST and divert-target variables can't be edited here — play from the start to set them.">
                    {v.value} (locked)
                  </span>
                ) : (
                  <input
                    className="val"
                    defaultValue={v.value}
                    key={`${v.name}:${v.value}`}
                    onBlur={(e) => {
                      if (e.target.value !== v.value) setVar(v.name, e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                )}
                {v.delta && <span className="delta">▲ {v.delta}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <button className="play-twist" onClick={() => setDrawer('coverage', !coverageOpen)}>
          {coverageOpen ? '▾' : '▸'} Coverage {knots.length ? `${coveredKnots.length}/${knots.length} knots` : ''}
          {lineTotal ? ` · ${lineTotal ? Math.round((100 * lineHits) / lineTotal) : 0}% lines` : ''}
        </button>
        {coverageOpen && (
          <div className="play-cov">
            <p className="play-hint" title="Session coverage does not rewind with Back — it means what this session has explored.">
              Never visited this session — click to reveal. Coverage for edited knots reads — until Restart.
            </p>
            {neverVisited.length === 0 && <p className="muted">Every knot has been entered at least once.</p>}
            {neverVisited.map((n) => (
              <button key={n.id} className="play-cov-item" onClick={() => revealNode(n.id)}>
                {n.name}
                <span className="file">{n.file}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <button className="play-twist" onClick={() => setDrawer('bp', !bpOpen)}>
          {bpOpen ? '▾' : '▸'} Breakpoints ({bpList.length})
        </button>
        {bpOpen && (
          <div className="play-bps">
            <button
              className="play-add-bp"
              disabled={!caret}
              title={caret ? 'Arm a breakpoint on the dock cursor line' : 'Put the cursor in the editor first'}
              onClick={() => caret && toggleBreakpoint(caret.segId, caret.relLine)}
            >
              + add from cursor
            </button>
            {bpList.map((b) => {
              const node = graph.nodes.find((n) => n.id === b.segId);
              return (
                <div key={`${b.segId}:${b.relLine}`} className={`play-bp-row ${b.stale ? 'stale' : ''}`}>
                  <button
                    className="play-cov-item"
                    title={b.stale ? 'this line has moved since the run started — Restart to re-anchor' : undefined}
                    onClick={() => revealNode(b.segId)}
                  >
                    {node?.name ?? b.segId} : {b.relLine + 1}
                    {b.stale ? ' (moved)' : ''}
                  </button>
                  <button className="play-x" onClick={() => toggleBreakpoint(b.segId, b.relLine)} title="Remove">
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
