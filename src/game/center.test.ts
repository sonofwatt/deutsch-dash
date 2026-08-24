import { describe, it, expect } from 'vitest';
import { normalizeSpace, normalizeSpaces, normalizeTableau, centerPlayTxn, reconcileTableau } from './center';
import type { Card, Suit, CenterSpace } from './types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });

describe('normalize', () => {
  it('fills missing space fields', () => {
    expect(normalizeSpace(null)).toEqual({ stack: [], history: [] });
    expect(normalizeSpace({ stack: [c(1, 'red')] })).toEqual({ stack: [c(1, 'red')], history: [] });
  });
  it('always returns 16 spaces', () => {
    expect(normalizeSpaces(null)).toHaveLength(16);
    const arr = normalizeSpaces({ 3: { stack: [c(1, 'red')] } });
    expect(arr[3].stack).toEqual([c(1, 'red')]);
    expect(arr[0]).toEqual({ stack: [], history: [] });
  });
  it('restores tableau shape with fixed post count', () => {
    const t = normalizeTableau({ blitz: [c(2, 'red')], woodIndex: 0 }, 3);
    expect(t).toEqual({ blitz: [c(2, 'red')], post: [[], [], []], wood: [], woodIndex: 0 });
    const t5 = normalizeTableau({ post: { 1: [c(4, 'blue')] } }, 5);
    expect(t5.post).toEqual([[], [c(4, 'blue')], [], [], []]);
  });
});

describe('centerPlayTxn', () => {
  it('starts a pile with a 1 on an empty/null space', () => {
    expect(centerPlayTxn(c(1, 'red'))(null)).toEqual({ stack: [c(1, 'red')], history: [] });
  });
  it('appends a legal next card', () => {
    const space: CenterSpace = { stack: [c(1, 'red')], history: [] };
    expect(centerPlayTxn(c(2, 'red', 'other'))(space)!.stack).toHaveLength(2);
  });
  it('aborts (undefined) on an illegal play - the lost-race case', () => {
    const space: CenterSpace = { stack: [c(1, 'red'), c(2, 'red')], history: [] };
    expect(centerPlayTxn(c(2, 'red'))(space)).toBeUndefined();
    expect(centerPlayTxn(c(1, 'blue'))(space)).toBeUndefined();
  });
  it('archives a completed 1..10 stack and frees the space atomically', () => {
    const stack = Array.from({ length: 9 }, (_, i) => c(i + 1, 'green'));
    const out = centerPlayTxn(c(10, 'green'))({ stack, history: [] })!;
    expect(out.stack).toEqual([]);
    expect(out.history).toHaveLength(1);
    expect(out.history[0]).toHaveLength(10);
  });
});

describe('reconcileTableau', () => {
  it('drops my cards that already made it to the center', () => {
    const dupe = c(3, 'red', 'me');
    const t = { blitz: [dupe, c(9, 'blue', 'me')], post: [[c(3, 'red', 'other')]],
                wood: [c(5, 'green', 'me')], woodIndex: 0 };
    const spaces = normalizeSpaces({ 0: { stack: [c(3, 'red', 'me')] } });
    const out = reconcileTableau(t, spaces);
    expect(out.blitz).toEqual([c(9, 'blue', 'me')]);
    expect(out.post).toEqual([[c(3, 'red', 'other')]]); // other players' ids never match mine
    expect(out.wood).toEqual([c(5, 'green', 'me')]);
  });
  it('repositions the wood pointer when a flipped card was reclaimed by the center', () => {
    const t = {
      blitz: [], post: [[]],
      wood: [c(1, 'red'), c(2, 'red'), c(3, 'red'), c(4, 'blue'), c(5, 'blue')],
      woodIndex: 3, // flipped top is red 3
    };
    const spaces = normalizeSpaces({ 0: { stack: [c(3, 'red')] } }); // red 3 already in center
    const out = reconcileTableau(t, spaces);
    expect(out.wood).toEqual([c(1, 'red'), c(2, 'red'), c(4, 'blue'), c(5, 'blue')]);
    expect(out.woodIndex).toBe(2); // top is now red 2, same as a normal play would leave it
  });
});
