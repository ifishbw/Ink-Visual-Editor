import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { editorText } from './ops';
import { DEFAULT_METRICS, MAX_DEPTH, PREVIEW_MAX_H, buildPreview, isTextRow, layoutRows, lineToRow, rowToLine, type PreviewRow } from './preview';
import { countLines, makeInkFile, stripComments } from './splitter';

const kinds = (text: string) => buildPreview(text).rows.map((r) => r.kind);
const rows = (text: string) => buildPreview(text).rows;
const only = (text: string): PreviewRow => {
  const r = rows(text);
  expect(r).toHaveLength(1);
  return r[0]!;
};

describe('classification', () => {
  it('reads the knot header as row 0 and a stitch as its own row', () => {
    const p = buildPreview('=== forest ===\n= clearing\nA quiet place.');
    expect(p.rows.map((r) => r.kind)).toEqual(['header', 'stitch', 'prose']);
    expect(p.rows[1]!.name).toBe('clearing');
  });

  it('takes depth from the number of markers, however they are spaced', () => {
    expect(only('* * * * [Confess]').depth).toBe(3);
    expect(only('**[x]').depth).toBe(1);
    expect(only('* * *[y]').depth).toBe(2);
    expect(only('*****[deep]').depth).toBe(MAX_DEPTH);
  });

  it('reads a gather run, ignoring glue', () => {
    const r = only('- - - -\t <> I do not mind telling you');
    expect(r.kind).toBe('gather');
    expect(r.depth).toBe(3);
  });

  it('tells the flow kinds apart', () => {
    expect(only('-> priest').kind).toBe('divert');
    expect(only('-> priest').targets).toEqual(['priest']);
    expect(only('->->').flow).toBe('tunnel');
    expect(only('->->').kind).toBe('divert');
    expect(only('<- ambient_sound').flow).toBe('thread');
    expect(only('-> forest.entrance').targets).toEqual(['forest.entrance']);
  });

  it('calls a tunnel call a tunnel, not a plain divert', () => {
    const r = only('-> weather_report ->');
    expect(r.flow).toBe('tunnel');
    expect(r.targets).toEqual(['weather_report']);
  });

  it('does not promote a conditional row to a divert because an arrow named nothing', () => {
    // A `<-` with no target is not a jump. Calling the row a divert would also cost it its prose bar.
    expect(only('{ some_flag } <-').kind).not.toBe('divert');
  });

  it('keeps a line of prose that happens to end in a divert as prose', () => {
    const r = only('"Quite odd that is..." -> priest');
    expect(r.kind).toBe('prose');
    expect(r.targets).toEqual(['priest']);
  });

  it('reads a bracketed choice with a divert as one row', () => {
    const r = only('+ [Wait] -> wait');
    expect(r.kind).toBe('choice');
    expect(r.text).toBe('Wait');
    expect(r.targets).toEqual(['wait']);
  });

  it('shows what ink shows for a bracket-split choice, and drops the continuation', () => {
    expect(only('* (fine) "I\'m fine[."]," I reply, but he is not listening.').text).toBe('"I\'m fine."');
    expect(only('* (fine) "I\'m fine[."]," I reply.').name).toBe('fine');
    expect(only('* Hut 14[]. The door was locked.').text).toBe('Hut 14');
    expect(only('* No brackets here').text).toBe('No brackets here');
  });

  it('marks an inline condition without letting it eat the label', () => {
    const r = only('+ {!prisioner_free}[Talk to prisoner] -> prisoner');
    expect(r.kind).toBe('choice');
    expect(r.cond).toBe(true);
    expect(r.text).toBe('Talk to prisoner');
    expect(r.targets).toEqual(['prisoner']);
  });

  it('does not flag plain interpolation or alternatives as a condition', () => {
    expect(only('Score is {score}.').cond).toBe(false);
    expect(only('{LIST_ALL(inventory)}').cond).toBe(false);
    expect(only('{test one|test two|test three}').cond).toBe(false);
  });

  it('flags a real inline branch', () => {
    const r = only('{flagged: yes|no}');
    expect(r.cond).toBe(true);
    expect(r.kind).toBe('cond');
  });

  it('reads a multiline block: its dashes are branches, not gathers, and the block closes', () => {
    const p = buildPreview(['=== k ===', '{Prisoner_Interogated:', '-" Oh thanks"', '~ money = 1', '-> Town_Square', '- else:', 'Nothing happens.', '}', '- a real gather'].join('\n'));
    expect(p.rows.map((r) => r.kind)).toEqual(['header', 'cond', 'cond', 'logic', 'divert', 'cond', 'prose', 'cond', 'gather']);
    expect(p.rows[8]!.braceDepth).toBe(0);
    expect(p.rows[2]!.braceDepth).toBe(1);
  });

  it("gives a block's scaffolding the weave depth it sits in, not its dash count", () => {
    // A `- else:` is brace scaffolding: it belongs at the same indent as its `{` opener and `}` closer, not
    // jammed back to column 0 while every other row of its own block stays indented.
    const p = buildPreview(['=== k ===', '* * a', '\t\t{ x:', '\t\t- one', '\t\t- else:', '\t\t  two', '\t\t}'].join('\n'));
    expect(p.rows.map((r) => r.kind)).toEqual(['header', 'choice', 'cond', 'cond', 'cond', 'prose', 'cond']);
    expect(p.rows.map((r) => r.depth)).toEqual([0, 1, 1, 1, 1, 1, 1]);
  });

  it('keeps a choice nested inside a block a choice', () => {
    const p = buildPreview(['=== k ===', '{ hooperClueType == NONE:', '*[Try the door]', '*[Try the windows]', '- else:', 'nothing', '}'].join('\n'));
    expect(p.rows.filter((r) => r.kind === 'choice').map((r) => r.text)).toEqual(['Try the door', 'Try the windows']);
    // Brace nesting must not leak into the indent channel: these are depth-0 choices inside one block.
    expect(p.rows.filter((r) => r.kind === 'choice').map((r) => r.depth)).toEqual([0, 0]);
  });

  it('draws nothing for comments, blank lines and bare glue', () => {
    expect(kinds('=== k ===\n// a note\n/* ---------\n   block\n   --------- */\n\n<>\n')).toEqual(['header']);
  });

  it('collects every target on a shuffled divert', () => {
    const r = only('{~->Success|->Fail | ->Fail |->Fail}');
    expect(r.targets).toEqual(['Success', 'Fail', 'Fail', 'Fail']);
    expect(r.kind).toBe('divert');
  });

  it('does not read a divert-typed argument as a jump', () => {
    const r = only('{(TURNS_SINCE(->provide_evi)!=-1):"Quite odd."->priest}');
    expect(r.targets).toEqual(['priest']);
  });

  it('reads logic lines', () => {
    expect(kinds('~ temp = 1')).toEqual(['logic']);
    expect(kinds('VAR money = 0')).toEqual(['logic']);
    expect(kinds('TODO: write this')).toEqual(['logic']);
  });

  it('leaves an author-drawn marker like O-^ as prose', () => {
    expect(only('O-^').kind).toBe('prose');
  });

  it('measures a line by its own text, so an inline alternative still reads as a full line', () => {
    const r = only('{scripture_acquired:Luckily you picked up the book|but sadly you did not bring it}');
    expect(r.chars).toBeGreaterThan(60);
  });
});

describe('merging', () => {
  it('merges a run of prose into one row that spans it', () => {
    const p = buildPreview('=== k ===\nOne.\nTwo.\nThree.');
    expect(p.rows.map((r) => r.kind)).toEqual(['header', 'prose']);
    expect([p.rows[1]!.from, p.rows[1]!.to]).toEqual([1, 3]);
    expect(p.rows[1]!.chars).toBe(4 + 4 + 6 + 2);
  });

  it('never merges across a divert, a choice or a blank line', () => {
    expect(kinds('=== k ===\nOne.\nTwo. -> x\nThree.')).toEqual(['header', 'prose', 'prose', 'prose']);
    expect(kinds('=== k ===\n* a\n* b')).toEqual(['header', 'choice', 'choice']);
    expect(kinds('=== k ===\nOne.\n\nTwo.')).toEqual(['header', 'prose', 'prose']);
  });

  it('does not merge prose at different weave depths', () => {
    expect(kinds('=== k ===\nflat\n* choose\n  nested')).toEqual(['header', 'prose', 'choice', 'prose']);
  });

  it('does not merge lines whose arrow was skipped as a divert-typed argument', () => {
    // The parser still turns these into real `reference` edges, one source line each, so they must keep
    // separate rows -- otherwise both wires leave the card from the same y.
    const p = buildPreview('=== k ===\n~ temp a = TURNS_SINCE(-> alpha)\n~ temp b = TURNS_SINCE(-> beta)');
    expect(p.rows.map((r) => r.kind)).toEqual(['header', 'logic', 'logic']);
    expect(p.rows.map((r) => r.arrow)).toEqual([false, true, true]);
    expect(lineToRow(p, 1)).not.toBe(lineToRow(p, 2));
  });

  it('puts a choice whose whole body is a jump on one row with its destination', () => {
    const p = buildPreview('=== k ===\n* [Ask about the prisoner]\n    -> ask_prisioner\n* [Stay]\n    Nothing happens.');
    expect(p.rows.map((r) => r.kind)).toEqual(['header', 'choice', 'choice', 'prose']);
    expect(p.rows[1]!.text).toBe('Ask about the prisoner');
    expect(p.rows[1]!.targets).toEqual(['ask_prisioner']);
    // Both source lines draw on the choice's row, and only one of them carries a divert.
    expect(lineToRow(p, 2)).toBe(1);
  });

  it('never absorbs a jump into a choice that already carries one', () => {
    // Two divert-bearing lines on one row would collide their out-handles.
    const p = buildPreview('=== k ===\n* [Wait] -> wait\n    -> elsewhere');
    expect(p.rows.map((r) => r.kind)).toEqual(['header', 'choice', 'divert']);
    expect(lineToRow(p, 1)).not.toBe(lineToRow(p, 2));
  });

  it('keeps two sibling choices as two rows, even when the second is conditional and jumps', () => {
    const p = buildPreview('=== k ===\n* [Inline condition]\n* {flagged} QA test -> after_logic\n    body\n    -> after_logic');
    const choices = p.rows.filter((r) => r.kind === 'choice');
    expect(choices.map((r) => r.text)).toEqual(['Inline condition', 'QA test']);
    expect(choices[1]!.targets).toEqual(['after_logic']);
    expect(choices[1]!.cond).toBe(true);
    expect(choices[0]!.targets).toBeUndefined();
  });

  it('does not drop a second choice typed after a bracketed label on the same line', () => {
    const r = only('* [Inline condition] * {flagged} QA test -> after_logic');
    expect(r.text).toMatch(/QA test/);
  });

  it('does not let a comment split a prose run', () => {
    expect(kinds('=== k ===\nOne.\n// a note\nTwo.')).toEqual(['header', 'prose']);
    expect(kinds('=== k ===\nOne.\n/* block */\nTwo.')).toEqual(['header', 'prose']);
  });
});

describe('the line <-> row map', () => {
  const text = '=== k ===\n// note\n* a choice\n\n  Some prose.\n  More prose.\n-> away';
  const p = buildPreview(text);

  it('covers every source line', () => {
    expect(p.rowOf).toHaveLength(countLines(text) + 1);
  });

  it('is monotonic, in range, and agrees with each row it points at', () => {
    p.rowOf.forEach((r, i) => {
      expect(r).toBeGreaterThanOrEqual(i === 0 ? 0 : p.rowOf[i - 1]!);
      expect(r).toBeLessThan(p.rows.length);
    });
    p.rows.forEach((row, i) => {
      expect(p.rowOf[row.from]).toBe(i);
      expect(p.rowOf[row.to]).toBe(i);
      expect(rowToLine(p, i)).toBe(row.from);
    });
  });

  it('maps a dropped line to the row above it, and clamps out-of-range lines', () => {
    expect(lineToRow(p, 1)).toBe(0); // the comment line falls back to the header row
    expect(lineToRow(p, 999)).toBe(p.rows.length - 1);
    expect(lineToRow(p, -5)).toBe(0);
  });
});

describe('edge cases', () => {
  it('gives an empty knot exactly its header row', () => {
    const p = buildPreview('=== k ===');
    expect(p.rows.map((r) => r.kind)).toEqual(['header']);
    expect(p.rowOf).toEqual([0]);
  });

  it('reads CRLF exactly like LF', () => {
    const lf = buildPreview('=== k ===\n* a\nprose\n-> x');
    const crlf = buildPreview('=== k ===\r\n* a\r\nprose\r\n-> x');
    expect(crlf.rows).toEqual(lf.rows);
    expect(crlf.rowOf).toEqual(lf.rowOf);
  });

  it('ignores a leading byte order mark', () => {
    const p = buildPreview('﻿=== k ===\n* a');
    expect(p.rows.map((r) => r.kind)).toEqual(['header', 'choice']);
  });

  it('survives an unclosed brace without losing a line', () => {
    const p = buildPreview('=== k ===\n{ never_closed:\nstill here\n* and a choice');
    expect(p.rows).toHaveLength(4);
    expect(p.rows[3]!.kind).toBe('choice');
  });
});

describe('geometry', () => {
  const p = buildPreview(['=== k ===', '* one', 'prose one', '* two', 'prose two', '-> away'].join('\n'));

  it('adds up: the last row ends exactly at the bottom pad', () => {
    const g = layoutRows(p, PREVIEW_MAX_H);
    const last = g.tops.length - 1;
    expect(g.tops[last]! + g.heights[last]! + DEFAULT_METRICS.pad).toBe(g.height);
    expect(g.tops[0]).toBe(DEFAULT_METRICS.pad);
    expect(g.heights[0]).toBe(0); // the header row is drawn as the card header
  });

  it('squeezes bar rows before text rows, and never shrinks text on its own account', () => {
    const tall = buildPreview('=== k ===\n' + Array.from({ length: 200 }, (_, i) => `line ${i}\n`).join('\n'));
    const g = layoutRows(tall, PREVIEW_MAX_H);
    expect(g.textHeight).toBe(DEFAULT_METRICS.text);
    expect(g.showText).toBe(true);
    const bars = g.heights.filter((h) => h > 0 && h < DEFAULT_METRICS.text);
    expect(Math.min(...bars)).toBeGreaterThanOrEqual(DEFAULT_METRICS.barMin);
  });

  it('scales everything to obey a hand-set height, dropping labels only when they get too small', () => {
    const g = layoutRows(p, 24, true);
    expect(g.height).toBeLessThanOrEqual(24);
    expect(g.showText).toBe(false);
    expect(layoutRows(p, PREVIEW_MAX_H, true).showText).toBe(true);
  });

  it('honours a hand-set height even when the rows cannot all fit, so no handle lands outside the card', () => {
    // Handles are children of the card, not of the clipped body: a row stack taller than its cap would put
    // wire endpoints out in empty canvas.
    const huge = buildPreview('=== k ===\n' + Array.from({ length: 300 }, (_, i) => `-> t${i}`).join('\n'));
    for (const cap of [8, 20, 48, 120]) {
      const g = layoutRows(huge, cap, true);
      const last = g.tops.length - 1;
      expect(g.height, `cap ${cap}`).toBeLessThanOrEqual(cap);
      expect(g.tops[last]! + g.heights[last]!, `cap ${cap}`).toBeLessThanOrEqual(cap);
    }
  });

  it('lets an unsized node grow rather than squeezing its labels away', () => {
    const huge = buildPreview('=== k ===\n' + Array.from({ length: 300 }, (_, i) => `* choice ${i}`).join('\n'));
    const g = layoutRows(huge, PREVIEW_MAX_H);
    expect(g.height).toBeGreaterThan(PREVIEW_MAX_H);
    expect(g.showText).toBe(true);
  });

  it('calls a row a text row exactly when it has something to say', () => {
    const [header, choice, prose] = rows('=== k ===\n* a\nprose');
    expect([isTextRow(header!), isTextRow(choice!), isTextRow(prose!)]).toEqual([false, true, false]);
    expect(isTextRow(only('- (ask_cap)'))).toBe(true); // a named gather is addressable
    expect(isTextRow(only('- plain'))).toBe(false);
  });
});

/**
 * The corpus is every .ink file the repo ships: the full-length hand-written story under examples/, the
 * feature tour that exercises one ink construct per chapter, and the multi-file adventure fixture. It is the
 * only place the scanner meets real ink at scale, so the pinned numbers below are the standing guard on it.
 */
describe('the sample corpus', () => {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const inkFiles = ['examples/saving-tortuga/SavingTortugaRework.ink', 'examples/tech-demo', 'tests/fixtures/adventure-demo']
    .flatMap((rel) => {
      const abs = join(repoRoot, rel);
      if (statSync(abs).isFile()) return [abs];
      return readdirSync(abs, { recursive: true, encoding: 'utf8' })
        .map((p) => join(abs, p))
        .filter((p) => p.endsWith('.ink'));
    })
    .sort();
  const segments = inkFiles.flatMap((abs) =>
    makeInkFile(relative(repoRoot, abs).split(sep).join('/'), readFileSync(abs, 'utf8')).segments.map((s) => ({
      id: s.id,
      text: editorText(s.text),
    })),
  );

  it('scans every real knot without throwing, and holds its invariants', () => {
    // A floor, not the exact count: it catches a corpus that silently loses a file or a whole directory.
    expect(segments.length).toBeGreaterThan(100);
    for (const seg of segments) {
      const p = buildPreview(seg.text);
      expect(p.rows.length, seg.id).toBeGreaterThan(0);
      expect(p.rowOf.length, seg.id).toBe(countLines(seg.text) + 1);
      for (const r of p.rows) expect(r.depth, seg.id).toBeLessThanOrEqual(MAX_DEPTH);
      for (let i = 1; i < p.rowOf.length; i++) expect(p.rowOf[i]!, seg.id).toBeGreaterThanOrEqual(p.rowOf[i - 1]!);
    }
  });

  it('never puts two divert-bearing source lines on one row (that would collide their wire handles)', () => {
    for (const seg of segments) {
      const p = buildPreview(seg.text);
      const seen = new Set<number>();
      let inBlock = false;
      seg.text.split(/\r?\n/).forEach((line, i) => {
        // Comment-strip exactly as the scanner does: an arrow inside `// ...` is prose to ink, never gets a
        // handle, and two such lines legitimately fold onto the row above them.
        const stripped = stripComments(line, inBlock);
        inBlock = stripped.inBlock;
        if (!/->|<-/.test(stripped.code)) return;
        const row = lineToRow(p, i);
        expect(seen.has(row), `${seg.id}: line ${i} shares a row`).toBe(false);
        seen.add(row);
      });
    }
  });

  /**
   * Standing regression guard, pinned to what the corpus actually contains. A drift here means the classifier
   * changed its mind about real ink -- which may be a fix, but should never pass unnoticed. Re-pin it only
   * after reading the diff and agreeing with every row that moved.
   * Pinned 2026-09-07 against the shipped corpus: 20 files, 122 segments. `header` is exactly the knot count,
   * because a file's preamble segment draws no header row. `choice` went 298 -> 301 the same day when three
   * fallback choices were added to the examples to close runtime dead ends (see tests/examples.test.ts).
   */
  it('classifies the corpus into the same shape it did when this was written', () => {
    const counts: Record<string, number> = {};
    let lines = 0;
    for (const seg of segments) {
      lines += countLines(seg.text) + 1;
      for (const r of buildPreview(seg.text).rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    }
    expect(counts).toEqual({ header: 102, stitch: 22, choice: 301, gather: 39, prose: 336, divert: 201, cond: 121, logic: 113 });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total / lines).toBeGreaterThan(0.4);
    expect(total / lines).toBeLessThan(0.8);
  });
});
