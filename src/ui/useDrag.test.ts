import { describe, it, expect } from 'vitest';
import { parseDrop, nearestOf, ghostFix, GHOST_ANCHOR, flickOf, FLICK_PROJECT_MS } from './useDrag';

describe('parseDrop', () => {
  it('reads the three drop kinds off the attribute', () => {
    const el = (v: string) => ({ closest: () => ({ getAttribute: () => v }) }) as unknown as Element;
    expect(parseDrop(el('space:7'))).toEqual({ space: 7 });
    expect(parseDrop(el('post:2'))).toEqual({ post: 2 });
    expect(parseDrop(el('nearest'))).toEqual({ nearest: true });
    expect(parseDrop(null)).toBeNull();
  });
});

describe('nearestOf', () => {
  const spaces = [
    { index: 0, cx: 10, cy: 10 }, { index: 1, cx: 100, cy: 10 }, { index: 2, cx: 200, cy: 10 },
  ];
  it('picks the closest candidate to where the card was let go', () => {
    expect(nearestOf(spaces, 12, 60)).toBe(0);
    expect(nearestOf(spaces, 130, 40)).toBe(1);
    expect(nearestOf(spaces, 195, 300)).toBe(2);
  });
  it('is null when nothing is a legal target', () => {
    expect(nearestOf([], 50, 50)).toBeNull();
  });
});

describe('ghostFix', () => {
  // A 40x56 card anchored halfway across and 55% down, dropped at (200, 300).
  const at = { x: 200, y: 300 };
  const where = (offX: number, offY: number) => ({
    left: at.x - 40 * GHOST_ANCHOR.x + offX,
    top: at.y - 56 * GHOST_ANCHOR.y + offY,
    width: 40, height: 56,
  });

  it('asks for no correction when the ghost landed under the finger', () => {
    expect(ghostFix(where(0, 0), at, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('pulls the ghost back down when the browser floated it above the finger', () => {
    // The iPhone case: fixed resolved 90px too high, so the card sits above the
    // finger. The correction is the miss, negated.
    expect(ghostFix(where(0, -90), at, { x: 0, y: 0 })).toEqual({ x: 0, y: 90 });
  });

  it('accumulates onto a correction already applied, so re-measuring converges', () => {
    // Half the error was already taken out; only the remainder is left to add.
    expect(ghostFix(where(0, -40), at, { x: 0, y: 50 })).toEqual({ x: 0, y: 90 });
    // And re-measuring a ghost that is now correct leaves that correction alone.
    expect(ghostFix(where(0, 0), at, { x: 0, y: 90 })).toEqual({ x: 0, y: 90 });
  });

  it('corrects sideways too', () => {
    expect(ghostFix(where(12, 0), at, { x: 0, y: 0 })).toEqual({ x: -12, y: 0 });
  });
});

describe('flickOf', () => {
  // A throw upward: 200px in 200ms is 1px/ms, comfortably over the threshold.
  const throwUp = (steps = 5, ms = 200, dy = -200) =>
    Array.from({ length: steps + 1 }, (_, i) => ({ x: 100, y: 500 + (dy * i) / steps, t: 1000 + (ms * i) / steps }));

  it('reads a fast upward throw and aims it ahead of the release', () => {
    const aim = flickOf(throwUp());
    expect(aim).not.toBeNull();
    expect(aim!.x).toBeCloseTo(100);
    // Released at y=300 travelling 1px/ms upward, so it is aimed a further
    // FLICK_PROJECT_MS worth of travel up the board.
    expect(aim!.y).toBeCloseTo(300 - FLICK_PROJECT_MS);
  });

  it('ignores a deliberate drag, however far it goes', () => {
    // The same 200px, taken two seconds over it.
    expect(flickOf(throwUp(20, 2000))).toBeNull();
  });

  it('ignores a fast twitch that goes nowhere', () => {
    // Quick, but under FLICK_MIN_TRAVEL - a tap with an unsteady finger.
    expect(flickOf(throwUp(3, 20, -10))).toBeNull();
  });

  it('ignores downward and sideways throws', () => {
    // The board is above the hand on every screen, so only up is a throw at it.
    expect(flickOf(throwUp(5, 200, 200))).toBeNull();
    const sideways = [
      { x: 100, y: 500, t: 1000 }, { x: 200, y: 500, t: 1050 }, { x: 300, y: 500, t: 1100 },
    ];
    expect(flickOf(sideways)).toBeNull();
  });

  it('judges the throw, not the hesitation before it', () => {
    // Card picked up, held still for a second, then thrown. The whole gesture
    // averages out slow; the last FLICK_WINDOW_MS of it does not.
    const dawdle = [
      { x: 100, y: 500, t: 0 }, { x: 102, y: 498, t: 500 }, { x: 100, y: 500, t: 1000 },
      { x: 100, y: 440, t: 1040 }, { x: 100, y: 380, t: 1080 }, { x: 100, y: 320, t: 1120 },
    ];
    expect(flickOf(dawdle)).not.toBeNull();
  });

  it('has nothing to say about a gesture with one sample or no time in it', () => {
    expect(flickOf([{ x: 1, y: 1, t: 0 }])).toBeNull();
    expect(flickOf([])).toBeNull();
    expect(flickOf([{ x: 1, y: 500, t: 5 }, { x: 1, y: 300, t: 5 }])).toBeNull();
  });
});
