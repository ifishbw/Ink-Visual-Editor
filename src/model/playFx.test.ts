import { describe, expect, it } from 'vitest';
import { FX_EMPTY, headerFxOf, nodeFxOf, rowFxOf, type PlayFxInput } from './playFx';

const base: PlayFxInput = {
  status: 'running',
  atNodeId: 'a',
  atRow: 1,
  paint: { level: 'row', segId: 'a', relLine: 2 },
  staleSegs: [],
  trail: { b: 3 },
  covLines: { a: [0, 1] },
  covHits: { a: 2 },
  covTotal: { a: 9 },
  visits: { a: 3 },
  breakpoints: { a: [12] },
  stepRows: { a: [5] },
  dim: true,
};

describe('playFx interned selectors', () => {
  it('returns the identical string object when nothing relevant changed', () => {
    expect(nodeFxOf(base, 'a')).toBe(nodeFxOf(base, 'a'));
    expect(rowFxOf(base, 'a')).toBe(rowFxOf(base, 'a'));
    expect(headerFxOf(base, 'a')).toBe(headerFxOf(base, 'a'));
  });

  it('returns a different interned string when the playhead moves', () => {
    const moved: PlayFxInput = { ...base, atNodeId: 'b', paint: { level: 'row', segId: 'b', relLine: 0 }, atRow: 0 };
    expect(nodeFxOf(moved, 'a')).not.toBe(nodeFxOf(base, 'a'));
    expect(headerFxOf(moved, 'a')).not.toBe(headerFxOf(base, 'a'));
  });

  it('returns FX_EMPTY when idle', () => {
    const idle: PlayFxInput = { ...base, status: 'idle' };
    expect(nodeFxOf(idle, 'a')).toBe(FX_EMPTY);
    expect(rowFxOf(idle, 'a')).toBe(FX_EMPTY);
    expect(headerFxOf(idle, 'a')).toBe(FX_EMPTY);
  });
});
