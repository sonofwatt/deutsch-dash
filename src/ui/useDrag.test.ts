import { describe, it, expect } from 'vitest';
import { parseDrop, nearestOf, ghostFix, GHOST_ANCHOR, throwOf, aimedAt, crossedBy,
  edgeDistance, FLICK_MAX_AIM_DEG } from './useDrag';

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
  // Small boxes, and all of them far enough from `from` that the proximity rule
  // below cannot reach them - these cases are about the CONE.
  const box = (index: number, cx: number, cy: number) => ({ index, cx, cy, w: 40, h: 56 });
  const spaces = [
    box(0, 60, 300),    // up and well to the left
    box(1, 120, 200),   // up, a little to the left, further away
    box(2, 340, 300),   // up and to the right
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

  it('refuses a wild throw that is aimed at nothing and lands near nothing', () => {
    // Hard left, along the bottom of the screen: no space is in that direction,
    // and the release is hundreds of pixels from every one of them.
    expect(aimedAt(spaces, aim(-400, -20))).toBeNull();
    expect(aimedAt([], aim(0, -400))).toBeNull();
  });

  it('takes the space it ENDED on, whatever direction the throw was going', () => {
    // Thrown hard to the right, but the release is inside space 0. That is where
    // they put it, and nothing else is weighed.
    const on = { from: { x: 60, y: 300 }, dx: 400, dy: -20, speed: 1 };
    expect(aimedAt(spaces, on)).toBe(0);
  });

  it('takes a space it stopped just PAST, which the cone cannot see', () => {
    // The throw overshoots space 0 by 12px, which leaves the space behind the
    // release point and outside a forward cone entirely - the case that read as
    // the space not being playable at all.
    const past = { from: { x: 60, y: 300 - 28 - 12 }, dx: 0, dy: -400, speed: 1 };
    expect(aimedAt(spaces, past)).toBe(0);
  });

  it('measures that gap to the EDGE, not to the centre', () => {
    // One space on its own, so nothing else can be nearer. 40px beyond its top
    // edge is inside FLICK_NEAR_PX; a centre-to-centre measure would call the same
    // point 68px away and miss it. Deliberately not sitting on the threshold, so
    // the test says "inside" rather than "exactly at". Thrown sideways, so only
    // proximity can pick it.
    const lone = [box(0, 60, 300)];
    const near = (gap: number) => ({ from: { x: 60, y: 300 - 28 - gap }, dx: 400, dy: -8, speed: 1 });
    expect(aimedAt(lone, near(20))).toBe(0);
    expect(aimedAt(lone, near(60))).toBeNull();
  });

  it('takes a space the throw FLEW OVER on its way past', () => {
    // Straight up the column space 0 sits in and out the top of the board. It
    // stopped 152px above the space, so proximity cannot see it, and the space is
    // now behind the throw, so the cone cannot either. The finger went over it.
    const lone = [box(0, 60, 300)];
    const over = { from: { x: 60, y: 120 }, dx: 0, dy: -580, speed: 1,
                   path: [{ x: 60, y: 700 }, { x: 60, y: 120 }] };
    expect(aimedAt(lone, over)).toBe(0);
  });

  it('takes the LAST space a path crossed, not the first', () => {
    // Both are in the column, one above the other, and the throw went over both.
    // The far one was still ahead of the throw when it ended.
    const stack = [box(0, 60, 300), box(3, 60, 180)];
    const over = { from: { x: 60, y: 120 }, dx: 0, dy: -580, speed: 1,
                   path: [{ x: 60, y: 700 }, { x: 60, y: 120 }] };
    expect(aimedAt(stack, over)).toBe(3);
  });

  it('follows the path round a corner, not the straight line of the throw', () => {
    // Up, then hard left, ending out past the board's left edge. Only the second
    // leg goes over space 0, and a start-to-end straight line would miss it.
    const lone = [box(0, 60, 300)];
    const hook = { from: { x: 0, y: 290 }, dx: -190, dy: -110, speed: 1,
                   path: [{ x: 200, y: 700 }, { x: 200, y: 400 }, { x: 0, y: 290 }] };
    expect(aimedAt(lone, hook)).toBe(0);
  });

  it('still prefers where the throw STOPPED to what it crossed getting there', () => {
    // Over space 3 and back down to a hair under space 0. Crossing is evidence,
    // but stopping on something is a decision, so proximity is asked first.
    const stack = [box(0, 60, 300), box(3, 60, 180)];
    const back = { from: { x: 60, y: 350 }, dx: 0, dy: -400, speed: 1,
                   path: [{ x: 60, y: 700 }, { x: 60, y: 160 }, { x: 60, y: 350 }] };
    expect(aimedAt(stack, back)).toBe(0);
  });

  it('counts a path that shaved PAST a space, within the near radius of it', () => {
    // Straight up, 20px clear of space 0's right edge and never over it. It ends
    // 173px from the space so proximity misses, and the space is behind the throw
    // so the cone misses: the band around the path is the only thing that sees it.
    const lone = [box(0, 60, 300)];
    const beside = (x: number) => ({ from: { x, y: 100 }, dx: 0, dy: -600, speed: 1,
                                     path: [{ x, y: 700 }, { x, y: 100 }] });
    expect(aimedAt(lone, beside(100))).toBe(0);    // 20px clear of the edge
    expect(aimedAt(lone, beside(140))).toBeNull(); // 60px clear, and out of reach
  });

  it('lets the end of the throw outrank ground it swept on the way', () => {
    // Straight up a column: over space 0 early, on past it, ending 172px short of
    // space 1 and pointing dead at it. Both are far too distant for proximity, so
    // the cone and the sweep are the only rules left and they disagree. A space
    // swept at the START of a flick is the oldest thing the gesture knows.
    const column = [box(0, 100, 600), box(1, 100, 200)];
    const past = { from: { x: 100, y: 400 }, dx: 0, dy: -400, speed: 1,
                   path: [{ x: 100, y: 800 }, { x: 100, y: 500 }, { x: 100, y: 400 }] };
    expect(aimedAt(column, past)).toBe(1);
    // ...and the sweep still decides once nothing is in the cone. Same throw,
    // with the space it was pointing at taken off the board.
    expect(aimedAt([box(0, 100, 600)], past)).toBe(0);
  });

  it('does not invent a crossing from a throw that went nowhere near', () => {
    // Up the far right of the screen. Nothing crossed, nothing in the cone.
    const lone = [box(0, 60, 300)];
    const wide = { from: { x: 380, y: 120 }, dx: 0, dy: -580, speed: 1,
                   path: [{ x: 380, y: 700 }, { x: 380, y: 120 }] };
    expect(aimedAt(lone, wide)).toBeNull();
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
    const edge = (deg: number) => [box(9,
      from.x + Math.sin((deg * Math.PI) / 180) * 400,
      from.y - Math.cos((deg * Math.PI) / 180) * 400)];
    const up = aim(0, -400);
    expect(aimedAt(edge(FLICK_MAX_AIM_DEG - 2), up)).toBe(9);
    expect(aimedAt(edge(-(FLICK_MAX_AIM_DEG - 2)), up)).toBe(9);
    expect(aimedAt(edge(FLICK_MAX_AIM_DEG + 4), up)).toBeNull();
  });
});

describe('crossedBy', () => {
  const b = { index: 0, cx: 100, cy: 100, w: 40, h: 60 };
  const line = (...pts: [number, number][]) => pts.map(([x, y]) => ({ x, y }));

  it('is null for a path that never touches the space', () => {
    expect(crossedBy(line([0, 0], [0, 400]), b)).toBeNull();
    expect(crossedBy(line([100, 100]), b)).toBeNull();   // one point is not a path
  });

  it('measures how far along the path the space was left behind', () => {
    // Straight up the middle of it from below: enters at y=130, leaves at y=70,
    // which is 330px into a 400px path.
    expect(crossedBy(line([100, 400], [100, 0]), b)).toBeCloseTo(330);
  });

  it('takes the LAST time the path left it, not the first', () => {
    // Up through it, back down into it, and out the bottom again.
    const there = crossedBy(line([100, 400], [100, 0]), b)!;
    const andBack = crossedBy(line([100, 400], [100, 0], [100, 400]), b)!;
    expect(andBack).toBeGreaterThan(there);
  });

  it('counts a path that runs along inside the space without leaving it', () => {
    expect(crossedBy(line([95, 90], [105, 110]), b)).toBeGreaterThan(0);
  });

  it('widens the path by pad, and measures that gap from the space EDGE', () => {
    // b spans x 80..120. A path up x=140 is 20px clear of it.
    const beside = line([140, 400], [140, 0]);
    expect(crossedBy(beside, b)).toBeNull();          // no pad, no contact
    expect(crossedBy(beside, b, 10)).toBeNull();      // 10 does not reach 20
    expect(crossedBy(beside, b, 30)).not.toBeNull();  // 30 does
  });

  it('reaches a corner diagonally rather than squaring the space off', () => {
    // b's top-right corner is (120, 70). A point out on the diagonal from it is
    // further away than either axis alone says, and the band has to know that: a
    // box simply widened by 30 on each axis would reach x 150 and y 40 and
    // swallow (145, 45), which is 35px from the corner and out of a 30px band.
    const dot = (x: number, y: number) => line([x, y], [x + 1, y]);
    expect(crossedBy(dot(141, 49), b, 30)).not.toBeNull();  // 29.7px out
    expect(crossedBy(dot(145, 45), b, 30)).toBeNull();      // 35.4px out
  });
});

describe('edgeDistance', () => {
  const b = { index: 0, cx: 100, cy: 100, w: 40, h: 60 };
  it('is zero anywhere inside the space', () => {
    expect(edgeDistance({ x: 100, y: 100 }, b)).toBe(0);
    expect(edgeDistance({ x: 119, y: 129 }, b)).toBe(0);   // just inside a corner
  });
  it('is the gap to the nearest border, not to the middle', () => {
    expect(edgeDistance({ x: 130, y: 100 }, b)).toBe(10);  // 30 right of centre, 20 is the half-width
    expect(edgeDistance({ x: 100, y: 140 }, b)).toBe(10);
  });
  it('measures diagonally off a corner', () => {
    expect(edgeDistance({ x: 123, y: 134 }, b)).toBeCloseTo(5);
  });
});
