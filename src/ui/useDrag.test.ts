import { describe, it, expect } from 'vitest';
import { parseDrop, nearestOf, ghostFix, GHOST_ANCHOR } from './useDrag';

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
