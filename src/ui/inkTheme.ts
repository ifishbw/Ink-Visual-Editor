/**
 * CodeMirror colors for ink, modeled on Inky's dark editor (orange declarations, red choice markers and
 * values, underlined blue divert targets, gray comments and tags) with a matching light variant.
 * Also the wrapping and indentation behaviour the weave needs to stay readable.
 */
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

export type Theme = 'dark' | 'light';

/** Horizontal padding on `.cm-line`; the hanging indent has to add to it rather than replace it. */
const LINE_PAD = 10;
/** ink is written with four spaces a level, and Tab (`indentWithTab`, on by default) inserts one level. */
const INDENT = '    ';

/**
 * Leading whitespace plus the weave markers that precede a line's text: any run of `*`, `+` or gather `-`
 * (but not a `->` divert), and an optional `(label)`. Wrapped text hangs under this, which is where the
 * line's own content starts.
 */
const HANG_RE = /^[ \t]*(?:(?:\*|\+|-(?!>))[ \t]*)*(?:\([^)\n]*\)[ \t]*)?/;

/** Width of that prefix in columns, expanding tabs. */
export function hangColumns(text: string, tabSize: number): number {
  let col = 0;
  for (const ch of HANG_RE.exec(text)![0]) col += ch === '\t' ? tabSize - (col % tabSize) : 1;
  return col;
}

function hangDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      const col = hangColumns(line.text, view.state.tabSize);
      if (col > 0) {
        const style = `padding-left:calc(${LINE_PAD}px + ${col}ch);text-indent:-${col}ch`;
        builder.add(line.from, line.from, Decoration.line({ attributes: { style } }));
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

/**
 * A wrapped line keeps its indentation. ink's weave is read by indentation, and CodeMirror's line wrapping
 * otherwise sends the overflow back to column 0, which makes a deeply nested choice unreadable. The standard
 * negative-`text-indent` + `padding-left` pair does it; `ch` units line the overflow up with the text above
 * because the editor is monospace.
 */
const hangingIndent = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = hangDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = hangDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

const PALETTES = {
  dark: {
    content: '#d8dade',
    keyword: '#e5a44b',
    name: '#7fb4ff',
    literal: '#e06c75',
    control: '#e06c75',
    tag: '#8a8f9a',
    comment: '#6e737d',
    brace: '#9fb8e0',
    paren: '#98c379',
    operator: '#b5b9c4',
    list: '#c678dd',
    heading: '#8d919b',
    bg: '#1e1f23',
    selection: '#34405e',
    cursor: '#f0f0f0',
  },
  light: {
    content: '#1c2240',
    keyword: '#b35c00',
    name: '#1a5fd0',
    literal: '#c7254e',
    control: '#c7254e',
    tag: '#7a7f8a',
    comment: '#8a8f9a',
    brace: '#4a6fa5',
    paren: '#2e8b57',
    operator: '#4a5170',
    list: '#8e44ad',
    heading: '#7c829c',
    bg: '#ffffff',
    selection: '#d6e2ff',
    cursor: '#1c2240',
  },
} as const;

/** Default editor size. The user can change it; everything else here is derived from whatever they pick. */
export const DEFAULT_CODE_FONT = 12;

export function inkEditorTheme(theme: Theme, fontSize: number = DEFAULT_CODE_FONT) {
  const p = PALETTES[theme];
  // The hanging indent measures in `ch`, so it follows the font size on its own.
  const lineHeight = Math.round(fontSize * 1.42);
  const highlight = HighlightStyle.define([
    { tag: t.content, color: p.content },
    { tag: [t.keyword, t.operatorKeyword], color: p.keyword },
    { tag: t.name, color: p.name, textDecoration: 'underline', textUnderlineOffset: '2px' },
    { tag: [t.literal, t.bool, t.number, t.string], color: p.literal },
    { tag: t.labelName, color: p.tag },
    { tag: [t.comment, t.blockComment], color: p.comment, fontStyle: 'italic' },
    { tag: [t.controlOperator, t.squareBracket], color: p.control },
    { tag: t.brace, color: p.brace },
    { tag: t.paren, color: p.paren },
    { tag: [t.operator, t.separator, t.logicOperator, t.compareOperator, t.arithmeticOperator, t.bracket], color: p.operator },
    { tag: t.list, color: p.list },
    { tag: [t.heading1, t.heading2], color: p.heading },
  ]);
  const base = EditorView.theme(
    {
      '&': { fontSize: `${fontSize}px`, backgroundColor: p.bg, color: p.content },
      '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: `${lineHeight}px` },
      '.cm-content': { padding: '6px 0', caretColor: p.cursor },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: p.cursor },
      '&.cm-focused': { outline: 'none' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: p.selection },
      '.cm-line': { padding: `0 ${LINE_PAD}px` },
    },
    { dark: theme === 'dark' },
  );
  return [syntaxHighlighting(highlight), base, EditorView.lineWrapping, hangingIndent, indentUnit.of(INDENT)];
}
