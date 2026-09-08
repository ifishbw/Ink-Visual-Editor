import { describe, expect, it } from 'vitest';
import { addDivert, addInclude, createKnot, deleteKnot, editorText, isValidKnotName, resplitFile, segmentTextFrom, setSegmentText } from './ops';
import { joinSegments, makeInkFile } from './splitter';

const text = (f: ReturnType<typeof makeInkFile>) => joinSegments(f.segments);

describe('setSegmentText and resplitFile', () => {
  it('replaces text and recomputes later start lines without re-splitting', () => {
    const f = makeInkFile('m.ink', 'VAR x = 1\n=== a ===\nA\n=== b ===\nB\n');
    const edited = setSegmentText(f, 'm.ink#a', '=== a ===\nA1\nA2\n');
    expect(text(edited)).toBe('VAR x = 1\n=== a ===\nA1\nA2\n=== b ===\nB\n');
    expect(edited.segments.map((s) => s.startLine)).toEqual([1, 2, 5]);
    expect(resplitFile(edited).changed).toBe(false);
  });

  it('splits a knot typed inside another and detects an in-place rename', () => {
    const f = makeInkFile('m.ink', '=== a ===\nA\n=== b ===\nB\n');
    const twoInOne = setSegmentText(f, 'm.ink#a', '=== a ===\nA\n=== c ===\nC\n');
    const r = resplitFile(twoInOne);
    expect(r.changed).toBe(true);
    expect(r.file.segments.map((s) => s.name)).toEqual([undefined, 'a', 'c', 'b']);
    expect(r.renames).toEqual([]);

    const renamed = resplitFile(setSegmentText(f, 'm.ink#b', '=== b2 ===\nB\n'));
    expect(renamed.renames).toEqual([{ from: 'b', to: 'b2' }]);
    expect(renamed.file.segments.map((s) => s.id)).toEqual(['m.ink#', 'm.ink#a', 'm.ink#b2']);
  });
});

describe('createKnot', () => {
  it('appends a header with a blank line before it, using the file line ending', () => {
    const r = createKnot(makeInkFile('m.ink', '=== a ===\r\nA'), 'b');
    expect(text(r.file)).toBe('=== a ===\r\nA\r\n\r\n=== b ===\r\nTODO: write b\r\n\r\n');
    expect(r.segId).toBe('m.ink#b');
    expect(text(createKnot(makeInkFile('m.ink', ''), 'first').file)).toBe('=== first ===\nTODO: write first\n\n');
    expect(text(createKnot(makeInkFile('m.ink', '=== a ===\nA\n\n'), 'b').file)).toBe('=== a ===\nA\n\n=== b ===\nTODO: write b\n\n');
  });
  it('validates names', () => {
    expect(isValidKnotName('café_2')).toBe(true);
    expect(isValidKnotName('2bad')).toBe(false);
    expect(isValidKnotName('has space')).toBe(false);
    expect(isValidKnotName('END')).toBe(false);
  });
});

describe('deleteKnot', () => {
  it('removes exactly the segment text and re-canonicalizes ids', () => {
    const f = makeInkFile('m.ink', 'top\n=== a ===\nA\n=== a ===\nA2\n=== b ===\nB\n');
    const d = deleteKnot(f, 'm.ink#a');
    expect(text(d)).toBe('top\n=== a ===\nA2\n=== b ===\nB\n');
    expect(d.segments.map((s) => s.id)).toEqual(['m.ink#', 'm.ink#a', 'm.ink#b']);
  });
});

describe('addDivert', () => {
  it('inserts after the last non-blank line, keeping trailing blank lines', () => {
    const f = makeInkFile('m.ink', '=== a ===\nA\n\n\n=== b ===\n');
    expect(text(addDivert(f, 'm.ink#a', 'b'))).toBe('=== a ===\nA\n-> b\n\n\n=== b ===\n');
  });
  it('handles a header-only knot with no trailing newline and CRLF files', () => {
    expect(text(addDivert(makeInkFile('m.ink', '=== a ==='), 'm.ink#a', 'b'))).toBe('=== a ===\n-> b\n');
    expect(text(addDivert(makeInkFile('m.ink', '=== a ===\r\nA\r\n'), 'm.ink#a', 'b'))).toBe('=== a ===\r\nA\r\n-> b\r\n');
  });
});

describe('addInclude', () => {
  it('inserts after the last INCLUDE, or at the top of an empty preamble', () => {
    const withInc = addInclude(makeInkFile('m.ink', 'INCLUDE a.ink\nVAR x = 1\n=== k ===\n'), 'b.ink');
    expect(text(withInc)).toBe('INCLUDE a.ink\nINCLUDE b.ink\nVAR x = 1\n=== k ===\n');
    expect(text(addInclude(makeInkFile('m.ink', '=== k ===\nK\n'), 'extra.ink'))).toBe('INCLUDE extra.ink\n=== k ===\nK\n');
  });
  it('is a no-op when the path is already included', () => {
    const f = makeInkFile('m.ink', 'INCLUDE a.ink\n=== k ===\n');
    expect(text(addInclude(f, 'a.ink'))).toBe(text(f));
  });
});

describe('editorText and segmentTextFrom', () => {
  it('hides the terminator that separates a knot from the next one', () => {
    const f = makeInkFile('m.ink', '=== a ===\nhello\n\n=== b ===\nB\n');
    const seg = f.segments.find((s) => s.name === 'a')!;
    expect(editorText(seg.text)).toBe('=== a ===\nhello\n');
    expect(segmentTextFrom(editorText(seg.text), seg.text)).toBe(seg.text);
  });

  it('keeps the next knot separate when the user types on the last line', () => {
    const f = makeInkFile('m.ink', '=== a ===\nhello\n\n=== b ===\nB\n');
    const seg = f.segments.find((s) => s.name === 'a')!;
    // The editor shows no trailing blank line, so typing "asd" lands on what was the blank line.
    const typed = editorText(seg.text) + 'asd';
    const r = resplitFile(setSegmentText(f, seg.id, segmentTextFrom(typed, seg.text)));
    expect(text(r.file)).toBe('=== a ===\nhello\nasd\n=== b ===\nB\n');
    expect(r.file.segments.map((s) => s.name)).toEqual([undefined, 'a', 'b']);
  });

  it('restores a CRLF terminator', () => {
    const f = makeInkFile('m.ink', '=== a ===\r\nA\r\n=== b ===\r\nB\r\n');
    const seg = f.segments.find((s) => s.name === 'a')!;
    expect(editorText(seg.text)).toBe('=== a ===\r\nA');
    expect(segmentTextFrom('=== a ===\r\nA1', seg.text)).toBe('=== a ===\r\nA1\r\n');
  });

  it('leaves a file that does not end in a newline alone', () => {
    const f = makeInkFile('m.ink', '=== a ===\nA');
    const seg = f.segments.find((s) => s.name === 'a')!;
    expect(editorText(seg.text)).toBe('=== a ===\nA');
    expect(segmentTextFrom('=== a ===\nAB', seg.text)).toBe('=== a ===\nAB');
  });
});
