import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseInkMessage, parseProject } from './inkParse';

const demoDir = fileURLToPath(new URL('../../tests/fixtures/demo/', import.meta.url));
const demo = {
  root: 'main.ink',
  files: {
    'main.ink': readFileSync(demoDir + 'main.ink', 'utf8'),
    'part2.ink': readFileSync(demoDir + 'part2.ink', 'utf8'),
  },
};

describe('parseProject on the demo fixture', () => {
  const result = parseProject(demo);
  const knot = (name: string) => result.knots.find((k) => k.name === name);
  const divertsFrom = (from: string) => result.diverts.filter((d) => d.fromKnot === from);

  it('finds every knot across both files with file and line', () => {
    expect(result.knots.map((k) => k.name).sort()).toEqual(
      ['ambient_sound', 'describe', 'everybody_lives', 'forest', 'intro', 'look_around', 'town'].sort(),
    );
    expect(knot('town')).toMatchObject({ file: 'part2.ink', line: 4, isFunction: false });
    expect(knot('describe')).toMatchObject({ file: 'main.ink', isFunction: true });
    expect(knot('forest')?.stitches).toEqual(['entrance', 'deeper', 'safe', 'danger']);
    expect(knot('look_around')?.labels).toEqual(['loop']);
  });

  it('reports no errors for the valid sample and surfaces the TODO', () => {
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      file: 'part2.ink',
      line: 6,
      message: 'write the market scene',
      severity: 'todo',
    });
  });

  it('attributes diverts to the right knot with kind, choice flag and line', () => {
    expect(divertsFrom('main.ink#')).toContainEqual(expect.objectContaining({ target: 'intro', kind: 'divert', line: 9 }));
    expect(divertsFrom('main.ink#')).toContainEqual(expect.objectContaining({ target: 'everybody_lives', kind: 'reference' }));

    const intro = divertsFrom('intro');
    expect(intro).toContainEqual(expect.objectContaining({ target: 'look_around', inChoice: true }));
    expect(intro).toContainEqual(expect.objectContaining({ target: 'town', inChoice: true }));
    expect(intro).toContainEqual(expect.objectContaining({ target: 'DONE', inChoice: false }));

    expect(divertsFrom('look_around')).toContainEqual(expect.objectContaining({ target: 'forest.entrance' }));
    expect(divertsFrom('look_around')).toContainEqual(expect.objectContaining({ target: 'loop' }));
    expect(divertsFrom('look_around')).toContainEqual(expect.objectContaining({ target: 'END' }));

    const forest = divertsFrom('forest');
    expect(forest).toContainEqual(expect.objectContaining({ target: 'entrance', kind: 'divert' }));
    expect(forest).toContainEqual(expect.objectContaining({ target: 'ambient_sound', kind: 'thread' }));
    expect(forest).toContainEqual(expect.objectContaining({ target: 'town', kind: 'tunnel' }));
    expect(forest).toContainEqual(expect.objectContaining({ target: 'danger', kind: 'divert' }));
    expect(forest).toContainEqual(expect.objectContaining({ target: 'safe', kind: 'divert' }));
    expect(forest).toContainEqual(expect.objectContaining({ target: 'current_epilogue', kind: 'divert' }));
    expect(forest).toContainEqual(expect.objectContaining({ target: 'forest.deeper' }));

    expect(divertsFrom('town')).toContainEqual(expect.objectContaining({ target: 'forest', inChoice: true, file: 'part2.ink' }));
    expect(result.diverts.filter((d) => d.kind === 'call').map((d) => d.target)).toContain('describe');
  });

  it('lists variables that hold divert targets', () => {
    expect(result.divertVariables).toEqual(['current_epilogue']);
  });
});

describe('parseProject error handling', () => {
  it('keeps parsing after a syntax error and reports it with file and line', () => {
    const files = { 'main.ink': '=== broken ===\nText { unterminated\n-> fine\n\n=== fine ===\nOk.\n-> END\n' };
    const r = parseProject({ root: 'main.ink', files });
    expect(r.knots.map((k) => k.name)).toEqual(['broken', 'fine']);
    expect(r.diagnostics.some((d) => d.severity === 'error' && d.file === 'main.ink' && d.line === 2)).toBe(true);
    expect(r.diverts).toContainEqual(expect.objectContaining({ fromKnot: 'fine', target: 'END' }));
  });

  it('reports undefined divert targets as semantic errors', () => {
    const r = parseProject({ root: 'main.ink', files: { 'main.ink': '-> a\n=== a ===\n-> nowhere\n' } });
    expect(r.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', file: 'main.ink', line: 3 }));
    expect(r.diagnostics.some((d) => /nowhere/.test(d.message))).toBe(true);
  });

  it('reports duplicate knot names as semantic errors', () => {
    const r = parseProject({ root: 'main.ink', files: { 'main.ink': '-> a\n=== a ===\n-> END\n=== a ===\n-> END\n' } });
    expect(r.diagnostics.some((d) => d.severity === 'error' && /already contains flow named 'a'/.test(d.message))).toBe(true);
    expect(r.knots.filter((k) => k.name === 'a').length).toBeGreaterThanOrEqual(1);
  });

  it('survives the inkjs crash on CONST divert targets and says the semantic pass was skipped', () => {
    const files = { 'main.ink': 'CONST start = -> a\n-> start\n=== a ===\n-> nowhere\n' };
    const r = parseProject({ root: 'main.ink', files });
    expect(r.knots.map((k) => k.name)).toEqual(['a']);
    expect(r.divertVariables).toEqual(['start']);
    expect(r.diagnostics).toContainEqual(expect.objectContaining({ severity: 'warning', message: expect.stringMatching(/Semantic checks skipped/) }));
  });

  it('scopes divert-typed parameters to their knot and records top-level labels', () => {
    const text = '- (top)\n-> a(-> c)\n=== a(-> x) ===\n-> x\n=== c ===\n-> top\n';
    const r = parseProject({ root: 'main.ink', files: { 'main.ink': text } });
    expect(r.knots.find((k) => k.name === 'a')?.divertParams).toEqual(['x']);
    expect(r.divertVariables).toEqual([]);
    expect(r.preambleLabels).toEqual(['top']);
  });

  it('reports a missing root without throwing', () => {
    const r = parseProject({ root: 'main.ink', files: {} });
    expect(r.diagnostics[0]).toMatchObject({ severity: 'error', file: 'main.ink' });
  });
});

describe('parseInkMessage', () => {
  it('extracts file, line and text', () => {
    expect(parseInkMessage("ERROR: 'main.ink' line 3: Expected end of line", 2)).toEqual({
      file: 'main.ink',
      line: 3,
      message: 'Expected end of line',
      severity: 'error',
    });
    expect(parseInkMessage('WARNING: line 7: Loose end', 1)).toEqual({ file: null, line: 7, message: 'Loose end', severity: 'warning' });
    expect(parseInkMessage('Something odd', 2)).toEqual({ file: null, line: null, message: 'Something odd', severity: 'error' });
  });
});
