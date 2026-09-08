import type { FilePath, InkFile, Segment } from './types';

/**
 * A knot header: two or more `=` after optional indentation (a leading BOM counts as indentation),
 * optional `function`, then an identifier. Ink identifiers allow any letters, so `\p{L}` not `[A-Za-z]`.
 * A single `=` is a stitch and stays inside its knot.
 */
export const KNOT_HEADER_RE = /^[ \t﻿]*={2,}[ \t]*(function[ \t]+)?([\p{L}_][\p{L}\p{N}_]*)/u;

/** Split text into lines, each keeping its own terminator (`\n` or `\r\n`). Concatenating them restores the text. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Strip the line terminator from a line produced by splitLines. */
export function stripTerminator(line: string): string {
  return line.replace(/\r?\n$/, '');
}

/**
 * Remove comment text from one line given the block-comment state at its start.
 * `//` hides the rest of the line; `/*` opens and `*\/` closes a block comment. String literals are not tracked.
 */
export function stripComments(line: string, inBlock: boolean): { code: string; inBlock: boolean } {
  let code = '';
  let i = 0;
  while (i < line.length) {
    if (inBlock) {
      const close = line.indexOf('*/', i);
      if (close === -1) return { code, inBlock: true };
      inBlock = false;
      i = close + 2;
      continue;
    }
    const lineComment = line.indexOf('//', i);
    const open = line.indexOf('/*', i);
    if (open === -1 || (lineComment !== -1 && lineComment < open)) {
      code += line.slice(i, lineComment === -1 ? undefined : lineComment);
      return { code, inBlock: false };
    }
    code += line.slice(i, open);
    inBlock = true;
    i = open + 2;
  }
  return { code, inBlock };
}

/** Advance the block-comment state across one line. */
export function scanCommentState(line: string, inBlock: boolean): boolean {
  return stripComments(line, inBlock).inBlock;
}

/** True when the text contains anything other than whitespace and comments. */
export function hasCode(text: string): boolean {
  let inBlock = false;
  for (const raw of splitLines(text)) {
    const r = stripComments(stripTerminator(raw), inBlock);
    inBlock = r.inBlock;
    if (r.code.trim() !== '') return true;
  }
  return false;
}

/** Returns the header match for a line, or null. Ignores lines that start inside a block comment. */
export function matchKnotHeader(line: string, inBlock: boolean): { name: string; isFunction: boolean } | null {
  if (inBlock) return null;
  const m = KNOT_HEADER_RE.exec(line);
  if (!m) return null;
  return { name: m[2]!, isFunction: m[1] !== undefined };
}

/** Split a file into a preamble segment followed by one segment per knot. Byte-exact: join(split(x)) === x. */
export function splitFile(path: FilePath, text: string): Segment[] {
  const segments: Segment[] = [];
  let current: Segment = { id: preambleId(path), kind: 'preamble', text: '', startLine: 1 };
  let inBlock = false;
  const lines = splitLines(text);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const bare = stripTerminator(line);
    const header = matchKnotHeader(bare, inBlock);
    if (header) {
      segments.push(current);
      current = {
        id: '',
        kind: 'knot',
        name: header.name,
        isFunction: header.isFunction,
        text: '',
        startLine: i + 1,
      };
    }
    current.text += line;
    inBlock = scanCommentState(bare, inBlock);
  }
  segments.push(current);
  assignIds(path, segments);
  return segments;
}

export function joinSegments(segments: readonly Segment[]): string {
  let out = '';
  for (const s of segments) out += s.text;
  return out;
}

export function preambleId(path: FilePath): string {
  return `${path}#`;
}

export function knotId(path: FilePath, name: string, ordinal = 1): string {
  return ordinal === 1 ? `${path}#${name}` : `${path}#${name}#${ordinal}`;
}

/** Give every knot segment a stable id; a name repeated within one file gets `#2`, `#3`... */
function assignIds(path: FilePath, segments: Segment[]): void {
  const seen = new Map<string, number>();
  for (const s of segments) {
    if (s.kind !== 'knot' || s.name === undefined) continue;
    const n = (seen.get(s.name) ?? 0) + 1;
    seen.set(s.name, n);
    s.id = knotId(path, s.name, n);
  }
}

/** Recompute startLine for every segment from the text; call after any segment text changes. */
export function recomputeStartLines(segments: Segment[]): void {
  let line = 1;
  for (const s of segments) {
    s.startLine = line;
    line += countLines(s.text);
  }
}

/** Number of line terminators in the text. */
export function countLines(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

export function makeInkFile(path: FilePath, text: string): InkFile {
  return { path, segments: splitFile(path, text) };
}
