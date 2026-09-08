/**
 * Bundles the Electron main process and preload into build/*.cjs with esbuild.
 *
 * The .cjs extension is load-bearing: package.json says "type": "module", and Electron needs
 * CommonJS for the preload. Only electron itself stays external, so chokidar and the model code
 * ship inside the bundle and package.json's "dependencies" can stay empty -- the packaged app
 * then contains nothing but Electron, build/ and dist/.
 */
import { build } from 'esbuild';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const minify = process.env.NODE_ENV === 'production' || process.argv.includes('--minify');
// Off by default so `npm run dist` does not ship maps; scripts/dev-electron.mjs asks for them.
const sourcemap = process.argv.includes('--sourcemap');

const entries = [
  { in: 'electron/main.ts', out: 'build/main.cjs' },
  { in: 'electron/preload.ts', out: 'build/preload.cjs' },
];

try {
  for (const entry of entries) {
    await build({
      entryPoints: [path.join(root, entry.in)],
      outfile: path.join(root, entry.out),
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      external: ['electron', 'fsevents'],
      sourcemap: sourcemap && !minify ? 'linked' : false,
      minify,
      logLevel: 'warning',
    });
    const kb = (statSync(path.join(root, entry.out)).size / 1024).toFixed(1);
    console.log(`  ${entry.out.padEnd(20)} ${kb} kB${minify ? ' (minified)' : ''}`);
  }
} catch (e) {
  console.error(`build-electron failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
