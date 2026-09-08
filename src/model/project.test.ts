import { describe, expect, it } from 'vitest';
import { discoverProject, findIncludes, normalizeNewInkPath, normalizePath } from './project';

describe('findIncludes', () => {
  it('finds INCLUDE lines outside comments', () => {
    const text = 'INCLUDE a.ink\n  INCLUDE  sub\\b.ink  \n/* INCLUDE no.ink */\n// INCLUDE nope.ink\nVAR x = 1\n';
    expect(findIncludes(text)).toEqual([
      { path: 'a.ink', raw: 'a.ink', line: 1 },
      { path: 'sub/b.ink', raw: 'sub\\b.ink', line: 2 },
    ]);
  });
});

describe('normalizePath', () => {
  it('normalizes separators and dot segments', () => {
    expect(normalizePath('./a/./b.ink')).toBe('a/b.ink');
    expect(normalizePath('a\\b\\..\\c.ink')).toBe('a/c.ink');
    expect(normalizePath('../up.ink')).toBe('../up.ink');
  });
});

describe('normalizeNewInkPath', () => {
  it('adds .ink, rejects escapes, and accepts nested folders', () => {
    expect(normalizeNewInkPath('chapters/side')).toEqual({ path: 'chapters/side.ink' });
    expect(normalizeNewInkPath('extra.ink')).toEqual({ path: 'extra.ink' });
    expect(normalizeNewInkPath('../out.ink')).toEqual({ error: 'Path would leave the project folder' });
    expect(normalizeNewInkPath('')).toEqual({ error: 'Enter a file name' });
  });
});

describe('discoverProject', () => {
  it('walks includes breadth-first from the root and reports missing files', () => {
    const fs: Record<string, string> = {
      'main.ink': 'INCLUDE a.ink\nINCLUDE b.ink\n-> x\n',
      'a.ink': 'INCLUDE c.ink\nINCLUDE gone.ink\n',
      'b.ink': 'INCLUDE a.ink\n',
      'c.ink': '',
    };
    const p = discoverProject('main.ink', (path) => fs[path]);
    expect(p.files).toEqual(['main.ink', 'a.ink', 'b.ink', 'c.ink']);
    expect(p.missing).toEqual([{ from: 'a.ink', path: 'gone.ink', line: 2 }]);
  });
});
