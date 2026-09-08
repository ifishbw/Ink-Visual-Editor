/**
 * InkVisual desktop shell.
 *
 * There is no localhost HTTP listener. A privileged `app://inkvisual/` scheme serves the built
 * renderer out of dist/ and routes /api/* into the same server/fileApi.ts handlers the Vite dev
 * server uses. A custom scheme (rather than file://) buys a *stable origin*, which the renderer
 * needs: last root, recent projects, theme and dock width all live in localStorage, and an
 * ephemeral port or an opaque file:// origin would drop them on every launch.
 */
import chokidar, { type FSWatcher } from 'chokidar';
import { BrowserWindow, app, dialog, ipcMain, protocol, shell } from 'electron';
import { existsSync, statSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizePath } from '../src/model/project';
import { hashText } from '../server/fileApi';
import type { ChangedEvent } from '../server/vitePlugin';
import { type ApiContext, handleApiRequest } from './apiAdapter';
import { installAppMenu } from './menu';

const SCHEME = 'app';
const HOST = 'inkvisual';
const APP_ORIGIN = `${SCHEME}://${HOST}`;
const DIST = path.join(__dirname, '..', 'dist');

// Must run before app ready, and before any window exists.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
/** An .ink path from argv / macOS open-file, held until the renderer is listening. */
let pendingOpenPath: string | null = null;

// ---------------------------------------------------------------------------
// Project directory + file watching (mirrors server/vitePlugin.ts)
// ---------------------------------------------------------------------------

let projectDir: string | null = null;
let watcher: FSWatcher | null = null;

const apiContext: ApiContext = {
  getProjectDir: () => projectDir,
  setProjectDir: (dir) => {
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
        mainWindow?.webContents.send('ink:changed', payload);
      })();
    });
  },
};

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

/** Resolve a request path inside dist/, or null if it escapes. */
function resolveAsset(pathname: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const abs = path.resolve(DIST, rel.replace(/^\/+/, ''));
  if (abs !== DIST && !abs.startsWith(DIST + path.sep)) return null;
  return abs;
}

function isFile(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

async function serveStatic(pathname: string): Promise<Response> {
  const asked = resolveAsset(pathname);
  // "/" and any unknown path -> index.html, so the SPA still boots (and so does a stale deep link).
  const file = asked && isFile(asked) ? asked : path.join(DIST, 'index.html');
  try {
    const body = await fs.readFile(file);
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const headers: Record<string, string> = { 'Content-Type': type };
    // Vite hashes asset filenames, so only the entry document needs revalidating.
    if (file.endsWith('.html')) headers['Cache-Control'] = 'no-cache';
    return new Response(new Uint8Array(body), { status: 200, headers });
  } catch (e) {
    return new Response(`Not found: ${pathname}\n${e instanceof Error ? e.message : String(e)}`, {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

// ---------------------------------------------------------------------------
// Native open dialog
// ---------------------------------------------------------------------------

async function pickInkFile(win: BrowserWindow | null, startDir: string | null): Promise<string | null> {
  const options = {
    title: 'Open ink project (root file)',
    properties: ['openFile' as const],
    filters: [
      { name: 'ink files', extensions: ['ink'] },
      { name: 'All files', extensions: ['*'] },
    ],
    ...(startDir ? { defaultPath: startDir } : {}),
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled) return null;
  return result.filePaths[0] ?? null;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function startUrl(): string {
  return process.env['INKVISUAL_DEV_URL'] ?? `${APP_ORIGIN}/index.html`;
}

function allowedOrigin(): string {
  try {
    return new URL(startUrl()).origin;
  } catch {
    return APP_ORIGIN;
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    // The app defaults to a dark, Inky-like theme; a white flash on launch reads as a broken window.
    backgroundColor: '#1e1e1e',
    show: false,
    title: 'InkVisual',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--inkvisual-version=${app.getVersion()}`],
    },
  });

  win.once('ready-to-show', () => win.show());

  // External links open in the user's real browser; nothing opens a second Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // The app is a single document. Anything that tries to navigate away is either an accident or an attack.
  win.webContents.on('will-navigate', (event, url) => {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      origin = '';
    }
    if (origin === allowedOrigin()) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  win.webContents.on('did-finish-load', () => {
    if (!pendingOpenPath) return;
    win.webContents.send('inkvisual:open-project', pendingOpenPath);
    pendingOpenPath = null;
  });

  void win.loadURL(startUrl());
  return win;
}

/** Hand an absolute root path to the renderer, queueing it if the page is not ready yet. */
function openProjectInRenderer(absPath: string): void {
  const win = mainWindow;
  if (!win || win.webContents.isLoading()) {
    pendingOpenPath = absPath;
    return;
  }
  win.webContents.send('inkvisual:open-project', absPath);
}

async function promptOpenProject(win: BrowserWindow | null): Promise<void> {
  const chosen = await pickInkFile(win ?? mainWindow, projectDir);
  if (chosen) openProjectInRenderer(chosen);
}

/** The last plain argument that looks like an existing .ink file. */
function inkPathFromArgv(argv: readonly string[]): string | null {
  for (let i = argv.length - 1; i >= 1; i--) {
    const arg = argv[i];
    if (!arg || arg.startsWith('-') || arg === '.') continue;
    if (!/\.ink$/i.test(arg)) continue;
    const abs = path.resolve(arg);
    if (existsSync(abs)) return abs;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// macOS delivers Finder opens as an event, and it can fire before ready.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (/\.ink$/i.test(filePath)) openProjectInRenderer(filePath);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = mainWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const fromArgv = inkPathFromArgv(argv);
    if (fromArgv) openProjectInRenderer(fromArgv);
  });

  pendingOpenPath = inkPathFromArgv(process.argv);

  void app.whenReady().then(() => {
    protocol.handle(SCHEME, async (request) => {
      const url = new URL(request.url);
      if (url.pathname === '/api/pick') {
        // Electron's dialog works on every platform; fileApi's PowerShell fallback is dev-only now.
        const chosen = await pickInkFile(mainWindow, url.searchParams.get('dir'));
        return Response.json({ path: chosen });
      }
      if (url.pathname.startsWith('/api/')) return handleApiRequest(request, apiContext);
      return serveStatic(url.pathname);
    });

    ipcMain.handle('inkvisual:pick', async (_event, startDir: string | null) => pickInkFile(mainWindow, startDir ?? projectDir));

    installAppMenu({ openProject: (win) => void promptOpenProject(win) });

    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length > 0) return;
      mainWindow = createWindow();
      mainWindow.on('closed', () => {
        mainWindow = null;
      });
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  void watcher?.close();
  watcher = null;
});
