/**
 * Divert targets in the editor become links: click the name and the canvas travels to the knot it
 * names, instead of you having to go and find it. This is the reading path the graph exists for,
 * only from inside the text.
 *
 * The targets are found with the same arrow scan the preview uses rather than by walking the ink
 * grammar, so the two agree about what a divert target looks like and neither depends on the
 * parser's node shapes.
 *
 * The hit box is the name glyphs themselves (`.cm-ink-link`), not the leftover space of the line.
 * CodeMirror's `posAtCoords` maps a click to the right of the text — a very common "put my cursor
 * at the end" gesture — onto the last character, which is often the divert target. Asking the DOM
 * whether the click actually landed on the mark is what keeps that gesture from navigating away.
 */
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

const IDENT = String.raw`[\p{L}_][\p{L}\p{N}_]*`;
const TARGET_RE = new RegExp(String.raw`(->->|->|<-)[ \t]*(${IDENT}(?:\.${IDENT})*)`, 'gu');
/** Ends of the story, not places you can go. */
const NOT_A_PLACE = new Set(['DONE', 'END']);

const linkMark = Decoration.mark({ class: 'cm-ink-link' });

export interface LinkTargets {
  /** Whether this target names somewhere we can actually take the reader. */
  resolves(target: string): boolean;
  follow(target: string): void;
}

/** Where a target sits on a line, in document offsets. */
export function targetsIn(text: string, from: number): { start: number; end: number; name: string }[] {
  const out: { start: number; end: number; name: string }[] = [];
  TARGET_RE.lastIndex = 0;
  for (let m = TARGET_RE.exec(text); m !== null; m = TARGET_RE.exec(text)) {
    const name = m[2]!;
    if (NOT_A_PLACE.has(name)) continue;
    const start = from + m.index + m[0].length - name.length;
    out.push({ start, end: start + name.length, name });
  }
  return out;
}

/**
 * True when the click landed on the divert-name mark, not on the rest of the line (or the
 * empty space a wrapped line leaves to the right of the text). Clicks on the letters themselves
 * may target a text node; walk to its parent so those still count.
 */
export function isDivertLinkNode(target: EventTarget | null): boolean {
  type Nodeish = { nodeType?: number; parentElement?: unknown; closest?: (selector: string) => unknown };
  let node: Nodeish | null = target && typeof target === 'object' ? (target as Nodeish) : null;
  if (!node) return false;
  if (node.nodeType === 3 && node.parentElement && typeof node.parentElement === 'object') {
    node = node.parentElement as Nodeish;
  }
  return typeof node.closest === 'function' && node.closest('.cm-ink-link') != null;
}

function decorate(view: EditorView, links: LinkTargets): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      // Only mark what we can follow. An underline that does nothing when clicked is worse than no underline.
      for (const t of targetsIn(line.text, line.from)) if (links.resolves(t.name)) builder.add(t.start, t.end, linkMark);
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

/**
 * The resolver is read through a ref so the extension itself stays stable: rebuilding the extension array on
 * every render would tear down and remount the editor, dropping the caret.
 */
export function inkLinks(links: { current: LinkTargets }) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorate(view, links.current);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = decorate(u.view, links.current);
      }
    },
    { decorations: (v) => v.decorations },
  );

  const clicks = EditorView.domEventHandlers({
    click(event, view) {
      // Alt is the escape hatch: hold it to put the cursor inside a target and edit the name instead.
      if (event.altKey) return false;
      if (!isDivertLinkNode(event.target)) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const line = view.state.doc.lineAt(pos);
      const hits = targetsIn(line.text, line.from).filter((t) => links.current.resolves(t.name));
      const hit = hits.find((t) => pos >= t.start && pos <= t.end) ?? (hits.length === 1 ? hits[0] : null);
      if (!hit) return false;
      links.current.follow(hit.name);
      return true;
    },
  });

  return [plugin, clicks];
}
