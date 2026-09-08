import { describe, expect, it } from 'vitest';
import { hasCode, joinSegments, matchKnotHeader, recomputeStartLines, scanCommentState, splitFile, splitLines, stripComments } from './splitter';

const roundTrip = (text: string) => expect(joinSegments(splitFile('f.ink', text))).toBe(text);

describe('splitLines', () => {
  it('keeps terminators and restores the text', () => {
    for (const t of ['', 'a', 'a\n', 'a\nb', 'a\r\nb\r\n', '\n\n', 'x\n\ny', '\r\n']) {
      expect(splitLines(t).join('')).toBe(t);
    }
    expect(splitLines('a\r\nb')).toEqual(['a\r\n', 'b']);
  });
});

describe('matchKnotHeader', () => {
  it('accepts the header variants ink accepts', () => {
    expect(matchKnotHeader('=== knot ===', false)).toEqual({ name: 'knot', isFunction: false });
    expect(matchKnotHeader('== knot', false)).toEqual({ name: 'knot', isFunction: false });
    expect(matchKnotHeader('==knot==', false)).toEqual({ name: 'knot', isFunction: false });
    expect(matchKnotHeader('   === indented ===', false)).toEqual({ name: 'indented', isFunction: false });
    expect(matchKnotHeader('=== function f(x, y) ===', false)).toEqual({ name: 'f', isFunction: true });
    expect(matchKnotHeader('=== knot(a, -> b) ===', false)).toEqual({ name: 'knot', isFunction: false });
    expect(matchKnotHeader('=== knot === # tag', false)).toEqual({ name: 'knot', isFunction: false });
  });
  it('accepts unicode identifiers and a leading BOM, as inklecate does', () => {
    expect(matchKnotHeader('=== café ===', false)).toEqual({ name: 'café', isFunction: false });
    expect(matchKnotHeader('=== 日本語 ===', false)).toEqual({ name: '日本語', isFunction: false });
    expect(matchKnotHeader('=== k2_ü ===', false)).toEqual({ name: 'k2_ü', isFunction: false });
    expect(matchKnotHeader('﻿=== bom ===', false)).toEqual({ name: 'bom', isFunction: false });
  });
  it('rejects stitches, logic and commented headers', () => {
    expect(matchKnotHeader('= stitch', false)).toBeNull();
    expect(matchKnotHeader('~ x == y', false)).toBeNull();
    expect(matchKnotHeader('// === nope ===', false)).toBeNull();
    expect(matchKnotHeader('=== knot ===', true)).toBeNull();
    expect(matchKnotHeader('=== 1bad ===', false)).toBeNull();
  });
});

describe('comments', () => {
  it('tracks block comments across lines and ignores // comments', () => {
    expect(scanCommentState('/* open', false)).toBe(true);
    expect(scanCommentState('still open', true)).toBe(true);
    expect(scanCommentState('close */ text', true)).toBe(false);
    expect(scanCommentState('/* one */ /* two', false)).toBe(true);
    expect(scanCommentState('text // /* not a block', false)).toBe(false);
    expect(scanCommentState('a */ b /* c', true)).toBe(true);
  });
  it('strips comment text and keeps code', () => {
    expect(stripComments('VAR x = 1 // note', false)).toEqual({ code: 'VAR x = 1 ', inBlock: false });
    expect(stripComments('a /* b */ c /* d', false)).toEqual({ code: 'a  c ', inBlock: true });
    expect(stripComments('still */ code', true)).toEqual({ code: ' code', inBlock: false });
  });
  it('hasCode ignores blank lines and comments only', () => {
    expect(hasCode('')).toBe(false);
    expect(hasCode('\n  \n// just a note\n/* block\n=== fake ===\n*/\n')).toBe(false);
    expect(hasCode('/* a */ VAR x = 1\n')).toBe(true);
    expect(hasCode('\n\nSome text\n')).toBe(true);
  });
});

describe('splitFile', () => {
  it('always yields a preamble first, even when empty', () => {
    const segs = splitFile('f.ink', '=== a ===\nHello\n');
    expect(segs.map((s) => s.kind)).toEqual(['preamble', 'knot']);
    expect(segs[0]!.text).toBe('');
    expect(segs[1]!).toMatchObject({ id: 'f.ink#a', name: 'a', startLine: 1, text: '=== a ===\nHello\n' });
  });

  it('gives blank lines and comments between knots to the preceding segment', () => {
    const text = 'VAR x = 1\n\n=== a ===\nA\n\n// about b\n=== b ===\nB';
    const segs = splitFile('f.ink', text);
    expect(segs.map((s) => s.text)).toEqual(['VAR x = 1\n\n', '=== a ===\nA\n\n// about b\n', '=== b ===\nB']);
    expect(segs.map((s) => s.startLine)).toEqual([1, 3, 7]);
    roundTrip(text);
  });

  it('keeps stitches inside their knot and ignores headers inside block comments', () => {
    const text = '=== a ===\n= s1\ntext\n/* === not_a_knot ===\n= also not */\n= s2\n=== b ===\n';
    const segs = splitFile('f.ink', text);
    expect(segs.map((s) => s.name)).toEqual([undefined, 'a', 'b']);
    roundTrip(text);
  });

  it('still finds the first knot when the file starts with a BOM', () => {
    const segs = splitFile('f.ink', '﻿=== first ===\ntext\n');
    expect(segs.map((s) => s.name)).toEqual([undefined, 'first']);
    expect(segs[0]!.text).toBe('');
    roundTrip('﻿=== first ===\ntext\n');
  });

  it('recomputes startLine after a segment edit, across CRLF and later segments', () => {
    const segs = splitFile('f.ink', 'VAR x = 1\r\n=== a ===\r\nA\r\n=== b ===\r\nB\r\n=== c ===\r\n');
    expect(segs.map((s) => s.startLine)).toEqual([1, 2, 4, 6]);
    segs[1]!.text = '=== a ===\r\nline one\r\nline two\r\nline three\r\n';
    recomputeStartLines(segs);
    expect(segs.map((s) => s.startLine)).toEqual([1, 2, 6, 8]);
    expect(segs.map((s) => s.id)).toEqual(['f.ink#', 'f.ink#a', 'f.ink#b', 'f.ink#c']);
  });

  it('marks function knots and dedupes repeated names', () => {
    const segs = splitFile('f.ink', '=== function f() ===\n~ return 1\n=== a ===\n=== a ===\n');
    expect(segs[1]).toMatchObject({ id: 'f.ink#f', isFunction: true });
    expect(segs[2]!.id).toBe('f.ink#a');
    expect(segs[3]!.id).toBe('f.ink#a#2');
  });

  it('round-trips awkward inputs byte for byte', () => {
    const cases = [
      '',
      '\n',
      'no knots at all',
      '=== a ===',
      '=== a ===\r\nCRLF text\r\n=== b ===\r\n',
      '   \n\t=== tabbed ===\n\n\n',
      '=== a ===\n/* unterminated block\n=== hidden ===\n',
      'text // === in a line comment ===\n=== real ===\n',
      '=== a ===\ntrailing spaces   \n   \n',
      '\ufeff=== bom ===\n',
    ];
    for (const c of cases) roundTrip(c);
  });

  it('round-trips a generated corpus', () => {
    const atoms = ['=== k', '===', ' ===', '= s\n', '-> k\n', '/*', '*/', '//', '\n', '\r\n', 'text ', '{ x:\n- a\n}', '\t'];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let n = 0; n < 300; n++) {
      let text = '';
      const len = Math.floor(rnd() * 20);
      for (let i = 0; i < len; i++) text += atoms[Math.floor(rnd() * atoms.length)];
      roundTrip(text);
      const segs = splitFile('g.ink', text);
      expect(segs[0]!.kind).toBe('preamble');
      expect(segs.slice(1).every((s) => s.kind === 'knot' && s.text.length > 0)).toBe(true);
    }
  });
});
