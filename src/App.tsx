import { ReactFlowProvider } from '@xyflow/react';
import { useEffect } from 'react';
import { httpFS } from './fs/client';
import { usePlayStore } from './store/playStore';
import { useProjectStore } from './store/projectStore';
import { Canvas } from './ui/Canvas';
import { CodeDock } from './ui/CodeDock';
import { DialogHost } from './ui/Dialog';
import { PlayPanel } from './ui/PlayPanel';
import { Sidebar } from './ui/Sidebar';

export function App() {
  const open = useProjectStore((s) => s.open);
  const fileChanged = useProjectStore((s) => s.fileChanged);
  const saveAll = useProjectStore((s) => s.saveAll);
  const theme = useProjectStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Open the project named in ?root=, or the last one used. Popstate covers back/forward after Open.
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('root');
    let last: string | null = null;
    try {
      last = localStorage.getItem('inkvisual:lastRoot');
    } catch {
      /* storage unavailable */
    }
    const root = fromQuery ?? last;
    if (root) void open(root);
    const onPop = () => {
      const q = new URLSearchParams(window.location.search).get('root');
      if (q) void open(q);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open]);

  // Reload when files change on disk (Inky, VS Code, git...).
  useEffect(() => httpFS.onChange((e) => void fileChanged(e.path, e.hash)), [fileChanged]);

  // Desktop only: File > Open Project… in the native menu. open() already records the last root
  // and replaces ?root= in the URL, exactly as the sidebar's Open button does.
  useEffect(() => window.inkvisual?.onOpenProject((path) => void open(path)), [open]);

  useEffect(() => useProjectStore.subscribe(() => usePlayStore.getState().noticeProjectChange()), []);

  // Ctrl+S saves; Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo. Capture phase so the dock's
  // bubble-phase stopPropagation cannot swallow them. CodeMirror's own history is off.
  // Play shortcuts live here too: Ctrl+Enter must work even when the editor has focus, and the
  // bare choice keys must NOT fire while typing in CodeMirror.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.altKey) {
        e.preventDefault();
        void saveAll();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const play = usePlayStore.getState();
        if (e.shiftKey) {
          const p = useProjectStore.getState();
          const sel = p.graph.nodes.find((n) => n.id === p.selectedId);
          if (sel && sel.kind === 'knot' && !sel.isFunction) play.run({ kind: 'knot', name: sel.name });
          else play.run({ kind: 'story' });
        } else if (play.status === 'running' || play.status === 'paused' || play.status === 'ended') {
          play.restart();
        } else if (play.startPath) {
          play.run({ kind: 'knot', name: play.startPath });
        } else {
          play.run({ kind: 'story' });
        }
        return;
      }

      const play = usePlayStore.getState();
      const live = play.status === 'running' || play.status === 'paused';
      if (live) {
        const inEdit = !!(t && (t.closest('.cm-editor') || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'));
        if (e.key === 'Escape' && !e.altKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          play.stop();
          return;
        }
        const alt = e.altKey && !e.ctrlKey && !e.metaKey;
        const bare = !e.altKey && !e.ctrlKey && !e.metaKey && !inEdit;
        if (alt || bare) {
          if (e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            play.choose(Number(e.key) - 1);
            return;
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            play.step();
            return;
          }
          if (e.key === 'Backspace') {
            e.preventDefault();
            if (e.shiftKey) play.backTurn();
            else play.back();
            return;
          }
          if (bare && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            if (play.choices.length) play.choose(0);
            else play.step();
            return;
          }
        }
      }

      // Native undo in the sidebar's path and search fields.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !t.closest('.cm-editor')) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useProjectStore.getState().undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        useProjectStore.getState().redo();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(useProjectStore.getState().dirty).length > 0) e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [saveAll]);

  return (
    <ReactFlowProvider>
      <DialogHost />
      <div className="app">
        <Sidebar />
        <main className="canvas-wrap">
          <Canvas />
        </main>
        <CodeDock />
        <PlayPanel />
      </div>
    </ReactFlowProvider>
  );
}
