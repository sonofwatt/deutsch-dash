import { describe, it, expect } from 'vitest';
import { parseDrop, nearestOf, ghostFix, GHOST_ANCHOR, throwOf, aimedAt, FLICK_MAX_AIM_DEG } from './useDrag';

describe('parseDrop', () => {
  it('reads the three drop kinds off the attribute', () => {
    const el = (v: string) => ({ closest: () => ({ getAttribute: () => v }) }) as unknown as Element;
    expect(parseDrop(el('space:7'))).toEqual({ space: 7 });
    expect(parseDrop(el('post:2'))).toEqual({ post: 2 });
    expect(parseDrop(el('nearest'))).toEqual({ nearest: true, loose: true });
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

describe('throwOf', () => {
  /** A throw of `dist` px in `ms`, in `steps`, at the given angle (0 = straight up). */
  const thrown = (dist: number, ms: number, steps = 5, deg = 0) =>
    Array.from({ length: steps + 1 }, (_, i) => ({
      x: 200 + Math.sin((deg * Math.PI) / 180) * (dist * i) / steps,
      y: 700 - Math.cos((deg * Math.PI) / 180) * (dist * i) / steps,
      t: 1000 + (ms * i) / steps,
    }));

  it('reads a SHORT fast flick, which is the one that used to be missed', () => {
    // 60px in 90ms: nothing like far enough to reach the board, and the whole
    // point is that it does not have to be.
    const t = throwOf(thrown(60, 90));
    expect(t).not.toBeNull();
    expect(t!.dy).toBeLessThan(0);
    expect(t!.from.y).toBeCloseTo(640);
  });

  it('finds the throw inside a gesture that slows down before letting go', () => {
    // A thumb decelerates before it leaves the glass. Averaging the whole window
    // loses the throw; the fastest stretch in it does not.
    const fast = [
      { x: 200, y: 700, t: 0 }, { x: 200, y: 640, t: 30 }, { x: 200, y: 580, t: 60 },
      { x: 200, y: 574, t: 100 }, { x: 200, y: 572, t: 140 },
    ];
    expect(throwOf(fast)).not.toBeNull();
  });

  it('ignores a deliberate drag, however far it goes', () => {
    expect(throwOf(thrown(400, 2000, 20))).toBeNull();
  });

  it('ignores a fast twitch that goes nowhere', () => {
    expect(throwOf(thrown(8, 20, 3))).toBeNull();
  });

  it('ignores downward and flat throws', () => {
    expect(throwOf(thrown(200, 200, 5, 180))).toBeNull();   // straight down
    expect(throwOf(thrown(200, 200, 5, 90))).toBeNull();    // straight sideways
  });

  it('has nothing to say about a gesture too short to have a speed', () => {
    expect(throwOf([])).toBeNull();
    expect(throwOf([{ x: 1, y: 1, t: 0 }])).toBeNull();
    expect(throwOf([{ x: 200, y: 700, t: 0 }, { x: 200, y: 500, t: 2 }])).toBeNull();
  });
});

describe('aimedAt', () => {
  // Released at (200, 700). A board above it: two spaces up-left, one up-right.
  const from = { x: 200, y: 700 };
  const spaces = [
    { index: 0, cx: 60, cy: 300 },   // up and well to the left
    { index: 1, cx: 120, cy: 200 },  // up, a little to the left, further away
    { index: 2, cx: 340, cy: 300 },  // up and to the right
  ];
  const aim = (dx: number, dy: number) => ({ from, dx, dy, speed: 1 });

  it('sends the card along the line of the throw, not to whatever is nearest', () => {
    // Thrown up-left. Space 2 is a similar distance away on the other side, and
    // must not win: this is the case that made a flick feel arbitrary.
    expect(aimedAt(spaces, aim(-140, -400))).toBe(0);
    expect(aimedAt(spaces, aim(140, -400))).toBe(2);
  });

  it('takes the nearer of two spaces along the same bearing', () => {
    // 0 and 1 are within a few degrees of each other from here.
    expect(aimedAt(spaces, aim(-100, -420))).toBe(0);
  });

  it('refuses a wild throw that is aimed at nothing', () => {
    // Hard left, along the bottom of the screen: no space is in that direction.
    expect(aimedAt(spaces, aim(-400, -20))).toBeNull();
    expect(aimedAt([], aim(0, -400))).toBeNull();
  });

  it('lands on a legal space even when the throw was aimed between them', () => {
    // The caller only ever passes spaces this card can legally land in, so a throw
    // aimed at a full space or an unfollowable pile arrives at a playable one
    // rather than coming back. Straight up, with nothing straight up: 1 is the
    // closest to the line and inside the cone.
    const aimed = aimedAt(spaces, aim(0, -400));
    expect(aimed).toBe(1);
  });

  it('measures the cone off the line of the throw, either side alike', () => {
    // A space exactly on the cone edge is in; one past it is out.
    const edge = (deg: number) => [{
      index: 9,
      cx: from.x + Math.sin((deg * Math.PI) / 180) * 400,
      cy: from.y - Math.cos((deg * Math.PI) / 180) * 400,
    }];
    const up = aim(0, -400);
    expect(aimedAt(edge(FLICK_MAX_AIM_DEG - 2), up)).toBe(9);
    expect(aimedAt(edge(-(FLICK_MAX_AIM_DEG - 2)), up)).toBe(9);
    expect(aimedAt(edge(FLICK_MAX_AIM_DEG + 4), up)).toBeNull();
  });
});
