/**
 * `npm run dev:app`: Vite dev server + an Electron window pointed at it.
 *
 * Both children are launched through absolute paths and no shell, so a plain child.kill() actually
 * reaches them on Windows (a `.cmd` shim would leave the real process orphaned).
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
  children.push(child);
  return child;
}

/** Start Vite and resolve with the dev URL it prints, once that URL actually answers. */
function startVite() {
  return new Promise((resolve, reject) => {
    const child = run(process.execPath, [path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')], { stdio: ['ignore', 'pipe', 'inherit'] });
    let url = null;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      if (url) return;
      const match = stripAnsi(chunk).match(/https?:\/\/(localhost|127\.0\.0\.1):\d+\/?/);
      if (match) {
        url = match[0].replace(/\/$/, '');
        void waitFor(url).then(() => resolve(url), reject);
      }
    });
    child.on('exit', (code) => {
      if (!url) reject(new Error(`vite exited with code ${code} before printing a URL`));
      else shutdown(code ?? 0);
    });
  });
}

async function waitFor(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(url);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`${url} did not respond within ${timeoutMs / 1000}s`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

function buildElectron() {
  return new Promise((resolve, reject) => {
    const child = run(process.execPath, [path.join(root, 'scripts', 'build-electron.mjs'), '--sourcemap']);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build-electron exited with code ${code}`))));
  });
}

try {
  const url = await startVite();
  await buildElectron();
  console.log(`\nStarting Electron against ${url}\n`);
  const electron = run(require('electron'), ['.'], { env: { ...process.env, INKVISUAL_DEV_URL: url } });
  electron.on('exit', (code) => shutdown(code ?? 0));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  shutdown(1);
}
