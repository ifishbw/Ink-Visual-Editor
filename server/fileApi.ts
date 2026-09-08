/**
 * Framework-free HTTP handlers for reading and writing an ink project on disk.
 * Mounted under /api by the Vite plugin (dev) and reusable by a standalone server later.
 *
 * Safety: only `.ink` and `.inkvisual.json` files inside the opened project directory are readable or
 * writable; writes are atomic (temp file + rename) and can be guarded by the caller's last-seen hash.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { discoverProject, normalizePath } from '../src/model/project';

export interface ApiContext {
  getProjectDir(): string | null;
  setProjectDir(dir: string): void;
}

export function hashText(text: string): string {
  return createHash('sha1').update(text, 'utf8').digest('hex');
}

const ALLOWED = /\.(ink|inkvisual\.json)$/i;

/** Resolve a project-relative path and refuse anything outside the project directory or of another file type. */
export function resolveInside(dir: string, rel: string): string {
  const base = path.resolve(dir);
  const abs = path.resolve(base, rel);
  if (abs !== base && !abs.startsWith(base + path.sep)) throw new ApiError(400, `Path escapes the project: ${rel}`);
  if (!ALLOWED.test(abs)) throw new ApiError(400, `Only .ink and .inkvisual.json files are allowed: ${rel}`);
  return abs;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, ctx: ApiContext): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /project') return send(res, 200, openProject(url.searchParams.get('root'), ctx));
    if (route === 'GET /file') return send(res, 200, await readFile(url.searchParams.get('path'), ctx));
    if (route === 'PUT /file') return await writeFile(await readJson(req), ctx, res);
    if (route === 'GET /pick') return send(res, 200, { path: await pickInkFile(url.searchParams.get('dir')) });
    send(res, 404, { error: `No route ${route}` });
  } catch (e) {
    if (e instanceof ApiError) send(res, e.status, { error: e.message });
    else send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}

export interface ProjectResponse {
  root: string;
  dir: string;
  files: { path: string; text: string; hash: string }[];
  missing: { from: string; path: string; line: number }[];
  otherInkFiles: string[];
}

function openProject(rootParam: string | null, ctx: ApiContext): ProjectResponse {
  if (!rootParam) throw new ApiError(400, 'Missing ?root=path/to/root.ink');
  const rootAbs = path.resolve(rootParam);
  if (!existsSync(rootAbs) || !statSync(rootAbs).isFile()) throw new ApiError(404, `Root file not found: ${rootAbs}`);
  if (!/\.ink$/i.test(rootAbs)) throw new ApiError(400, 'Root must be an .ink file');
  const dir = path.dirname(rootAbs);
  const read = (p: string): string | undefined => {
    try {
      const abs = resolveInside(dir, p);
      return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
    } catch {
      return undefined;
    }
  };
  const project = discoverProject(path.basename(rootAbs), read);
  ctx.setProjectDir(dir);
  const included = new Set(project.files);
  return {
    root: project.root,
    dir,
    files: project.files.map((p) => {
      const text = read(p)!;
      return { path: p, text, hash: hashText(text) };
    }),
    missing: project.missing,
    otherInkFiles: listInkFiles(dir).filter((p) => !included.has(p)),
  };
}

/** All .ink files under dir (relative, forward slashes), skipping node_modules and dot folders, 4 levels deep. */
function listInkFiles(dir: string, rel = '', depth = 0): string[] {
  if (depth > 4) return [];
  const out: string[] = [];
  for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const relPath = normalizePath(path.join(rel, entry.name));
    if (entry.isDirectory()) out.push(...listInkFiles(dir, relPath, depth + 1));
    else if (/\.ink$/i.test(entry.name)) out.push(relPath);
  }
  return out;
}

async function readFile(rel: string | null, ctx: ApiContext): Promise<{ text: string; hash: string }> {
  const dir = requireDir(ctx);
  if (!rel) throw new ApiError(400, 'Missing ?path=');
  const abs = resolveInside(dir, rel);
  if (!existsSync(abs)) throw new ApiError(404, `Not found: ${rel}`);
  const text = await fs.readFile(abs, 'utf8');
  return { text, hash: hashText(text) };
}

async function writeFile(body: unknown, ctx: ApiContext, res: ServerResponse): Promise<void> {
  const dir = requireDir(ctx);
  const { path: rel, text, baseHash } = (body ?? {}) as { path?: string; text?: string; baseHash?: string | null };
  if (typeof rel !== 'string' || typeof text !== 'string') throw new ApiError(400, 'Body must be { path, text, baseHash }');
  const abs = resolveInside(dir, rel);
  if (baseHash != null && existsSync(abs)) {
    const diskHash = hashText(await fs.readFile(abs, 'utf8'));
    if (diskHash !== baseHash) return send(res, 409, { conflict: true, diskHash });
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, abs);
  send(res, 200, { hash: hashText(text) });
}

/**
 * Show the operating system's Open File dialog (Windows only for now) and return the chosen path, or null.
 * The server owns file access, so the dialog has to run server-side; PowerShell gives us the native one.
 */
async function pickInkFile(startDir: string | null): Promise<string | null> {
  if (process.platform !== 'win32') throw new ApiError(501, 'The file dialog is only available on Windows; type the path instead');
  const { execFile } = await import('node:child_process');
  const initial = startDir ? `$d.InitialDirectory = '${startDir.replace(/'/g, "''")}';` : '';
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$d = New-Object System.Windows.Forms.OpenFileDialog',
    "$d.Title = 'Open ink project (root file)'",
    "$d.Filter = 'ink files (*.ink)|*.ink|All files (*.*)|*.*'",
    initial,
    "if ($d.ShowDialog() -eq 'OK') { Write-Output $d.FileName }",
  ].join('; ');
  return new Promise((resolve, reject) => {
    execFile('powershell', ['-NoProfile', '-STA', '-Command', script], { windowsHide: false, timeout: 5 * 60 * 1000 }, (err, stdout) => {
      if (err) return reject(new ApiError(500, `Dialog failed: ${err.message}`));
      const chosen = stdout.trim();
      resolve(chosen ? chosen : null);
    });
  });
}

function requireDir(ctx: ApiContext): string {
  const dir = ctx.getProjectDir();
  if (!dir) throw new ApiError(409, 'No project is open; call /api/project first');
  return dir;
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(new ApiError(400, `Invalid JSON body: ${e instanceof Error ? e.message : String(e)}`));
      }
    });
    req.on('error', reject);
  });
}

export function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
