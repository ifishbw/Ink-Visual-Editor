import { describe, expect, it } from 'vitest';
import { isDivertLinkNode, targetsIn } from './inkLinks';

describe('targetsIn', () => {
  it('marks only the target name, not the arrow or the rest of the line', () => {
    const line = '    -> forest.entrance';
    const [t] = targetsIn(line, 0);
    expect(t).toEqual({ start: 7, end: 22, name: 'forest.entrance' });
    expect(line.slice(t!.start, t!.end)).toBe('forest.entrance');
    expect(line.slice(0, t!.start)).toBe('    -> ');
  });

  it('skips DONE and END', () => {
    expect(targetsIn('-> DONE', 0)).toEqual([]);
    expect(targetsIn('-> END', 0)).toEqual([]);
    expect(targetsIn('-> keep', 0)[0]!.name).toBe('keep');
  });
});

describe('isDivertLinkNode', () => {
  it('is true only when closest finds the name mark', () => {
    const mark = { closest: (sel: string) => (sel === '.cm-ink-link' ? mark : null) };
    const line = { closest: () => null };
    const letters = { nodeType: 3, parentElement: mark };
    expect(isDivertLinkNode(mark as unknown as EventTarget)).toBe(true);
    expect(isDivertLinkNode(letters as unknown as EventTarget)).toBe(true);
    expect(isDivertLinkNode(line as unknown as EventTarget)).toBe(false);
    expect(isDivertLinkNode(null)).toBe(false);
  });
});
