/**
 * How the browser reaches project files. The HTTP implementation talks to server/fileApi.ts.
 * A File System Access API implementation could be added behind the same interface later.
 */
import type { ProjectResponse } from '../../server/fileApi';

export type { ProjectResponse };

export type WriteResult = { hash: string } | { conflict: true; diskHash: string };

export interface ChangeEvent {
  path: string;
  hash: string | null;
  event: string;
}

export interface ProjectFS {
  openProject(root: string): Promise<ProjectResponse>;
  readFile(path: string): Promise<{ text: string; hash: string } | null>;
  /** Pass baseHash null to overwrite unconditionally (used for the layout sidecar). */
  writeFile(path: string, text: string, baseHash: string | null): Promise<WriteResult>;
  onChange(cb: (e: ChangeEvent) => void): () => void;
  /** Native Open File dialog; resolves to the chosen absolute path or null when cancelled. */
  pickRoot(startDir: string | null): Promise<string | null>;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && res.status !== 409) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body;
}

export const httpFS: ProjectFS = {
  async openProject(root) {
    return json<ProjectResponse>(await fetch(`/api/project?root=${encodeURIComponent(root)}`));
  },
  async readFile(path) {
    const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
    if (res.status === 404) return null;
    return json(res);
  },
  async writeFile(path, text, baseHash) {
    const res = await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, text, baseHash }),
    });
    return json<WriteResult>(res);
  },
  onChange(cb) {
    // Order matters: under `npm run dev:app` both exist, but the Vite plugin owns the watcher in
    // dev and the desktop bridge only watches once the packaged main process has a project open.
    const hot = import.meta.hot;
    if (hot) {
      hot.on('ink:changed', cb);
      return () => hot.off('ink:changed', cb);
    }
    return window.inkvisual?.onChange(cb) ?? (() => {});
  },
  async pickRoot(startDir) {
    // Electron's dialog works everywhere; the /api/pick fallback is PowerShell, so Windows only.
    const desktop = window.inkvisual;
    if (desktop) return desktop.pickRoot(startDir);
    const q = startDir ? `?dir=${encodeURIComponent(startDir)}` : '';
    const r = await json<{ path: string | null }>(await fetch(`/api/pick${q}`));
    return r.path;
  },
};
