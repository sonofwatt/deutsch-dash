import { describe, it, expect } from 'vitest';
import { flipWood, rotateWood } from './wood';
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
