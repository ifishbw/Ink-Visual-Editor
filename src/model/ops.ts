/**
 * Editing operations on the segment model. All pure: they return new InkFile objects.
 * Text is only ever spliced, never regenerated, so everything the user wrote survives.
 */
import type { InkFile } from './types';
import { findIncludes, INCLUDE_RE, normalizePath } from './project';
import { joinSegments, splitFile, splitLines, stripTerminator } from './splitter';

export const KNOT_NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

export function isValidKnotName(name: string): boolean {
  return KNOT_NAME_RE.test(name) && !['END', 'DONE', 'function', 'INCLUDE', 'VAR', 'CONST', 'LIST', 'EXTERNAL'].includes(name);
}

/** The line ending a file already uses; `\n` for new or empty files. */
export function lineEnding(text: string): '\r\n' | '\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** Replace one segment's text without re-splitting (headers may be mid-edit). Line numbers are recomputed. */
export function setSegmentText(file: InkFile, segId: string, text: string): InkFile {
  let line = 1;
  const segments = file.segments.map((s) => {
    const next = { ...s, text: s.id === segId ? text : s.text, startLine: line };
    line += countNewlines(next.text);
    return next;
  });
  return { ...file, segments };
}

export interface Resplit {
  file: InkFile;
  /** True when the set of segments changed (a header was added, removed or renamed). */
  changed: boolean;
  /** Knots that appear to have been renamed in place: same position in the file, old name gone, new name new. */
  renames: { from: string; to: string }[];
}

/** Re-derive segments from the joined text. Ids are stable for unchanged headers. */
export function resplitFile(file: InkFile): Resplit {
  const fresh = splitFile(file.path, joinSegments(file.segments));
  const same = fresh.length === file.segments.length && fresh.every((s, i) => s.id === file.segments[i]!.id);
  if (same) return { file: { ...file, segments: fresh }, changed: false, renames: [] };
  const oldNames = new Set(file.segments.map((s) => s.name));
  const newNames = new Set(fresh.map((s) => s.name));
  const renames: Resplit['renames'] = [];
  for (let i = 0; i < Math.min(fresh.length, file.segments.length); i++) {
    const a = file.segments[i]!;
    const b = fresh[i]!;
    if (a.kind === 'knot' && b.kind === 'knot' && a.name && b.name && a.name !== b.name && !newNames.has(a.name) && !oldNames.has(b.name)) {
      renames.push({ from: a.name, to: b.name });
    }
  }
  return { file: { ...file, segments: fresh }, changed: true, renames };
}

/**
 * Append a new knot at the end of the file. ink rejects a knot with no content at all, so it starts with a
 * `TODO:` line, which the compiler reports as an author note. Returns the new segment id.
 */
export function createKnot(file: InkFile, name: string): { file: InkFile; segId: string } {
  const text = joinSegments(file.segments);
  const eol = lineEnding(text);
  let prefix = '';
  if (text.length > 0 && !text.endsWith('\n')) prefix += eol;
  if (text.length > 0 && !/\n\r?\n$/.test(text + prefix)) prefix += eol;
  const segments = splitFile(file.path, `${text}${prefix}=== ${name} ===${eol}TODO: write ${name}${eol}${eol}`);
  return { file: { ...file, segments }, segId: segments[segments.length - 1]!.id };
}

/** Remove a knot segment (its whole text). Remaining segments are re-split so ids stay canonical. */
export function deleteKnot(file: InkFile, segId: string): InkFile {
  const kept = file.segments.filter((s) => s.id !== segId);
  return { ...file, segments: splitFile(file.path, joinSegments(kept)) };
}

/** Append `-> target` on its own line after the segment's last non-blank line. */
export function addDivert(file: InkFile, segId: string, target: string): InkFile {
  const seg = file.segments.find((s) => s.id === segId);
  if (!seg) return file;
  const eol = lineEnding(seg.text || joinSegments(file.segments));
  const lines = splitLines(seg.text);
  let last = lines.length - 1;
  while (last >= 0 && stripTerminator(lines[last]!).trim() === '') last--;
  if (last >= 0 && !lines[last]!.endsWith('\n')) lines[last] += eol;
  lines.splice(last + 1, 0, `-> ${target}${eol}`);
  return setSegmentText(file, segId, lines.join(''));
}

/**
 * Insert `INCLUDE path` into the file's preamble, after the last existing INCLUDE (or at the top).
 * No-op when that path is already included. The path is written as given; callers normalize first.
 */
export function addInclude(file: InkFile, rawPath: string): InkFile {
  const joined = joinSegments(file.segments);
  const want = normalizePath(rawPath);
  if (findIncludes(joined).some((r) => r.path === want)) return file;
  const pre = file.segments[0];
  if (!pre || pre.kind !== 'preamble') return file;
  const eol = lineEnding(joined || '\n');
  const lines = splitLines(pre.text);
  let lastInc = -1;
  for (let i = 0; i < lines.length; i++) {
    if (INCLUDE_RE.test(stripTerminator(lines[i]!))) lastInc = i;
  }
  const line = `INCLUDE ${rawPath}${eol}`;
  if (lastInc >= 0) {
    if (!lines[lastInc]!.endsWith('\n')) lines[lastInc] += eol;
    lines.splice(lastInc + 1, 0, line);
  } else {
    lines.unshift(line);
  }
  return setSegmentText(file, pre.id, lines.join(''));
}

function countNewlines(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * The text a node editor shows: the segment without its final line terminator.
 *
 * A segment that is followed by another one always ends with a newline (its last line is the line before the
 * next knot header). If the editor owned that newline the user could delete it, and the next re-split would
 * read `last line=== next ===` as ordinary text and merge the two knots. Hiding the terminator makes that
 * impossible, and drops the phantom blank line CodeMirror would otherwise show at the end of every node.
 */
export function editorText(text: string): string {
  return text.replace(/\r?\n$/, '');
}

/** Turn editor text back into segment text, restoring the exact terminator the segment had. */
export function segmentTextFrom(edited: string, previous: string): string {
  if (previous.endsWith('\r\n')) return edited + '\r\n';
  if (previous.endsWith('\n')) return edited + '\n';
  return edited;
}
