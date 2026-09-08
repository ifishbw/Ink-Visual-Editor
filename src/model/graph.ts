/**
 * Turns files (segments) plus a parse result into the node/edge view-model the canvas renders.
 * Pure and framework-free. Node identity comes from segments; edges come from the parser.
 */
import type { Diagnostic, DivertKind, FilePath, InkFile, ParsedKnot, ParseResult, Segment } from './types';
import { countLines, hasCode, preambleId } from './splitter';

export interface GraphNode {
  id: string;
  kind: 'knot' | 'preamble' | 'missing';
  name: string;
  file: FilePath;
  isFunction: boolean;
  stitches: string[];
  /** 1-based file line where the segment starts (missing stubs: 0). */
  startLine: number;
  flags: { end: boolean; done: boolean; dynamic: string[]; loops: number };
  errorCount: number;
}

/** `include` links Start to an included file's top-level content, which ink splices into the same flow. */
export type EdgeKind = DivertKind | 'include';

/** One edge per divert. Edges are not merged, so each can leave from the line that wrote it. */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  /** The part of the target after the knot, e.g. `.entrance`. */
  label?: string;
  inChoice: boolean;
  /** 1-based file line of the divert in the source file, if known. */
  sourceLine: number | null;
  /** 1-based file line of the targeted stitch in the target file, if the label names one. */
  targetLine: number | null;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const START_NAME = 'Start';

export function buildGraph(files: InkFile[], parse: ParseResult, root: FilePath): Graph {
  const nodes: GraphNode[] = [];
  const byId = new Map<string, GraphNode>();
  const knotIdByName = new Map<string, string>();
  const parsedByName = new Map(parse.knots.map((k) => [k.name, k]));
  const segmentRanges: { file: FilePath; node: GraphNode; from: number; to: number }[] = [];

  for (const file of files) {
    for (const seg of file.segments) {
      const node = nodeFor(file.path, seg, root, parsedByName);
      if (!node) continue;
      nodes.push(node);
      byId.set(node.id, node);
      if (seg.kind === 'knot' && seg.name && !knotIdByName.has(seg.name)) knotIdByName.set(seg.name, node.id);
      segmentRanges.push({ file: file.path, node, from: seg.startLine, to: seg.startLine + countLines(seg.text) });
    }
  }

  for (const d of parse.diagnostics) {
    if (d.severity !== 'error' || d.file === null || d.line === null) continue;
    const hit = segmentRanges.find((r) => r.file === d.file && d.line! >= r.from && d.line! < r.to);
    if (hit) hit.node.errorCount++;
  }

  const isInternal = (source: GraphNode, head: string) => {
    if (source.kind === 'preamble') return parse.preambleLabels.includes(head);
    const k = parsedByName.get(source.name);
    return k !== undefined && (k.stitches.includes(head) || k.labels.includes(head));
  };
  const globalDynamic = new Set(parse.divertVariables);
  const isDynamic = (source: GraphNode, head: string) =>
    globalDynamic.has(head) || (source.kind === 'knot' && (parsedByName.get(source.name)?.divertParams.includes(head) ?? false));

  const edges: GraphEdge[] = [];
  const rootId = preambleId(root);
  for (const n of nodes) {
    if (n.kind === 'preamble' && n.id !== rootId && byId.has(rootId)) {
      edges.push({ id: `include:${n.id}`, source: rootId, target: n.id, kind: 'include', inChoice: false, sourceLine: null, targetLine: null });
    }
  }

  for (const divert of parse.diverts) {
    if (divert.kind === 'call') continue;
    const sourceId = divert.fromKnot.endsWith('#') ? divert.fromKnot : knotIdByName.get(divert.fromKnot);
    const source = sourceId ? byId.get(sourceId) : undefined;
    if (!source) continue;
    const [head = '', ...rest] = divert.target.split('.');

    if (head === 'END' || head === 'DONE') {
      if (head === 'END') source.flags.end = true;
      else source.flags.done = true;
      continue;
    }
    let targetId = knotIdByName.get(head);
    if (targetId === undefined) {
      if (isInternal(source, head)) continue; // jump to a stitch or label inside the same flow
      if (isDynamic(source, head)) {
        if (!source.flags.dynamic.includes(head)) source.flags.dynamic.push(head);
        continue;
      }
      targetId = `missing#${head}`;
      if (!byId.has(targetId)) {
        const missing: GraphNode = {
          id: targetId,
          kind: 'missing',
          name: head,
          file: divert.file,
          isFunction: false,
          stitches: [],
          startLine: 0,
          flags: { end: false, done: false, dynamic: [], loops: 0 },
          errorCount: 0,
        };
        byId.set(targetId, missing);
        nodes.push(missing);
      }
    }
    if (targetId === source.id) {
      source.flags.loops++;
      continue;
    }
    const label = rest.length ? `.${rest.join('.')}` : undefined;
    const targetLine = rest[0] ? (parsedByName.get(head)?.stitchLines[rest[0]] ?? null) : null;
    edges.push({
      id: `${source.id}->${targetId}|${divert.kind}|${label ?? ''}|${divert.line ?? 'x'}|${edges.length}`,
      source: source.id,
      target: targetId,
      kind: divert.kind,
      label,
      inChoice: divert.inChoice,
      sourceLine: divert.line,
      targetLine,
    });
  }

  return { nodes, edges };
}

function nodeFor(path: FilePath, seg: Segment, root: FilePath, parsedByName: Map<string, ParsedKnot>): GraphNode | null {
  const flags = { end: false, done: false, dynamic: [], loops: 0 };
  if (seg.kind === 'preamble') {
    // The root's top-level content is the story start. An included file's top-level content only earns a node
    // when it holds code (declarations, text, diverts), not just comments and blank lines.
    if (path !== root && !hasCode(seg.text)) return null;
    return {
      id: preambleId(path),
      kind: 'preamble',
      name: path === root ? START_NAME : `${path} (top level)`,
      file: path,
      isFunction: false,
      stitches: [],
      startLine: seg.startLine,
      flags,
      errorCount: 0,
    };
  }
  const name = seg.name ?? '';
  const parsed = parsedByName.get(name);
  return {
    id: seg.id,
    kind: 'knot',
    name,
    file: path,
    isFunction: seg.isFunction === true || parsed?.isFunction === true,
    stitches: parsed?.stitches ?? [],
    startLine: seg.startLine,
    flags,
    errorCount: 0,
  };
}

export function diagnosticsFor(parse: ParseResult, file: FilePath): Diagnostic[] {
  return parse.diagnostics.filter((d) => d.file === file);
}
