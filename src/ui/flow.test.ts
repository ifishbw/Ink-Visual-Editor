import { describe, expect, it } from 'vitest';
import { OPPOSITE_SIDE, rerouteSides, sideOf } from './flow';

/** Dot positions are top-left corners; rerouteSides compares centres, so offset by half a dot. */
const dot = (x: number, y: number) => ({ x: x - 6, y: y - 6 });

describe('sideOf', () => {
  it('prefers the horizontal side and falls back to the vertical one', () => {
    expect(sideOf({ x: 100, y: 20 })).toBe('right');
    expect(sideOf({ x: -100, y: 20 })).toBe('left');
    expect(sideOf({ x: 20, y: 100 })).toBe('bottom');
    expect(sideOf({ x: 20, y: -100 })).toBe('top');
  });
});

describe('rerouteSides', () => {
  const from = { x: 600, y: 200 };

  it('runs left to right through a dot on a forward wire', () => {
    expect(rerouteSides({ x: 100, y: 200 }, [dot(350, 300)], { x: 600, y: 200 })).toEqual([{ in: 'left', out: 'right' }]);
  });

  it('turns a dot around on a wire that doubles back', () => {
    // Source on the right, target on the left: the wire must enter the dot from the right and leave to the left.
    expect(rerouteSides(from, [dot(350, 300)], { x: 100, y: 200 })).toEqual([{ in: 'right', out: 'left' }]);
  });

  it('aims each dot at its neighbours, not at the endpoints', () => {
    const sides = rerouteSides(from, [dot(400, 260), dot(200, 260)], { x: 100, y: 200 });
    expect(sides).toEqual([
      { in: 'right', out: 'left' },
      { in: 'right', out: 'left' },
    ]);
  });

  it('uses the vertical sides for a wire travelling downwards', () => {
    expect(rerouteSides({ x: 300, y: 100 }, [dot(300, 300)], { x: 300, y: 500 })).toEqual([{ in: 'top', out: 'bottom' }]);
  });

  it('follows a short vertical hop even when the wire is heading left overall', () => {
    // Long approach from the lower right, then straight up to the next dot: the dot must run vertically, or
    // the vertical leg leaves one dot sideways and enters the next one sideways and crosses itself.
    const sides = rerouteSides({ x: 1000, y: 300 }, [dot(500, 100), dot(500, 0)], { x: 100, y: 0 });
    expect(sides[0]).toEqual({ in: 'bottom', out: 'top' });
  });

  it('always puts the two handles on opposite sides so the wire flows through the dot', () => {
    // A rectangular detour: every corner would be a right angle if each handle just aimed at its neighbour.
    const sides = rerouteSides({ x: 0, y: 400 }, [dot(100, 400), dot(100, 100), dot(600, 100), dot(600, 400)], { x: 700, y: 400 });
    expect(sides).toHaveLength(4);
    for (const s of sides) expect(s.in).toBe(OPPOSITE_SIDE[s.out]);
  });
});
