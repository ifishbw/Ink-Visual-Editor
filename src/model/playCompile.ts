/**
 * Compile a project to a runtime inkjs Story for Play Mode, plus the frozen script snapshot
 * every runtime position is resolved against.
 *
 * Never round-trip the Story through JSON (that strips all debug metadata). Never call Continue
 * on a story whose ValidateExternalBindings() threw — inkjs latches `_hasValidatedExternals`
 * even on failure, and a later Continue() returns "" with no error. If binding cannot be
 * repaired, this module returns `story: null` and `externalsUnrepairable` set.
 */
import * as inkFull from 'inkjs/full';
import type { InkParser as InkParserClass } from 'inkjs/compiler/Parser/InkParser';
import type { JsonFileHandler as JsonFileHandlerClass } from 'inkjs/compiler/FileHandler/JsonFileHandler';
import { Story } from 'inkjs/full';
import { parseInkMessage } from './inkParse';
import { scanCommentState, splitLines, stripTerminator } from './splitter';
import type { Diagnostic, FilePath, InkFile, ParseResult, Segment } from './types';

const { InkParser, JsonFileHandler } = inkFull as unknown as {
  InkParser: typeof InkParserClass;
  JsonFileHandler: typeof JsonFileHandlerClass;
};

export type RuntimeStory = Story;

/**
 * THE FROZEN SCRIPT. The exact text the Story was compiled from, plus the segment table as it stood at
 * that moment. Every runtime position in this feature is resolved against THIS, never against the live
 * projectStore — see PLAY_MODE_PLAN.md §2.1. Cheap: segments are never mutated in place (history.ts depends
 * on that), so holding the arrays costs pointers.
 */
export interface ScriptSnapshot {
  root: FilePath;
  /** Keyed exactly as INCLUDE writes it — what JsonFileHandler was fed, and what dm.fileName returns. */
  texts: Record<FilePath, string>;
  /** path -> that file's segments at compile time, in startLine order. */
  byPath: Map<FilePath, Segment[]>;
  /**
   * segId -> that segment's RAW text at compile time, TERMINATOR INCLUDED — i.e. `files[].segments[].text`,
   * the same thing `joinSegments` concatenates.
   *
   * NEVER compare this against `projectStore.texts[segId]`. That map is `ops.editorText(s.text)`,
   * which strips the final `\r?\n`. Comparing the two would report every segment but a file's last as
   * changed, marking the whole project stale on the first compile. Both sides of the trust check read
   * `files[].segments[].text`.
   */
  textById: Map<string, string>;
}

export interface ExternalStub {
  name: string;
  arity: number;
  value: number;
}

export interface PlayNote {
  kind: 'error' | 'warn' | 'info';
  text: string;
  action?: { kind: 'jump'; segId: string; relLine: number } | { kind: 'reveal'; file: FilePath };
}

export interface CompileResult {
  story: RuntimeStory | null;
  snapshot: ScriptSnapshot;
  diagnostics: Diagnostic[];
  stubbed: ExternalStub[];
  unmatchedFiles: string[];
  /**
   * Set when ValidateExternalBindings() threw and could not be repaired by the retry-once path.
   * When this is set the caller MUST discard the story: calling Continue() on it produces silence,
   * not an error. See PLAY_MODE_PLAN.md §5.9.
   */
  externalsUnrepairable: string[] | null;
}

export interface ExternalDecl {
  name: string;
  arity: number;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function freeze(root: FilePath, files: InkFile[]): ScriptSnapshot {
  const texts: Record<FilePath, string> = {};
  const byPath = new Map<FilePath, Segment[]>();
  const textById = new Map<string, string>();
  for (const f of files) {
    texts[f.path] = f.segments.map((s) => s.text).join('');
    byPath.set(f.path, f.segments);
    for (const s of f.segments) textById.set(s.id, s.text);
  }
  return { root, texts, byPath, textById };
}

/** Tolerant, splitter-tier scan of EXTERNAL declarations. Skips line comments and block comments. */
export function scanExternals(texts: Record<FilePath, string>): ExternalDecl[] {
  const re = /^\s*EXTERNAL\s+([\p{L}_][\p{L}\p{N}_]*)\s*\(([^)]*)\)/u;
  const out: ExternalDecl[] = [];
  const seen = new Set<string>();
  for (const text of Object.values(texts)) {
    let inBlock = false;
    for (const raw of splitLines(text)) {
      const bare = stripTerminator(raw);
      const wasBlock = inBlock;
      inBlock = scanCommentState(bare, inBlock);
      if (wasBlock) continue;
      const trimmed = bare.trim();
      if (trimmed.startsWith('//')) continue;
      const m = re.exec(bare);
      if (!m) continue;
      const name = m[1]!;
      if (seen.has(name)) continue;
      seen.add(name);
      const args = m[2]!.split(',').map((a) => a.trim()).filter(Boolean);
      out.push({ name, arity: args.length });
    }
  }
  return out;
}

/** Quoted names after "external(s):". Never anchors on the suffix — that changes with the fallbacks flag. */
export function namesFromMissingBindingMessage(msg: string): string[] {
  const mark = msg.search(/external[^:]*:\s*'/i);
  if (mark < 0) return [];
  const names: string[] = [];
  const re = /'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg.slice(mark)))) names.push(m[1]!);
  return names;
}

function stubOfArity(arity: number, read: () => number): (...args: unknown[]) => number {
  const args = Array.from({ length: Math.max(0, arity) }, (_, i) => `a${i}`);
  const fn = new Function(...args, 'return this.read();') as (...args: unknown[]) => number;
  return fn.bind({ read });
}

/**
 * Bind stubs for declared EXTERNALs (never shadowing an author-written ink fallback), then the
 * two-attempt ValidateExternalBindings protocol. An explicit Validate always redoes the tree walk
 * regardless of the internal validated flag. Never retry by calling Continue.
 */
export function bindExternals(
  story: RuntimeStory,
  declared: ExternalDecl[],
  parse: ParseResult | null,
): { stubbed: ExternalStub[]; unrepairable: string[] | null } {
  story.allowExternalFunctionFallbacks = true;
  const inkFallbacks = new Set((parse?.knots ?? []).filter((k) => k.isFunction).map((k) => k.name));
  const stubbed: ExternalStub[] = [];
  for (const { name, arity } of declared) {
    if (inkFallbacks.has(name)) continue;
    const stub: ExternalStub = { name, arity, value: 0 };
    try {
      story.BindExternalFunction(name, stubOfArity(arity, () => stub.value));
      stubbed.push(stub);
    } catch {
      /* already bound — binding a bound name throws */
    }
  }

  let unrepairable: string[] | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      story.ValidateExternalBindings();
      unrepairable = null;
      break;
    } catch (e) {
      const names = namesFromMissingBindingMessage(errorText(e));
      unrepairable = names;
      if (attempt === 1 || names.length === 0) break;
      for (const n of names) {
        const stub: ExternalStub = { name: n, arity: 0, value: 0 };
        try {
          story.BindExternalFunction(n, stubOfArity(0, () => stub.value));
          if (!stubbed.some((s) => s.name === n)) stubbed.push(stub);
        } catch {
          /* already bound */
        }
      }
    }
  }
  return { stubbed, unrepairable };
}

export function compileForPlay(root: FilePath, files: InkFile[], parse: ParseResult | null): CompileResult {
  const snapshot = freeze(root, files);
  const diagnostics: Diagnostic[] = [];
  let hadError = false;
  const onInkError = (message: string, type: number) => {
    if (type === 0) return;
    if (type === 2) hadError = true;
    diagnostics.push(parseInkMessage(message, type));
  };

  let story: RuntimeStory | null = null;
  try {
    const parser = new InkParser(snapshot.texts[root] ?? '', root, onInkError, null, new JsonFileHandler(snapshot.texts));
    const parsed = parser.ParseStory();
    if (!hadError) {
      (parsed as unknown as { countAllVisits: boolean }).countAllVisits = true;
      story = parsed.ExportRuntime(onInkError) as RuntimeStory | null;
    }
  } catch (e) {
    diagnostics.push({
      file: root,
      line: null,
      severity: 'error',
      message: 'Cannot compile for play: ' + (errorText(e) || 'internal error') + '. Known trigger: a CONST whose value is a divert target.',
    });
  }

  const empty: CompileResult = {
    story: null,
    snapshot,
    diagnostics,
    stubbed: [],
    unmatchedFiles: [],
    externalsUnrepairable: null,
  };
  if (!story) return empty;

  const { stubbed, unrepairable } = bindExternals(story, scanExternals(snapshot.texts), parse);
  if (unrepairable !== null) {
    return { ...empty, stubbed, externalsUnrepairable: unrepairable };
  }
  return { story, snapshot, diagnostics, stubbed, unmatchedFiles: [], externalsUnrepairable: null };
}
