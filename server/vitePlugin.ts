/**
 * Vite plugin: mounts the file API under /api and pushes file-change events over Vite's websocket
 * as `ink:changed` so the browser can reload files edited in Inky, VS Code, or git.
 */
import chokidar, { type FSWatcher } from 'chokidar';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { normalizePath } from '../src/model/project';
import { handleApi, hashText, send } from './fileApi';

export interface ChangedEvent {
  path: string;
  /** null when the file was deleted */
  hash: string | null;
  event: string;
}

export function inkFileApi(): Plugin {
  let projectDir: string | null = null;
  let watcher: FSWatcher | null = null;

  return {
    name: 'ink-file-api',
    configureServer(server) {
      const ctx = {
        getProjectDir: () => projectDir,
        setProjectDir: (dir: string) => {
          if (dir === projectDir) return;
          projectDir = dir;
          void watcher?.close();
          watcher = chokidar.watch(dir, {
            ignoreInitial: true,
            ignored: (p) => p.includes('node_modules') || p.endsWith('.tmp'),
          });
          watcher.on('all', (event, file) => {
            if (!/\.(ink|inkvisual\.json)$/i.test(file)) return;
            void (async () => {
              const rel = normalizePath(path.relative(dir, file));
              const hash = event === 'unlink' ? null : hashText(await fs.readFile(file, 'utf8').catch(() => ''));
              const payload: ChangedEvent = { path: rel, hash, event };
              server.ws.send('ink:changed', payload);
            })();
          });
        },
      };
      server.middlewares.use('/api', (req, res) => {
        handleApi(req, res, ctx).catch((e: unknown) => send(res, 500, { error: e instanceof Error ? e.message : String(e) }));
      });
      server.httpServer?.on('close', () => void watcher?.close());
    },
  };
}
