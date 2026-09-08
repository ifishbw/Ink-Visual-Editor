import { useReactFlow } from '@xyflow/react';
import { useMemo, useState } from 'react';
import { isValidKnotName } from '../model/ops';
import { normalizeNewInkPath } from '../model/project';
import { usePlayStore } from '../store/playStore';
import { useProjectStore } from '../store/projectStore';
import { askText } from './Dialog';
import { useReveal } from './reveal';

const BookIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <path d="M2.5 2.5h5a1.5 1.5 0 0 1 1.5 1.5v9.5a1.2 1.2 0 0 0-1.2-1.2H2.5zM13.5 2.5h-5A1.5 1.5 0 0 0 7 4v9.5a1.2 1.2 0 0 1 1.2-1.2h5.3z" />
  </svg>
);
const PageIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <path d="M4 1.5h5.5L12.5 4.5v10h-8.5z" />
    <path d="M9.5 1.5v3h3M6 8h4M6 10.5h4" />
  </svg>
);

export function Sidebar() {
  const status = useProjectStore((s) => s.status);
  const error = useProjectStore((s) => s.error);
  const rootArg = useProjectStore((s) => s.rootArg);
  const root = useProjectStore((s) => s.root);
  const recentRoots = useProjectStore((s) => s.recentRoots);
  const files = useProjectStore((s) => s.files);
  const fileColors = useProjectStore((s) => s.fileColors);
  const hiddenFiles = useProjectStore((s) => s.hiddenFiles);
  const showFunctions = useProjectStore((s) => s.showFunctions);
  const theme = useProjectStore((s) => s.theme);
  const graph = useProjectStore((s) => s.graph);
  const parse = useProjectStore((s) => s.parse);
  const dirty = useProjectStore((s) => s.dirty);
  const conflicts = useProjectStore((s) => s.conflicts);
  const externalChanges = useProjectStore((s) => s.externalChanges);
  const saveState = useProjectStore((s) => s.saveState);
  const autosave = useProjectStore((s) => s.autosave);
  const newKnotFile = useProjectStore((s) => s.newKnotFile);
  const missingIncludes = useProjectStore((s) => s.missingIncludes);
  const otherInkFiles = useProjectStore((s) => s.otherInkFiles);
  const layoutSaveState = useProjectStore((s) => s.layoutSaveState);
  const historyNote = useProjectStore((s) => s.historyNote);
  const sidebarOpen = useProjectStore((s) => s.sidebarOpen);
  const setSidebarOpen = useProjectStore((s) => s.setSidebarOpen);
  const open = useProjectStore((s) => s.open);
  const pickAndOpen = useProjectStore((s) => s.pickAndOpen);
  const saveAll = useProjectStore((s) => s.saveAll);
  const reloadFile = useProjectStore((s) => s.reloadFile);
  const setAutosave = useProjectStore((s) => s.setAutosave);
  const setNewKnotFile = useProjectStore((s) => s.setNewKnotFile);
  const createKnot = useProjectStore((s) => s.createKnot);
  const autoLayout = useProjectStore((s) => s.autoLayout);
  const toggleFileVisible = useProjectStore((s) => s.toggleFileVisible);
  const setShowFunctions = useProjectStore((s) => s.setShowFunctions);
  const setTheme = useProjectStore((s) => s.setTheme);
  const nodeAt = useProjectStore((s) => s.nodeAt);
  const setFocusLine = useProjectStore((s) => s.setFocusLine);
  const createInkFile = useProjectStore((s) => s.createInkFile);
  const playOpen = usePlayStore((s) => s.open);
  const setPlayOpen = usePlayStore((s) => s.setOpen);
  const rf = useReactFlow();

  const [rootInput, setRootInput] = useState(rootArg ?? '');
  const [query, setQuery] = useState('');
  const dirtyCount = Object.keys(dirty).length;

  const focusNode = useReveal();

  const newKnot = () => {
    const host = document.querySelector('.canvas-host');
    const r = host?.getBoundingClientRect();
    const center = rf.screenToFlowPosition({ x: r ? r.left + r.width / 2 : 600, y: r ? r.top + r.height / 2 : 400 });
    void (async () => {
      const name = await askText({
        title: 'New knot',
        placeholder: 'name',
        submitLabel: 'Create',
        hint: 'You can also type === name === in the editor to split a knot.',
        validate: (v) => {
          if (!isValidKnotName(v)) return 'Letters, digits and _ only';
          if (graph.nodes.some((n) => n.kind === 'knot' && n.name === v)) return 'A knot with that name already exists';
          return null;
        },
      });
      if (!name) return;
      const result = createKnot(name, center);
      if (result.includes('#')) focusNode(result);
    })();
  };

  const newFile = () => {
    void (async () => {
      const name = await askText({
        title: 'New ink file',
        placeholder: 'chapters/side.ink',
        submitLabel: 'Create',
        hint: 'Creates the file and adds INCLUDE to the root.',
        validate: (v) => {
          const p = normalizeNewInkPath(v);
          if ('error' in p) return p.error;
          if (files.some((f) => f.path === p.path) || p.path === root) return `${p.path} is already in the project`;
          return null;
        },
      });
      if (!name) return;
      await createInkFile(name);
    })();
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return graph.nodes.filter((n) => n.kind !== 'missing' && n.name.toLowerCase().includes(q)).slice(0, 25);
  }, [graph, query]);

  const knotCount = (path: string) => graph.nodes.filter((n) => n.kind === 'knot' && n.file === path).length;
  const fileRow = (path: string, isRoot: boolean) => (
    <li key={path} className={hiddenFiles[path] ? 'hidden' : ''}>
      <span className="icon" style={{ color: fileColors[path] }}>
        {isRoot ? <BookIcon /> : <PageIcon />}
      </span>
      <span className="grow mono">
        {path}
        {dirty[path] && <span className="dirty"> ●</span>}
      </span>
      <span className="muted">{knotCount(path)}</span>
      <button className="eye" title={hiddenFiles[path] ? 'Show this file’s knots' : 'Hide this file’s knots'} aria-pressed={!hiddenFiles[path]} onClick={() => toggleFileVisible(path)}>
        {hiddenFiles[path] ? '○' : '●'}
      </button>
    </li>
  );

  if (!sidebarOpen) {
    return (
      <aside className="sidebar closed">
        <button className="tab" title="Show the file panel" onClick={() => setSidebarOpen(true)}>
          files ›
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="titlebar">
        <h1>InkVisual</h1>
        <button className="ghost" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? 'Dark' : 'Light'}
        </button>
        <button className="ghost" title="Hide the file panel" onClick={() => setSidebarOpen(false)}>
          ‹
        </button>
      </div>

      <section>
        <div className="row">
          <button className="primary" onClick={() => void pickAndOpen()} disabled={status === 'loading'}>
            {status === 'loading' ? 'Opening…' : 'Open ink file…'}
          </button>
          {recentRoots.length > 0 && (
            <select value="" onChange={(e) => e.target.value && void open(e.target.value)} title="Recent projects">
              <option value="">Recent…</option>
              {recentRoots.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (rootInput.trim()) void open(rootInput.trim());
          }}
        >
          <input value={rootInput} onChange={(e) => setRootInput(e.target.value)} placeholder="or type a path to root.ink" spellCheck={false} />
          <button type="submit" disabled={status === 'loading'}>
            Go
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {status === 'ready' && (
          <p className="muted">
            {graph.nodes.filter((n) => n.kind === 'knot').length} knots · {graph.edges.length} edges · layout {layoutSaveState}
          </p>
        )}
      </section>

      {status === 'ready' && (
        <>
          <section>
            <div className="row">
              <button className={dirtyCount ? 'primary' : ''} onClick={() => void saveAll()} disabled={dirtyCount === 0 || saveState === 'saving'}>
                {saveState === 'saving' ? 'Saving…' : dirtyCount ? `Save ${dirtyCount} file${dirtyCount > 1 ? 's' : ''} (Ctrl+S)` : 'Saved'}
              </button>
              <label className="check">
                <input type="checkbox" checked={autosave} onChange={(e) => setAutosave(e.target.checked)} /> autosave
              </label>
            </div>
            {historyNote && <p className="banner warn">{historyNote}</p>}
            {Object.entries(conflicts).map(([path]) => (
              <div key={path} className="banner error">
                <span>{path} changed on disk since you loaded it.</span>
                <div className="row">
                  <button onClick={() => void saveAll(true)}>Overwrite disk</button>
                  <button onClick={() => void reloadFile(path)}>Discard mine</button>
                </div>
              </div>
            ))}
            {Object.entries(externalChanges).map(([path, hash]) => (
              <div key={path} className="banner warn">
                <span>
                  {path} {hash === 'deleted' ? 'was deleted' : 'changed'} on disk while you have unsaved edits.
                </span>
                <div className="row">
                  <button onClick={() => void saveAll(true)}>Keep mine</button>
                  <button onClick={() => void reloadFile(path)}>Reload from disk</button>
                </div>
              </div>
            ))}
          </section>

          <section>
            <div className="row wrap">
              <button onClick={newKnot}>New knot</button>
              <button onClick={newFile}>New file</button>
              <button className={playOpen ? '' : 'primary'} onClick={() => setPlayOpen(!playOpen)} title={playOpen ? 'Hide the player' : 'Play this story'}>
                {playOpen ? 'Playing' : 'Play'}
              </button>
              <button onClick={() => void rf.fitView({ padding: 0.15, duration: 300 })}>Fit view</button>
              <button onClick={autoLayout}>Auto layout</button>
            </div>
            <p className="muted">Double-click the canvas to add a knot. Drag from a node’s header handle to another node to add a divert. Double-click a wire to add a reroute dot. Click a divert name in the editor to go there.</p>
          </section>

          <section className="files-panel">
            <label className="label">Main ink file</label>
            <ul className="list filelist">{files.filter((f) => f.path === root).map((f) => fileRow(f.path, true))}</ul>
            {files.length > 1 && <ul className="list filelist">{files.filter((f) => f.path !== root).map((f) => fileRow(f.path, false))}</ul>}
            {otherInkFiles.length > 0 && (
              <>
                <label className="label">Unused files</label>
                <ul className="list filelist unused">
                  {otherInkFiles.map((p) => (
                    <li key={p} title="Not reached from the root file through INCLUDE">
                      <span className="icon">
                        <PageIcon />
                      </span>
                      <span className="grow mono">{p}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="row wrap">
              <label className="check">
                <input type="checkbox" checked={showFunctions} onChange={(e) => setShowFunctions(e.target.checked)} /> show functions
              </label>
              {files.length > 1 && (
                <label className="check">
                  new knots go to{' '}
                  <select value={newKnotFile ?? ''} onChange={(e) => setNewKnotFile(e.target.value)}>
                    {files.map((f) => (
                      <option key={f.path} value={f.path}>
                        {f.path}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {missingIncludes.map((m) => (
              <p key={`${m.from}:${m.line}`} className="error">
                {m.from}:{m.line} includes missing file {m.path}
              </p>
            ))}
          </section>

          <section>
            <label className="label">Find knot</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="name…" spellCheck={false} />
            {matches.length > 0 && (
              <ul className="list clickable">
                {matches.map((n) => (
                  <li key={n.id} onClick={() => focusNode(n.id)}>
                    <span className="dot" style={{ background: fileColors[n.file] }} />
                    <span className="grow mono">{n.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <label className="label">Diagnostics {parse ? `(${parse.diagnostics.length})` : ''}</label>
            {parse && parse.diagnostics.length === 0 && <p className="muted">No problems.</p>}
            <ul className="list clickable diagnostics">
              {parse?.diagnostics.map((d, i) => {
                const target = d.file && d.line ? nodeAt(d.file, d.line) : null;
                const knot = target ? graph.nodes.find((n) => n.id === target) : null;
                const jump = () => {
                  if (!target || !d.file || d.line == null) return;
                  const file = files.find((f) => f.path === d.file);
                  const seg = file?.segments.find((sg) => sg.id === target);
                  const rel = seg ? Math.max(0, d.line - seg.startLine) : 0;
                  setFocusLine(target, rel);
                  focusNode(target);
                };
                return (
                  <li key={i} className={d.severity} onClick={jump} title={target ? 'Jump to source' : undefined}>
                    <span className="sev">{d.severity}</span>
                    <span className="grow">
                      <span className="mono">
                        {knot ? `${knot.name} · ` : ''}
                        {d.file ?? '?'}:{d.line ?? '?'}
                      </span>{' '}
                      {d.message}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </aside>
  );
}
