import { describe, it, expect } from 'vitest';
import { flipWood, rotateWood, woodCycleTops } from './wood';
import type { Card, Suit, Tableau } from './types';

const c = (v: number, suit: Suit): Card => ({ v, suit, owner: 'me' });
const woodTab = (wood: Card[], woodIndex = 0): Tableau =>
  ({ blitz: [], post: [[], [], []], wood, woodIndex });
const cards = (n: number) => Array.from({ length: n }, (_, i) => c((i % 10) + 1, 'red'));

describe('flipWood', () => {
  it('advances by 3, capping at the end (partial last flip)', () => {
    const t = woodTab(cards(7));
    const f1 = flipWood(t);
    expect(f1.woodIndex).toBe(3);
    const f2 = flipWood(f1);
    expect(f2.woodIndex).toBe(6);
    const f3 = flipWood(f2);
    expect(f3.woodIndex).toBe(7); // partial group of 1
  });
  it('turns the pile over after full traversal and starts again', () => {
    const t = woodTab(cards(7), 7);
    expect(flipWood(t).woodIndex).toBe(3);
  });
  it('handles piles smaller than 3 and empty piles', () => {
    expect(flipWood(woodTab(cards(2))).woodIndex).toBe(2);
    expect(flipWood(woodTab(cards(2), 2)).woodIndex).toBe(2); // turn over -> min(3, 2)
    expect(flipWood(woodTab([]))).toEqual(woodTab([]));
  });
  it('never mutates card order', () => {
    const t = woodTab(cards(7));
    expect(flipWood(t).wood).toEqual(t.wood);
  });
});

describe('rotateWood', () => {
  it('moves the first card to the bottom and resets the flip cycle', () => {
    const t = woodTab([c(1, 'red'), c(2, 'blue'), c(3, 'green')], 3);
    const out = rotateWood(t);
    expect(out.wood).toEqual([c(2, 'blue'), c(3, 'green'), c(1, 'red')]);
    expect(out.woodIndex).toBe(0);
  });
  it('is a no-op for 0 or 1 cards', () => {
    const t = woodTab([c(1, 'red')], 1);
    expect(rotateWood(t)).toEqual(t);
    expect(rotateWood(woodTab([]))).toEqual(woodTab([]));
  });
});

describe('woodCycleTops', () => {
  it('reaches only every third card at three a turn - which is the whole problem', () => {
    // Nine cards, turned three at a time: 3, 6, 9, then back to 3. Six of the
    // nine are never the top card at any point in the cycle, however long a
    // player keeps turning, and that is what "no moves" used to be blind to.
    const t = woodTab(cards(9));
    const tops = woodCycleTops(t).map(x => x.v);
    expect(tops).toEqual([3, 6, 9]);
  });

  it('reaches every card at one a turn, which is what the rescue buys', () => {
    const t = woodTab(cards(9));
    expect(woodCycleTops(t, 1).map(x => x.v)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('starts from where the pile actually stands, not from the top', () => {
    // Mid-cycle the reachable set is the same three, just found in another order.
    expect(woodCycleTops(woodTab(cards(9), 6)).map(x => x.v)).toEqual([6, 9, 3]);
  });

  it('picks up the short last turn', () => {
    // Seven cards: 3, 6, then 7 rather than 9. The tail card IS reachable.
    expect(woodCycleTops(woodTab(cards(7))).map(x => x.v)).toEqual([3, 6, 7]);
  });

  it('terminates on an empty or single-card pile', () => {
    expect(woodCycleTops(woodTab([]))).toEqual([]);
    expect(woodCycleTops(woodTab(cards(1))).map(x => x.v)).toEqual([1]);
  });
});
