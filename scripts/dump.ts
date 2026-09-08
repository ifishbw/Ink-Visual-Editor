/**
 * Milestone 0 check: load an ink project from disk, split it, parse it, and print the graph.
 * Usage: npm run dump -- path/to/root.ink
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../src/model/graph';
import { parseProject } from '../src/model/inkParse';
import { discoverProject } from '../src/model/project';
import { joinSegments, makeInkFile } from '../src/model/splitter';

const rootArg = process.argv[2] ?? 'examples/tech-demo/main.ink';
const rootAbs = path.resolve(rootArg);
const dir = path.dirname(rootAbs);
const read = (p: string): string | undefined => {
  const abs = path.join(dir, p);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
};

const t0 = performance.now();
const project = discoverProject(path.basename(rootAbs), read);
const texts: Record<string, string> = {};
for (const p of project.files) texts[p] = read(p)!;
const files = project.files.map((p) => makeInkFile(p, texts[p]!));
for (const f of files) {
  if (joinSegments(f.segments) !== texts[f.path]) throw new Error(`Round trip failed for ${f.path}`);
}
const t1 = performance.now();
const parse = parseProject({ root: project.root, files: texts });
const t2 = performance.now();
const graph = buildGraph(files, parse, project.root);
const t3 = performance.now();

console.log(`Project ${project.root}: ${project.files.length} file(s)` + (project.missing.length ? `, missing includes: ${project.missing.map((m) => m.path).join(', ')}` : ''));
console.log(`\nNODES (${graph.nodes.length})`);
for (const n of graph.nodes) {
  const flags = [
    n.isFunction && 'function',
    n.flags.end && 'END',
    n.flags.done && 'DONE',
    n.flags.loops && `loops x${n.flags.loops}`,
    n.flags.dynamic.length && `dynamic -> ${n.flags.dynamic.join(',')}`,
    n.errorCount && `${n.errorCount} error(s)`,
  ].filter(Boolean);
  const stitches = n.stitches.length ? ` [${n.stitches.join(', ')}]` : '';
  console.log(`  ${n.kind === 'missing' ? '?? ' : ''}${n.id}${stitches}${flags.length ? `  (${flags.join('; ')})` : ''}`);
}
console.log(`\nEDGES (${graph.edges.length})`);
for (const e of graph.edges) {
  const extras = [e.kind !== 'divert' && e.kind, e.inChoice && 'choice'].filter(Boolean);
  console.log(`  ${e.source} -> ${e.target}${e.label ?? ''}${extras.length ? `  (${extras.join(', ')})` : ''}  line ${e.sourceLine ?? '?'}`);
}
console.log(`\nDIAGNOSTICS (${parse.diagnostics.length})`);
for (const d of parse.diagnostics) console.log(`  ${d.severity.toUpperCase()} ${d.file ?? '?'}:${d.line ?? '?'} ${d.message}`);
console.log(`\nsplit ${(t1 - t0).toFixed(1)} ms, parse ${(t2 - t1).toFixed(1)} ms, graph ${(t3 - t2).toFixed(1)} ms`);
