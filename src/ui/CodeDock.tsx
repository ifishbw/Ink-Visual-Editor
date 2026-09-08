/**
 * The docked ink editor: the selected knot's raw source, beside the graph.
 *
 * Step 1 scaffolding. The canvas cards no longer hold a CodeMirror instance, so this is where ink is typed;
 * the CodeMirror wiring is lifted from the old in-node editor, keypress pitfalls included. Step 2 turns this
 * into the full expandable split view (resizable, its own toolbar); nothing here is meant to be final except
 * the seam it establishes -- `selectedId` picks the segment, `focus` picks the line.
 */
import { InkLanguageSupport } from '@mavnn/codemirror-lang-ink';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayStore } from '../store/playStore';
import { useProjectStore } from '../store/projectStore';
import { inkEditorTheme } from './inkTheme';
import { inkLinks, type LinkTargets } from './inkLinks';
import { useReveal } from './reveal';

const BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: false,
  highlightActiveLine: true,
  highlightActiveLineGutter: false,
  closeBrackets: false,
  autocompletion: false,
  indentOnInput: false,
  allowMultipleSelections: false,
  // The store owns undo. Leaving CodeMirror's history on would fight Ctrl+Z and
  // put whole-document value-syncs into a second stack.
  history: false,
  historyKeymap: false,
};

export function CodeDock() {
  const open = useProjectStore((s) => s.dockOpen);
  const setDockOpen = useProjectStore((s) => s.setDockOpen);
  const width = useProjectStore((s) => s.dockWidth);
  const setDockWidth = useProjectStore((s) => s.setDockWidth);
  const selectedId = useProjectStore((s) => s.selectedId);
  const focus = useProjectStore((s) => s.focus);
  const theme = useProjectStore((s) => s.theme);
  const editSegment = useProjectStore((s) => s.editSegment);
  const node = useProjectStore((s) => s.graph.nodes.find((n) => n.id === s.selectedId));
  const text = useProjectStore((s) => (s.selectedId === null ? '' : (s.texts[s.selectedId] ?? '')));
  const fontSize = useProjectStore((s) => s.codeFontSize);
  const setCodeFontSize = useProjectStore((s) => s.setCodeFontSize);
  const setFocusLine = useProjectStore((s) => s.setFocusLine);
  const canUndo = useProjectStore((s) => s.canUndo);
  const canRedo = useProjectStore((s) => s.canRedo);
  const undoLabel = useProjectStore((s) => s.undoLabel);
  const redoLabel = useProjectStore((s) => s.redoLabel);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const historyEpoch = useProjectStore((s) => s.historyEpoch);
  const graph = useProjectStore((s) => s.graph);
  const parse = useProjectStore((s) => s.parse);
  const reveal = useReveal();

  /**
   * The line a name sits on inside the knot on screen: a stitch header or a weave label. The parser knows both
   * names but only stitches carry a line, so the label's line is found in the text we are already showing.
   */
  const internalLine = (name: string): number | null => {
    if (node === undefined || node.kind === 'missing') return null;
    const knot = parse?.knots.find((k) => k.name === node.name);
    if (!knot || (!knot.stitches.includes(name) && !knot.labels.includes(name))) return null;
    const where = new RegExp(String.raw`^[ \t]*=[ \t]*${name}\b|\([ \t]*${name}[ \t]*\)`);
    const at = text.split('\n').findIndex((l) => where.test(l));
    return at < 0 ? null : at;
  };

  /**
   * Following a divert: show the knot it names in the dock, put the cursor where it actually lands, and fly the
   * canvas over to it. Targets inside the knot on screen just move the cursor -- there is nowhere to fly to.
   * Held in a ref so the editor extensions never have to be rebuilt: rebuilding them would remount the editor
   * and drop the caret.
   */
  const links = useRef<LinkTargets>({ resolves: () => false, follow: () => {} });
  links.current = {
    resolves(target) {
      const head = target.split('.')[0] ?? '';
      return graph.nodes.some((n) => n.name === head) || internalLine(head) !== null;
    },
    follow(target) {
      const [head = '', stitch] = target.split('.');
      const hit = graph.nodes.find((n) => n.name === head);
      if (!hit) {
        const at = internalLine(head);
        if (at !== null && selectedId !== null) setFocusLine(selectedId, at);
        return;
      }
      const line = stitch ? parse?.knots.find((k) => k.name === head)?.stitchLines[stitch] : undefined;
      // Focus first: it sets the selection too, so the canvas's own selection change then finds nothing to do
      // and leaves the cursor where we just put it.
      setFocusLine(hit.id, line === undefined ? 0 : Math.max(0, line - hit.startLine));
      reveal(hit.id);
    },
  };

  // The instance lives in state, not a ref: CodeMirror is created on a second render pass, so an effect that
  // read a ref would find it null on the commit that mounts it and never retry.
  const [view, setView] = useState<EditorView | null>(null);
  const extensions = useMemo(() => [InkLanguageSupport(), ...inkEditorTheme(theme, fontSize), ...inkLinks(links)], [theme, fontSize]);
  const onChange = useCallback((value: string) => selectedId !== null && editSegment(selectedId, value), [editSegment, selectedId]);
  const onUpdate = useCallback(
    (vu: { selectionSet: boolean; docChanged: boolean; state: { doc: { lineAt: (n: number) => { number: number } }; selection: { main: { head: number } } } }) => {
      if (!vu.selectionSet && !vu.docChanged) return;
      if (selectedId === null) {
        usePlayStore.getState().setCaret(null);
        return;
      }
      const line = vu.state.doc.lineAt(vu.state.selection.main.head).number - 1;
      usePlayStore.getState().setCaret(selectedId, line);
    },
    [selectedId],
  );

  useEffect(() => {
    if (selectedId === null) usePlayStore.getState().setCaret(null);
  }, [selectedId]);

  // Clicking a preview row lands the cursor on that row's first source line. Undo also
  // arrives through `focus`, with an optional column so the caret does not snap to 0.
  useEffect(() => {
    if (!view || !view.dom.isConnected || !focus || focus.segId !== selectedId) return;
    const line = view.state.doc.line(Math.min(focus.line + 1, view.state.doc.lines));
    const pos = Math.min(line.from + (focus.offset ?? 0), line.to);
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    view.focus();
  }, [view, focus, selectedId]);

  if (!open) {
    return (
      <aside className="dock closed">
        <button className="tab" title="Show the editor" onClick={() => setDockOpen(true)}>
          ‹ ink
        </button>
      </aside>
    );
  }
  const editable = node !== undefined && node.kind !== 'missing' && selectedId !== null;
  return (
    <aside className="dock" style={{ width }}>
      {/* Drag the divider to trade canvas for writing room. */}
      <div
        className="dock-grip"
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          const startX = e.clientX;
          const startWidth = width;
          const onMove = (ev: PointerEvent) => setDockWidth(startWidth + (startX - ev.clientX));
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        }}
      />
      <header>
        <span className="label">ink</span>
        <span className="name mono">{node ? node.name : 'no knot selected'}</span>
        {node && (
          <span className="file mono" title={node.file}>
            {node.file}
          </span>
        )}
        <span className="fontsize">
          <button className="tab" title="Smaller text" onClick={() => setCodeFontSize(fontSize - 1)}>
            A-
          </button>
          <button className="tab" title="Larger text" onClick={() => setCodeFontSize(fontSize + 1)}>
            A+
          </button>
        </span>
        <span title={canUndo ? `Undo ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}>
          <button className="tab" disabled={!canUndo} aria-label={canUndo ? `Undo ${undoLabel}` : 'Nothing to undo'} onClick={undo}>
            ↶
          </button>
        </span>
        <span title={canRedo ? `Redo ${redoLabel} (Ctrl+Y)` : 'Nothing to redo'}>
          <button className="tab" disabled={!canRedo} aria-label={canRedo ? `Redo ${redoLabel}` : 'Nothing to redo'} onClick={redo}>
            ↷
          </button>
        </span>
        <button className="tab" title="Hide the editor" onClick={() => setDockOpen(false)}>
          ›
        </button>
      </header>
      {editable ? (
        <div className="dock-editor" onKeyDown={stopKeys}>
          {/* `key` remounts when the knot changes or undo rewrites this knot's text. A reused
              EditorView would treat a store-driven value replace as a user edit (and, when CM
              history was on, as an undo step of the previous knot). */}
          <CodeMirror key={`${selectedId}:${historyEpoch}`} value={text} onChange={onChange} onUpdate={onUpdate} extensions={extensions} basicSetup={BASIC_SETUP} theme="none" onCreateEditor={setView} />
        </div>
      ) : (
        <p className="muted pad">Select a knot on the canvas, or click one of its preview rows, to edit its ink here.</p>
      )}
    </aside>
  );
}

/**
 * Keep the app's key handling out of the editor. This must run on the bubble phase: React listens at the root
 * container, so stopping in the capture phase would end the native event before CodeMirror's own keydown
 * handler ever saw it and no keymap binding would fire -- Tab included. Ctrl+S is caught by a window capture
 * listener, ahead of both.
 */
function stopKeys(e: React.KeyboardEvent) {
  e.stopPropagation();
}
