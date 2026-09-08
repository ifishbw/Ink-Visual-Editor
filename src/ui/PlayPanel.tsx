/**
 * Play panel: fourth grid column. Compiles unsaved ink, runs it, paints a truthful playhead.
 * Camera copies Canvas.tsx's setCenter pattern — never useReveal (that rewrites selection and zoom).
 */
import { useReactFlow } from '@xyflow/react';
import { useCallback, useEffect, useRef } from 'react';
import { usePlayStore } from '../store/playStore';
import { useProjectStore } from '../store/projectStore';
import { PlayInspect } from './PlayInspect';

function usePlayCamera(): (segId: string) => void {
  const rf = useReactFlow();
  return useCallback(
    (segId: string) => {
      const { positions, views, graph, hiddenFiles, showFunctions } = useProjectStore.getState();
      const node = graph.nodes.find((n) => n.id === segId);
      if (node && (hiddenFiles[node.file] || (!showFunctions && node.isFunction))) return;
      const pos = positions[segId];
      const size = views[segId]?.size;
      if (!pos || !size) return;
      const cx = pos.x + size.width / 2;
      const cy = pos.y + size.height / 2;
      const vp = rf.getViewport();
      const screenX = cx * vp.zoom + vp.x;
      const screenY = cy * vp.zoom + vp.y;
      const r = document.querySelector('.canvas-host')?.getBoundingClientRect();
      const pad = 48;
      const onScreen =
        screenX > (r?.left ?? 0) + pad &&
        screenX < (r?.right ?? window.innerWidth) - pad &&
        screenY > (r?.top ?? 0) + pad &&
        screenY < (r?.bottom ?? window.innerHeight) - pad;
      if (onScreen) return;
      void rf.setCenter(cx, cy, { zoom: rf.getZoom(), duration: 280 });
    },
    [rf],
  );
}

export function PlayPanel() {
  const open = usePlayStore((s) => s.open);
  const width = usePlayStore((s) => s.width);
  const setOpen = usePlayStore((s) => s.setOpen);
  const setWidth = usePlayStore((s) => s.setWidth);
  const status = usePlayStore((s) => s.status);
  const startLabel = usePlayStore((s) => s.startLabel);
  const startPath = usePlayStore((s) => s.startPath);
  const notes = usePlayStore((s) => s.notes);
  const lines = usePlayStore((s) => s.lines);
  const choices = usePlayStore((s) => s.choices);
  const caret = usePlayStore((s) => s.caret);
  const followCamera = usePlayStore((s) => s.followCamera);
  const followDock = usePlayStore((s) => s.followDock);
  const dim = usePlayStore((s) => s.dim);
  const recording = usePlayStore((s) => s.recording);
  const paint = usePlayStore((s) => s.paint);
  const peekId = usePlayStore((s) => s.peekId);
  const peekSeq = usePlayStore((s) => s.peekSeq);
  const staleOnPath = usePlayStore((s) => s.staleOnPath);
  const run = usePlayStore((s) => s.run);
  const restart = usePlayStore((s) => s.restart);
  const step = usePlayStore((s) => s.step);
  const back = usePlayStore((s) => s.back);
  const runToCursor = usePlayStore((s) => s.runToCursor);
  const choose = usePlayStore((s) => s.choose);
  const replay = usePlayStore((s) => s.replay);
  const clickBadge = usePlayStore((s) => s.clickBadge);
  const clickNote = usePlayStore((s) => s.clickNote);
  const setToggle = usePlayStore((s) => s.setToggle);
  const setStubValue = usePlayStore((s) => s.setStubValue);
  const stubbed = usePlayStore((s) => s.stubbed);
  const graph = useProjectStore((s) => s.graph);
  const focus = useProjectStore((s) => s.focus);
  const camera = usePlayCamera();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (!followCamera) return;
    if (paint.level !== 'row' && paint.level !== 'card') return;
    camera(paint.segId);
  }, [paint, followCamera, camera]);

  useEffect(() => {
    if (peekId) camera(peekId);
  }, [peekId, peekSeq, camera]);

  useEffect(() => {
    if (!stick.current || !scroller.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [lines, choices]);

  if (!open) {
    return (
      <aside className="play closed">
        <button className="tab play-open" title="Show the player" onClick={() => setOpen(true)}>
          ▶ Play
        </button>
      </aside>
    );
  }

  const playing = status === 'running' || status === 'paused';
  const canRun = status !== 'compiling';
  const hasAim = caret !== null || focus !== null;
  const knots = graph.nodes.filter((n) => n.kind === 'knot');
  const ended = status === 'ended';

  const startFrom = (value: string) => {
    if (value === '') run({ kind: 'story' });
    else run({ kind: 'knot', name: value });
  };

  return (
    <aside className="play" style={{ width }}>
      <div
        className="play-grip"
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          const startX = e.clientX;
          const startW = width;
          const onMove = (ev: PointerEvent) => setWidth(startW + (startX - ev.clientX));
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        }}
      />
      <header className="play-toolbar">
        <button className="tab" title="Run / Restart from the current start point (Ctrl+Enter)" disabled={!canRun} onClick={() => (playing || ended ? restart() : startPath ? run({ kind: 'knot', name: startPath }) : run({ kind: 'story' }))}>
          ▶ Run
        </button>
        <button className="tab" title="Restart" disabled={!playing && !ended} onClick={() => restart()}>
          ⟲
        </button>
        <button className="tab" title="Step one Continue() (Alt+→)" disabled={!playing} onClick={() => step()}>
          ⏭
        </button>
        <button className="tab" title="Back one Continue() (Alt+Backspace)" disabled={!playing} onClick={() => back()}>
          ⏴
        </button>
        <button
          className="tab"
          title={hasAim ? 'Run to cursor' : 'Put the cursor in the editor, or click a preview row'}
          disabled={!hasAim || status === 'compiling'}
          onClick={() => runToCursor()}
        >
          ⤓
        </button>
        <select
          className="play-from"
          title={`Start from: ${startLabel}`}
          value={startPath ?? ''}
          onChange={(e) => startFrom(e.target.value)}
        >
          <option value="">Story start</option>
          {knots.map((n) => (
            <option
              key={n.id}
              value={n.name}
              disabled={n.isFunction}
              title={n.isFunction ? 'Function knots are not runnable' : undefined}
            >
              {n.isFunction ? `ƒ ${n.name}` : n.name}
            </option>
          ))}
        </select>
        <button className="tab" title="Hide the player" onClick={() => setOpen(false)}>
          ✕
        </button>
      </header>

      {status === 'compiling' && <p className="play-status info">Compiling…</p>}
      {notes.length > 0 && (
        <ul className={`play-notes ${staleOnPath ? 'on-path' : ''}`}>
          {notes.map((n, i) => (
            <li key={i} className={n.kind}>
              {n.action ? (
                <button type="button" onClick={() => clickNote(n)}>
                  {n.text}
                </button>
              ) : n.text.includes('stubbed →') ? (
                <StubNote text={n.text} stubbed={stubbed} onSet={setStubValue} />
              ) : (
                n.text
              )}
            </li>
          ))}
        </ul>
      )}

      <div
        className="play-transcript"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {lines.map((ln, i) => (
          <div key={i} className={`play-line ${ln.fault ? 'fault' : ''}`}>
            {ln.turn > 0 && (i === 0 || lines[i - 1]!.turn !== ln.turn) && <div className="play-turn">┈ turn {ln.turn} ┈</div>}
            {ln.text !== '' && <span className="body">{ln.text}</span>}
            {ln.tags.map((t) => (
              <span key={t} className="tag">
                # {t}
              </span>
            ))}
            {ln.notice && (
              <div className="notice">
                {ln.notice}{' '}
                <button type="button" className="tab" onClick={() => replay()}>
                  ⟳ Replay
                </button>
              </div>
            )}
            {ln.jumpNote && <div className="jump">{ln.jumpNote}</div>}
            {ln.fault && <div className="fault-text">{ln.fault}</div>}
            {ln.at && (
              <button type="button" className="badge" onClick={() => clickBadge(ln.at!)}>
                {ln.at.file}:{ln.at.line}
              </button>
            )}
          </div>
        ))}
        {ended && <div className="play-end">■ END</div>}
        {choices.length > 0 && (
          <div className="play-choices">
            {choices.map((c) => (
              <button key={c.index} type="button" onClick={() => choose(c.index)}>
                ▸ {c.index + 1} {c.text}
              </button>
            ))}
          </div>
        )}
      </div>

      <PlayInspect />

      <footer className="play-footer">
        <label>
          <input type="checkbox" checked={followCamera} onChange={(e) => setToggle('camera', e.target.checked)} /> follow camera
        </label>
        <label>
          <input type="checkbox" checked={followDock} onChange={(e) => setToggle('dock', e.target.checked)} /> follow editor
        </label>
        <label>
          <input type="checkbox" checked={dim} onChange={(e) => setToggle('dim', e.target.checked)} /> dim unvisited
        </label>
        <span className="rec">
          ⏺ {recording.length} actions
          <button type="button" className="tab" disabled={recording.length === 0} onClick={() => replay()}>
            ⟳ Replay
          </button>
        </span>
      </footer>
    </aside>
  );
}

function StubNote({ text, stubbed, onSet }: { text: string; stubbed: { name: string; value: number }[]; onSet: (name: string, v: number) => void }) {
  const m = /^(\S+)\(\) stubbed →/.exec(text);
  const name = m?.[1];
  const stub = stubbed.find((s) => s.name === name);
  if (!name || !stub) return <>{text}</>;
  return (
    <span>
      {name}() stubbed →{' '}
      <input
        className="play-stub"
        type="number"
        value={stub.value}
        onChange={(e) => onSet(name, Number(e.target.value))}
      />
    </span>
  );
}
