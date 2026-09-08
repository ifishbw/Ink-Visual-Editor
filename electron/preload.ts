/**
 * The whole renderer <-> main surface. Runs sandboxed with contextIsolation on, so `ipcRenderer`
 * itself is never handed to the page: only these four functions are.
 *
 * Keep this in sync with the InkVisualBridge declaration in src/env.d.ts.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

interface ChangedEvent {
  path: string;
  /** null when the file was deleted */
  hash: string | null;
  event: string;
}

/** A sandboxed preload cannot reach Electron's `app`, so main passes the version in via argv. */
function argValue(prefix: string): string {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.off(channel, handler);
  };
}

contextBridge.exposeInMainWorld('inkvisual', {
  isDesktop: true,
  versions: {
    app: argValue('--inkvisual-version='),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
  },
  /** Files changed on disk, watched by the main process. Returns an unsubscribe function. */
  onChange: (cb: (e: ChangedEvent) => void): (() => void) => subscribe<ChangedEvent>('ink:changed', cb),
  /** The menu's Open Project…, delivering an absolute root .ink path. Returns an unsubscribe function. */
  onOpenProject: (cb: (path: string) => void): (() => void) => subscribe<string>('inkvisual:open-project', cb),
  /** Native Open File dialog; resolves to the chosen absolute path or null when cancelled. */
  pickRoot: (startDir: string | null): Promise<string | null> => ipcRenderer.invoke('inkvisual:pick', startDir),
});
