import { describe, it, expect } from 'vitest';
import { buildDeck, shuffle, deal, SUITS } from './deck';
import { cardId } from './types';

const rig = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('buildDeck', () => {
  it('makes 40 unique owner-stamped cards, 1-10 per suit', () => {
    const deck = buildDeck('u1');
    expect(deck).toHaveLength(40);
    expect(new Set(deck.map(cardId)).size).toBe(40);
    for (const suit of SUITS) {
      const vals = deck.filter(c => c.suit === suit).map(c => c.v).sort((a, b) => a - b);
      expect(vals).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
    expect(deck.every(c => c.owner === 'u1')).toBe(true);
  });
});

describe('shuffle', () => {
  it('is a permutation and does not mutate input', () => {
    const deck = buildDeck('u1');
    const copy = [...deck];
    const out = shuffle(deck, rig([0.42, 0.1, 0.99, 0.5]));
    expect(deck).toEqual(copy);
    expect(new Set(out.map(cardId)).size).toBe(40);
    expect(out).toHaveLength(40);
  });
  it('is deterministic for a given rng', () => {
    const a = shuffle(buildDeck('u1'), rig([0.3, 0.7]));
    const b = shuffle(buildDeck('u1'), rig([0.3, 0.7]));
    expect(a).toEqual(b);
  });
});

describe('deal', () => {
  it('splits 10 blitz / N single-card posts / rest wood, woodIndex 0', () => {
    const deck = buildDeck('u1');
    const t = deal(deck, 3);
    expect(t.blitz).toHaveLength(10);
    expect(t.post).toEqual([[deck[10]], [deck[11]], [deck[12]]]);
    expect(t.wood).toHaveLength(27);
    expect(t.woodIndex).toBe(0);
    const all = [...t.blitz, ...t.post.flat(), ...t.wood];
    expect(new Set(all.map(cardId)).size).toBe(40);
  });
  it('supports 5 posts for 2-player games', () => {
    const t = deal(buildDeck('u1'), 5);
    expect(t.post).toHaveLength(5);
    expect(t.wood).toHaveLength(25);
  });
});
