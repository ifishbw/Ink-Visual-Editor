/**
 * Thin wrapper around the inkjs compiler's parser. Supplies knots, stitches, diverts and diagnostics
 * with file + line information. It never defines what the graph's nodes are (see splitter.ts).
 *
 * inkjs rules (verified against 2.4.0, see docs/RESEARCH.md):
 * - import runtime classes only from 'inkjs/full' and dispatch on `typeName`, never `instanceof`;
 * - `InkParser.ParseStory()` survives syntax errors and returns a partial AST;
 * - `debugMetadata` may be null on any node; a file handler is always required.
 */
import * as inkFull from 'inkjs/full';
import type { InkParser as InkParserClass } from 'inkjs/compiler/Parser/InkParser';
import type { JsonFileHandler as JsonFileHandlerClass } from 'inkjs/compiler/FileHandler/JsonFileHandler';
import type { Story as ParsedStory } from 'inkjs/compiler/Parser/ParsedHierarchy/Story';
import type { Diagnostic, DivertKind, FilePath, ParsedDivert, ParsedKnot, ParseResult } from './types';
import { preambleId } from './splitter';

// ink.d.mts does not declare InkParser even though the bundle exports it.
const { InkParser, JsonFileHandler } = inkFull as unknown as {
  InkParser: typeof InkParserClass;
  JsonFileHandler: typeof JsonFileHandlerClass;
};

export interface ParseInput {
  root: FilePath;
  /** Every file of the project keyed by the path as written in INCLUDE statements. */
  files: Record<FilePath, string>;
}

const enum InkErrorType {
  Author = 0,
  Warning = 1,
  Error = 2,
}

/** Any AST node. Typed loosely on purpose: we only read a handful of documented properties. */
type AstNode = {
  typeName?: string;
  content?: unknown;
  debugMetadata?: { fileName: string | null; startLineNumber: number } | null;
  [key: string]: unknown;
};

const CHILD_PROPS = [
  'content',
  'expression',
  'initialCondition',
  'branches',
  'condition',
  'divert',
  'proxyDivert',
  'args',
  'startContent',
  'choiceOnlyContent',
  'innerContent',
  'subFlowsByName',
] as const;

export function parseProject(input: ParseInput): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  const report = (d: Diagnostic) => {
    const key = `${d.severity}|${d.file}|${d.line}|${d.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(d);
    }
  };
  const onInkError = (message: string, type: number) => {
    if (type === InkErrorType.Author) return; // TODOs are collected from the AST instead, so they survive syntax errors
    report(parseInkMessage(message, type));
  };

  const empty: ParseResult = { knots: [], diverts: [], divertVariables: [], preambleLabels: [], diagnostics };
  const rootText = input.files[input.root];
  if (rootText === undefined) {
    report({ file: input.root, line: null, message: 'Root file is not loaded', severity: 'error' });
    return empty;
  }

  let story: ParsedStory | null = null;
  try {
    const parser = new InkParser(rootText, input.root, onInkError, null, new JsonFileHandler(input.files));
    story = parser.ParseStory();
  } catch (e) {
    report({ file: input.root, line: null, message: `Parser failed: ${errorText(e)}`, severity: 'error' });
  }
  if (!story) return empty;

  // Semantic pass: undefined divert targets, duplicate names, unreachable-content warnings.
  // inkjs skips it when the parse had errors, so these only appear once the syntax is clean.
  try {
    story.ExportRuntime(onInkError);
  } catch (e) {
    // inkjs 2.4 throws here for a CONST holding a divert target; nothing else of ours can recover the semantic pass.
    report({
      file: input.root,
      line: null,
      message: `Semantic checks skipped: inkjs failed (${errorText(e) || 'internal error'}). Known trigger: a CONST whose value is a divert target.`,
      severity: 'warning',
    });
  }

  const result: ParseResult = { knots: [], diverts: [], divertVariables: [], preambleLabels: [], diagnostics };
  walk(story as unknown as AstNode, { knot: null, inChoice: false, inTarget: false }, new Set(), result, input.root, report);
  for (const k of result.knots) {
    k.labels = [...new Set(k.labels)];
    k.divertParams = [...new Set(k.divertParams)];
  }
  result.divertVariables = [...new Set(result.divertVariables)];
  result.preambleLabels = [...new Set(result.preambleLabels)];
  return result;
}

interface WalkCtx {
  knot: ParsedKnot | null;
  inChoice: boolean;
  inTarget: boolean;
}

function walk(
  node: AstNode,
  ctx: WalkCtx,
  visited: Set<object>,
  out: ParseResult,
  root: FilePath,
  report: (d: Diagnostic) => void,
): void {
  if (visited.has(node)) return;
  visited.add(node);
  const dm = node.debugMetadata ?? null;
  const file = dm?.fileName ?? root;
  const line = dm?.startLineNumber ?? null;
  let next = ctx;

  switch (node.typeName) {
    case 'Knot':
    case 'Function': {
      // Function knots report typeName 'Function'; both extend FlowBase.
      const name = String(node.name ?? '');
      const subFlows = node.subFlowsByName as Map<string, unknown> | undefined;
      const knot: ParsedKnot = {
        name,
        file,
        line: line ?? 0,
        isFunction: node.typeName === 'Function' || node.isFunction === true,
        stitches: subFlows ? [...subFlows.keys()] : [],
        stitchLines: {},
        labels: [],
        divertParams: [],
      };
      out.knots.push(knot);
      next = { ...ctx, knot };
      for (const arg of (node.args as { identifier?: { name?: string }; isDivertTarget?: boolean | null }[] | null) ?? []) {
        if (arg.isDivertTarget && arg.identifier?.name) knot.divertParams.push(arg.identifier.name);
      }
      break;
    }
    case 'Stitch':
      if (ctx.knot && typeof node.name === 'string' && line !== null) ctx.knot.stitchLines[node.name] = line;
      break;
    case 'Choice':
      next = { ...ctx, inChoice: true };
      if (typeof node.name === 'string') (ctx.knot?.labels ?? out.preambleLabels).push(node.name);
      break;
    case 'Gather':
      if (typeof node.name === 'string') (ctx.knot?.labels ?? out.preambleLabels).push(node.name);
      break;
    case 'DivertTarget':
      next = { ...ctx, inTarget: true };
      break;
    case 'Divert': {
      const target = (node.target as { dotSeparatedComponents?: string } | null)?.dotSeparatedComponents;
      const implicit = dm === null && ctx.knot === null && (node.isDone === true || node.isEnd === true);
      if (target && !implicit) {
        // `implicit` skips the `-> DONE` inkjs appends to the top-level content itself.
        const divert: ParsedDivert = {
          fromKnot: ctx.knot?.name ?? preambleId(file),
          target,
          kind: divertKind(node, ctx),
          inChoice: ctx.inChoice,
          file,
          line,
        };
        out.diverts.push(divert);
      }
      break;
    }
    case 'AuthorWarning':
      report({ file, line, message: String(node.warningMessage ?? 'TODO'), severity: 'todo' });
      break;
    default:
      break;
  }

  // VAR / CONST declarations whose value is a divert target (`VAR next = -> knot`). Matched by shape, not typeName.
  if ('variableIdentifier' in node || 'constantIdentifier' in node) {
    const expr = node.expression as AstNode | null | undefined;
    const name = (node.variableName ?? node.constantName) as string | undefined;
    const isGlobal = 'constantIdentifier' in node || node.isGlobalDeclaration === true;
    if (isGlobal && name && expr?.typeName === 'DivertTarget') out.divertVariables.push(name);
  }

  for (const prop of CHILD_PROPS) {
    const value = node[prop];
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) walk(child, next, visited, out, root, report);
    } else if (value instanceof Map) {
      for (const child of value.values()) if (isNode(child)) walk(child, next, visited, out, root, report);
    } else if (isNode(value)) {
      walk(value, next, visited, out, root, report);
    }
  }
}

function isNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && 'typeName' in value;
}

function divertKind(node: AstNode, ctx: WalkCtx): DivertKind {
  if (node.isFunctionCall === true) return 'call';
  if (node.isThread === true) return 'thread';
  if (node.isTunnel === true) return 'tunnel';
  if (ctx.inTarget) return 'reference';
  return 'divert';
}

const MESSAGE_RE = /^(?:RUNTIME )?(ERROR|WARNING|TODO):\s*(?:'([^']*)'\s*)?(?:line\s+(\d+):\s*)?([\s\S]*)$/;

/** Turn inkjs's pre-formatted `ERROR: 'file' line N: text` strings into structured diagnostics. */
export function parseInkMessage(message: string, type: number): Diagnostic {
  const severity: Diagnostic['severity'] = type === InkErrorType.Error ? 'error' : type === InkErrorType.Warning ? 'warning' : 'todo';
  const m = MESSAGE_RE.exec(message);
  if (!m) return { file: null, line: null, message, severity };
  return {
    file: m[2] ?? null,
    line: m[3] ? Number(m[3]) : null,
    message: m[4] ?? message,
    severity,
  };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
