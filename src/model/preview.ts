/**
 * The compressed structure preview of one knot: what the canvas draws instead of the knot's raw ink.
 *
 * Pure and framework-free (no React, no inkjs, no colours; pixels only from `layoutRows` down). This is a
 * deliberately *tolerant* scanner in the same tier as `splitter.ts`: it never throws, never loses a line, and
 * never decides anything the graph depends on. `PreviewRow.targets` is advisory -- it only labels a row. The
 * authoritative divert set stays the inkjs parser's, and wire handles are placed through `rowOf` alone, so a
 * scanner mistake can at worst mislabel a row; it can never lose a wire.
 *
 * One channel, one fact:
 *   vertical position -> source order    left edge -> weave depth    marker -> row kind
 *   readable text     -> names and divert targets, never prose
 *   bar width         -> prose mass, quantised to three steps: texture, not measurement
 *   brace nesting     -> a rail in its own column, never indent (that channel is weave depth's)
 */
import { countLines, matchKnotHeader, scanCommentState, splitLines, stripComments, stripTerminator } from './splitter';

export type RowKind =
  /** The knot's own `=== name ===` line. Row 0 of a knot segment; drawn as the card header, zero body height. */
  | 'header'
  /** A `= name` stitch header: an addressable anchor inside the knot. */
  | 'stitch'
  /** `*` or `+` at any depth, including inside a `{...}` block. */
  | 'choice'
  /** A real weave `-` gather, named or not. */
  | 'gather'
  /** Narrative text. Consecutive runs merge into one row. */
  | 'prose'
  /** A line whose only job is control flow: `-> x`, `->->`, `<- x`. */
  | 'divert'
  /** Conditional scaffolding: a multiline `{...}` opener, its `-` / `- else:` branches, its `}`. */
  | 'cond'
  /** `~`, VAR/CONST/LIST/EXTERNAL/INCLUDE, TODO. */
  | 'logic';

export type FlowKind = 'divert' | 'tunnel' | 'thread';

export interface PreviewRow {
  kind: RowKind;
  /** Weave depth from marker stacking, 0-based, clamped to MAX_DEPTH. Rows without markers inherit it. */
  depth: number;
  /** Enclosing multiline `{...}` blocks at this row (0 = not inside one). Drawn as a rail, never as indent. */
  braceDepth: number;
  /** Readable text: a choice's label. Empty for rows that are bare bars. */
  text: string;
  /** A named anchor: a gather's or choice's `(name)`, or a stitch's name. */
  name?: string;
  /** Divert targets written on this row, in source order. ADVISORY: labels only, never wire routing. */
  targets?: string[];
  flow?: FlowKind;
  /**
   * The line contains an arrow token -- `->`, `->->` or `<-` -- whether or not it named a target we kept.
   * This, not `targets`, is what the merge rule must ask: an arrow we deliberately skip as a divert-typed
   * argument (`TURNS_SINCE(-> x)`) still becomes a real `reference` edge with a source line, so its line still
   * needs a row of its own or the two wires leave the card from the same point.
   */
  arrow: boolean;
  /** This row carries, or is guarded by, a `{...}`. */
  cond: boolean;
  /** Characters of real text behind this row (merged runs summed). Drives the prose bar's width step. */
  chars: number;
  /** Segment-relative source lines this row covers, inclusive. 0 is the segment's first line. */
  from: number;
  to: number;
}

export interface KnotPreview {
  /**
   * The exact text this was built from. Callers reuse a preview when the text is unchanged, and the store's
   * `texts` map is updated on every keystroke -- so the only safe thing to compare against is what the scan
   * actually saw. It is the same string instance the caller already holds, so it costs a pointer.
   */
  source: string;
  rows: PreviewRow[];
  /**
   * `rowOf[i]` is the row index for segment-relative source line `i`. A TOTAL, monotonically non-decreasing
   * function over every line of the segment: a dropped line (blank, comment, glue) maps to the nearest
   * preceding kept line's row, so a wire handle can never fall off the map.
   */
  rowOf: number[];
}

/** Five visual indent levels. The whole sample corpus holds exactly two choices deeper than this. */
export const MAX_DEPTH = 4;

const IDENT = String.raw`[\p{L}_][\p{L}\p{N}_]*`;
/** A stitch header: exactly one `=`, then a name. Two or more is a knot header and belongs to the splitter. */
const STITCH_RE = new RegExp(String.raw`^[ \t﻿]*=(?!=)[ \t]*(${IDENT})`, 'u');
const NAME_RE = new RegExp(String.raw`^[ \t]*\((${IDENT})\)`, 'u');
const TARGET_RE = new RegExp(String.raw`(->->|->|<-)[ \t]*(${IDENT}(?:\.${IDENT})*)?`, 'gu');
const LOGIC_RE = /^[ \t]*(?:~|VAR\b|CONST\b|LIST\b|EXTERNAL\b|INCLUDE\b|TODO\b)/u;
/** Placeholder left behind by a collapsed `{...}` group, so its bulk is not counted as prose. */
const BRACE_MARK = '·';

/**
 * Scan one knot segment (or a file's top-level content) into preview rows.
 * `text` is the editor text of the segment: line 0 is the `=== knot ===` header for a knot, ordinary content
 * for a preamble.
 */
export function buildPreview(text: string): KnotPreview {
  const lines = splitLines(text);
  // The editor text hides the segment's final terminator, so the segment has one more line than terminators.
  const lineCount = Math.max(countLines(text) + 1, lines.length);
  const rows: PreviewRow[] = [];
  const rowOf: number[] = new Array<number>(lineCount).fill(0);

  let inBlock = false;
  let braceDepth = 0;
  let lastDepth = 0;
  /** A blank line ends a prose run: an author's paragraph break earns a second bar. Comments stay invisible. */
  let breakRun = false;

  for (let i = 0; i < lineCount; i++) {
    const raw = stripTerminator(lines[i] ?? '');
    const blank = raw.trim() === '';
    const wasInBlock = inBlock;
    const { code } = stripComments(i === 0 ? raw.replace(/^﻿/, '') : raw, inBlock);
    inBlock = scanCommentState(raw, inBlock);

    const scanned = classify(code, { first: i === 0, inBlock: wasInBlock, braceDepth, lastDepth });
    braceDepth = scanned.braceDepth;
    if (scanned.row === null) {
      // Dropped (blank, comment-only, glue): it maps to the row above, which keeps `rowOf` total.
      // Only a genuinely empty line breaks the run -- `code` is comment-stripped, so testing it would make a
      // `// note` between two paragraphs split them.
      if (blank) breakRun = true;
      rowOf[i] = Math.max(0, rows.length - 1);
      continue;
    }
    const next = scanned.row;
    next.from = i;
    next.to = i;
    if (next.kind === 'choice' || next.kind === 'gather') lastDepth = next.depth;
    else if (next.kind === 'header' || next.kind === 'stitch') lastDepth = 0;

    const prev = rows[rows.length - 1];
    if (prev && !breakRun && mergeable(prev, next)) {
      prev.to = i;
      prev.chars += next.chars + 1;
      prev.cond ||= next.cond;
      rowOf[i] = rows.length - 1;
    } else if (prev && absorbsDivert(prev, next)) {
      prev.to = i;
      prev.targets = next.targets;
      prev.flow = next.flow;
      prev.arrow = true;
      prev.cond ||= next.cond;
      rowOf[i] = rows.length - 1;
    } else if (prev && prev.kind === 'choice' && next.kind === 'choice') {
      // Adjacent sibling choices must each keep a row. Falling through is the default; this branch
      // exists so a future merge rule cannot silently eat one (the canvas must never hide a choice).
      rows.push(next);
      rowOf[i] = rows.length - 1;
    } else {
      rows.push(next);
      rowOf[i] = rows.length - 1;
    }
    breakRun = false;
  }

  if (rows.length === 0) rows.push(blankRow('prose', 0, 0));
  return { source: text, rows, rowOf };
}

/**
 * Rows never merge across a landmark or a divert. Every choice, gather, stitch and divert stays countable, and
 * -- the load-bearing part -- every divert-bearing line keeps a row of its own, so two out-handles can never
 * collide on one y unless they were already written on the same source line.
 */
function mergeable(a: PreviewRow, b: PreviewRow): boolean {
  return (
    a.kind === b.kind &&
    (a.kind === 'prose' || a.kind === 'logic') &&
    a.depth === b.depth &&
    a.braceDepth === b.braceDepth &&
    !a.arrow &&
    !b.arrow
  );
}

/**
 * A choice whose whole body is "go there" shows where it goes on its own row, instead of spending a second row
 * on a lone arrow. Only a choice that carries no arrow of its own may absorb one: otherwise two divert-bearing
 * source lines would end up sharing a row, and with them their out-handles.
 */
function absorbsDivert(choice: PreviewRow, divert: PreviewRow): boolean {
  // A following *choice* is never a divert, even if it also jumps somewhere: absorbing it would
  // keep the first label and steal the second arrow, hiding a whole option from the graph.
  return (
    choice.kind === 'choice' &&
    !choice.arrow &&
    divert.kind === 'divert' &&
    (divert.targets?.length ?? 0) > 0
  );
}

function blankRow(kind: RowKind, depth: number, braceDepth: number): PreviewRow {
  return { kind, depth, braceDepth, text: '', cond: false, arrow: false, chars: 0, from: 0, to: 0 };
}

interface ScanState {
  first: boolean;
  inBlock: boolean;
  braceDepth: number;
  lastDepth: number;
}

/** One line to at most one row. `row: null` means the line draws nothing. */
function classify(code: string, st: ScanState): { row: PreviewRow | null; braceDepth: number } {
  const trimmed = code.trim();
  if (trimmed === '' || trimmed === '<>') return { row: null, braceDepth: st.braceDepth };

  // Measured before any stripping, so an inline `{a:long text|other long text}` still reads as a full line of
  // prose rather than collapsing to a one-character bar.
  const chars = trimmed.length;
  if (st.first && matchKnotHeader(code, st.inBlock)) {
    return { row: { ...blankRow('header', 0, st.braceDepth), chars }, braceDepth: st.braceDepth };
  }
  const stitch = st.braceDepth === 0 ? STITCH_RE.exec(code) : null;
  if (stitch) {
    return { row: { ...blankRow('stitch', 0, st.braceDepth), name: stitch[1], chars }, braceDepth: st.braceDepth };
  }

  const mark = markerScan(code);
  // A `-` run inside a multiline `{...}` is a switch or `- else:` branch, not a weave gather. `*` and `+`
  // inside one are still real choices, so the brace test applies to all-dash runs only.
  let kind: RowKind | null = mark.kind === 'choice' ? 'choice' : mark.kind === 'gather' ? (st.braceDepth > 0 ? 'cond' : 'gather') : null;
  // A `-` inside a block is brace scaffolding, so its dash count says nothing about weave depth: it inherits
  // the depth it sits in, exactly like the block's `{` opener and `}` closer rows do.
  const depth = kind === null || kind === 'cond' ? st.lastDepth : Math.min(mark.markers - 1, MAX_DEPTH);

  let rest = mark.rest;
  let name: string | undefined;
  if (kind === 'choice' || kind === 'gather') {
    const named = NAME_RE.exec(rest);
    if (named) {
      name = named[1];
      rest = rest.slice(named[0].length);
    }
  }

  // Targets are read before the braces collapse, so a divert written inside a condition is still seen.
  const found = scanTargets(rest);
  const collapsed = collapseBraces(rest, st.braceDepth);
  const bare = stripTargets(collapsed.out);
  const text = kind === 'choice' ? choiceLabel(bare) : '';
  const residual = kind === 'choice' ? text : clean(bare);
  const guard = (kind === 'choice' || kind === 'gather') && isChoiceGuard(rest);
  // A pip means "this line branches". Interpolation `{score}` and alternatives `{a|b}` do not.
  const cond = collapsed.cond || guard;

  if (kind === null) {
    if (residual === '') {
      // A bare `->->` is the one targetless form that is genuinely control flow; anything else with no target
      // to show is not worth calling a divert.
      if (found.targets.length > 0 || found.flow === 'tunnel') kind = 'divert';
      else if (cond || collapsed.braceDepth !== st.braceDepth) kind = 'cond';
      else if (bare.includes(BRACE_MARK)) kind = 'prose';
      else return { row: null, braceDepth: collapsed.braceDepth };
    } else kind = LOGIC_RE.test(code) ? 'logic' : 'prose';
  }

  const row: PreviewRow = { ...blankRow(kind, depth, st.braceDepth), text, chars, cond, arrow: found.arrow };
  if (name !== undefined) row.name = name;
  if (found.targets.length > 0) row.targets = found.targets;
  if (found.flow !== undefined) row.flow = found.flow;
  return { row, braceDepth: collapsed.braceDepth };
}

/**
 * Consume the leading run of weave markers. A char scan, not a regex, because `**`, `* *` and `* * *` all mean
 * the same depth. A `-` immediately followed by `>` is a divert, not a gather, and stops the run.
 */
function markerScan(s: string): { markers: number; kind: 'choice' | 'gather' | null; rest: string } {
  let i = 0;
  let markers = 0;
  let choice = false;
  while (i < s.length) {
    const c = s[i]!;
    if (c === ' ' || c === '\t' || c === '﻿') {
      i++;
      continue;
    }
    if (c === '*' || c === '+') {
      choice = true;
      markers++;
      i++;
      continue;
    }
    if (c === '-' && s[i + 1] !== '>') {
      markers++;
      i++;
      continue;
    }
    break;
  }
  if (markers === 0) return { markers: 0, kind: null, rest: s };
  return { markers, kind: choice ? 'choice' : 'gather', rest: s.slice(i) };
}

/**
 * Every divert target written on the line, in source order -- all of them, so a shuffled divert
 * (`{~->A|->B|->C}`) labels its row with everything it can reach. An arrow whose previous non-space character
 * is `(` or `,` is a divert-typed argument (`TURNS_SINCE(-> x)`), not a jump.
 */
function scanTargets(s: string): { targets: string[]; flow: FlowKind | undefined; arrow: boolean } {
  const targets: string[] = [];
  let flow: FlowKind | undefined;
  let arrow = false;
  TARGET_RE.lastIndex = 0;
  for (let m = TARGET_RE.exec(s); m !== null; m = TARGET_RE.exec(s)) {
    // Set before the skip below: the merge rule needs to know an arrow was written here even when we do not
    // keep its target.
    arrow = true;
    const before = s.slice(0, m.index).trimEnd();
    const prev = before[before.length - 1];
    if (prev === '(' || prev === ',') continue;
    const token = m[1];
    const target = m[2];
    if (target !== undefined) targets.push(target);
    // `->->` returns from a tunnel; `-> x ->` calls one, and its second arrow names nothing.
    const kind: FlowKind =
      token === '->->' || (token === '->' && target === undefined && targets.length > 0) ? 'tunnel' : token === '<-' ? 'thread' : 'divert';
    if (flow === undefined || kind !== 'divert') flow = kind;
  }
  return { targets, flow, arrow };
}

/** Remove the divert tokens themselves, so what is left is the line's own text. */
function stripTargets(s: string): string {
  return s.replace(TARGET_RE, ' ');
}

/**
 * Hide the contents of every `{...}` group opened on this line, leaving one mark so the row still reports
 * "there is a condition here". Groups opened on an earlier line are not hidden: their contents are the block's
 * ordinary body. Unbalanced braces move `braceDepth` instead of throwing.
 */
function collapseBraces(s: string, braceDepth: number): { out: string; cond: boolean; braceDepth: number } {
  let out = '';
  let local = 0;
  let cond = false;
  let depth = braceDepth;
  let inner = '';
  for (const c of s) {
    if (c === '{') {
      if (local === 0) inner = '';
      else inner += c;
      local++;
      continue;
    }
    if (c === '}') {
      if (local > 0) {
        local--;
        if (local === 0) {
          out += BRACE_MARK;
          if (braceIsCondition(inner)) cond = true;
          inner = '';
        } else inner += c;
      } else if (depth > 0) {
        depth--;
        // The `}` of a multiline `{...}` is itself condition scaffolding.
        cond = true;
      }
      continue;
    }
    if (local === 0) out += c;
    else inner += c;
  }
  // Unclosed `{ flagged:` on this line is a multiline opener — the colon makes it a real branch.
  if (local > 0 && braceIsCondition(inner)) cond = true;
  return { out, cond, braceDepth: depth + local };
}

/**
 * True when a `{...}` actually branches: `{cond: yes|no}` or `{ value:` switches. Plain `{score}`
 * interpolation and `{a|b|c}` alternatives do not — those don't change flow.
 */
function braceIsCondition(inner: string): boolean {
  return inner.includes(':');
}

/**
 * After `*`/`+`/`-`, a `{expr}` with no `|` (or with a `:`) is ink's choice/gather condition, even
 * without a colon — `* {flag} [Go]` is only offered when `flag` is true.
 */
function isChoiceGuard(rest: string): boolean {
  const m = /^[ \t]*\{([^{}]*)\}/.exec(rest);
  if (m) {
    const inner = m[1]!;
    if (inner.includes(':')) return true;
    if (inner.includes('|')) return false;
    return inner.trim() !== '';
  }
  return /^[ \t]*\{[^{}]*$/.test(rest);
}

/**
 * What ink shows in the choice list: the text before `[`, plus the text inside it. Anything after `]` is the
 * continuation printed once the choice is taken, and is not part of the label.
 */
function choiceLabel(s: string): string {
  const open = s.indexOf('[');
  if (open === -1) return clean(s);
  const close = s.indexOf(']', open);
  if (close === -1) return clean(s);
  const after = s.slice(close + 1);
  // Wrapped-line editing can land a second `*`/`+` on the same source line as `[label]`. Dropping
  // the continuation would hide that choice; keep the whole line readable instead.
  if (/[ \t]*[*+]/.test(after)) return clean(s);
  return clean(s.slice(0, open) + s.slice(open + 1, close));
}

function clean(s: string): string {
  return s.split(BRACE_MARK).join(' ').replace(/\s+/g, ' ').trim();
}

/** The row a segment-relative source line is drawn on. Clamped, so an out-of-range line still lands. */
export function lineToRow(p: KnotPreview, line: number): number {
  if (line <= 0) return 0;
  if (line >= p.rowOf.length) return p.rows.length - 1;
  return p.rowOf[line]!;
}

/** The first source line a row covers -- where a click on the row should put the cursor. */
export function rowToLine(p: KnotPreview, row: number): number {
  return p.rows[Math.max(0, Math.min(row, p.rows.length - 1))]?.from ?? 0;
}

/* ------------------------------------------------------------------ geometry */

export interface RowMetrics {
  /** Height of a bare-bar row (prose, logic, plain gather, condition scaffolding). */
  bar: number;
  /** Height of a row that carries readable text (choice, stitch, divert, anything named). */
  text: number;
  /** Padding above the first row and below the last. */
  pad: number;
  /** Horizontal step per weave depth level. */
  indent: number;
  /** A squeezed bar row never goes below this. */
  barMin: number;
  /** Below this height a text row cannot be read, so its label is dropped and the marker stands alone. */
  textMin: number;
}

export const DEFAULT_METRICS: RowMetrics = { bar: 6, text: 13, pad: 4, indent: 8, barMin: 2, textMin: 9 };

/** Natural height a preview grows to before bar rows start squeezing. Matches the old editor's cap. */
export const PREVIEW_MAX_H = 420;

/** Rows that show words. Everything else is a bar, and its height is the cheap one to give away. */
export function isTextRow(row: PreviewRow): boolean {
  if (row.kind === 'header') return false;
  if (row.kind === 'stitch' || row.kind === 'choice' || row.kind === 'divert') return true;
  return row.name !== undefined || (row.targets?.length ?? 0) > 0;
}

export interface RowGeometry {
  /** Top of each row within the body box, padding included. Parallel to `KnotPreview.rows`. */
  tops: number[];
  heights: number[];
  /** Total body height: the rows plus both pads. */
  height: number;
  /** Height a text row is drawn at after squeezing. */
  textHeight: number;
  /** False when text rows got too short to read; markers stay, labels go. */
  showText: boolean;
}

/**
 * Row heights and offsets, and the only place row y is decided -- shared by the node card and by the wire
 * routing so the two cannot disagree.
 *
 * Past `cap` the *bar* rows squeeze toward `barMin` first, because a prose bar's height carries no
 * information. Text rows are never shrunk on their own account: a tall knot just grows, which keeps every
 * choice label readable on exactly the big, branchy knots that most need them. Only when the user has
 * hand-set the node's height (`fit`) does the whole thing scale to obey, and then labels may drop out.
 */
export function layoutRows(p: KnotPreview, cap: number, fit = false, m: RowMetrics = DEFAULT_METRICS): RowGeometry {
  const text = p.rows.map(isTextRow);
  let bars = 0;
  let texts = 0;
  for (let i = 0; i < p.rows.length; i++) {
    if (p.rows[i]!.kind === 'header') continue;
    if (text[i]) texts++;
    else bars++;
  }
  const body = Math.max(0, cap - m.pad * 2);
  let barH = m.bar;
  let textH = m.text;
  if (bars * barH + texts * textH > body && bars > 0) {
    barH = clamp(Math.floor((body - texts * textH) / bars), m.barMin, m.bar);
  }
  if (fit && bars * barH + texts * textH > body) {
    const scale = body / (bars * barH + texts * textH);
    barH = Math.max(1, Math.floor(barH * scale));
    textH = Math.max(1, Math.floor(textH * scale));
  }

  const tops: number[] = [];
  const heights: number[] = [];
  let y = m.pad;
  // Under `fit` the rows must end up inside the box even when the 1px floor cannot fit them all: the handles
  // are children of the card, not of the clipped body, so a row stack taller than its cap would put wire
  // endpoints out in empty canvas. Rows past the bottom collapse onto the edge instead. Heights are the
  // running sum the browser will also compute, so the DOM cannot disagree.
  let room = fit ? body : Number.POSITIVE_INFINITY;
  for (let i = 0; i < p.rows.length; i++) {
    const want = p.rows[i]!.kind === 'header' ? 0 : text[i] ? textH : barH;
    const h = Math.max(0, Math.min(want, room));
    room -= h;
    tops.push(y);
    heights.push(h);
    y += h;
  }
  return { tops, heights, height: y + m.pad, textHeight: textH, showText: textH >= m.textMin };
}

/**
 * How wide a bare bar is drawn, as a fraction of its track. Three steps on the corpus's own quartiles, not a
 * continuous scale: 71% of prose lines are long enough that any readable calibration would saturate, and
 * nobody measures a three-level scale, so it reads as texture rather than a claim.
 */
export function barWidth(chars: number): number {
  if (chars < 80) return 0.4;
  if (chars < 240) return 0.68;
  return 0.96;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
