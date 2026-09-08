import type { FilePath } from './types';
import { scanCommentState, splitLines, stripTerminator } from './splitter';

/** `INCLUDE path/to/file.ink` at the top level of a file. */
export const INCLUDE_RE = /^[ \t﻿]*INCLUDE[ \t]+(.+?)[ \t]*$/;

export interface IncludeRef {
  /** Normalized path relative to the root file's directory. */
  path: FilePath;
  /** Raw text after INCLUDE, as written. */
  raw: string;
  /** 1-based line in the including file. */
  line: number;
}

/** Find INCLUDE lines that are not inside block comments. */
export function findIncludes(text: string): IncludeRef[] {
  const refs: IncludeRef[] = [];
  let inBlock = false;
  const lines = splitLines(text);
  for (let i = 0; i < lines.length; i++) {
    const bare = stripTerminator(lines[i]!);
    if (!inBlock) {
      const m = INCLUDE_RE.exec(bare);
      if (m) refs.push({ path: normalizePath(m[1]!), raw: m[1]!, line: i + 1 });
    }
    inBlock = scanCommentState(bare, inBlock);
  }
  return refs;
}

/**
 * Normalize a path: forward slashes, no `./`, `..` collapsed where possible.
 * Ink resolves every INCLUDE relative to the ROOT file's directory, so no joining with the including file is needed.
 */
export function normalizePath(p: string): FilePath {
  const parts = p.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..' && out.length > 0 && out[out.length - 1] !== '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/** A project-relative `.ink` path for "new file". Rejects empty names and anything that would leave the folder. */
export function normalizeNewInkPath(input: string): { path: FilePath } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: 'Enter a file name' };
  const withExt = /\.ink$/i.test(trimmed) ? trimmed : `${trimmed}.ink`;
  const path = normalizePath(withExt);
  if (!path) return { error: 'Enter a file name' };
  if (path.startsWith('..') || path.split('/').includes('..')) return { error: 'Path would leave the project folder' };
  if (!/\.ink$/i.test(path)) return { error: 'Must be an .ink file' };
  return { path };
}

export interface ProjectFiles {
  root: FilePath;
  /** Root first, then files in discovery order (breadth first). */
  files: FilePath[];
  /** INCLUDEs whose target could not be read. */
  missing: { from: FilePath; path: FilePath; line: number }[];
}

/** Walk INCLUDE statements from the root. `read` returns a file's text or undefined when it does not exist. */
export function discoverProject(root: FilePath, read: (path: FilePath) => string | undefined): ProjectFiles {
  const rootPath = normalizePath(root);
  const files: FilePath[] = [];
  const missing: ProjectFiles['missing'] = [];
  const queue: FilePath[] = [rootPath];
  const seen = new Set<FilePath>();
  while (queue.length > 0) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const text = read(path);
    if (text === undefined) continue;
    files.push(path);
    for (const ref of findIncludes(text)) {
      if (seen.has(ref.path)) continue;
      if (read(ref.path) === undefined) missing.push({ from: path, path: ref.path, line: ref.line });
      else queue.push(ref.path);
    }
  }
  return { root: rootPath, files, missing };
}
