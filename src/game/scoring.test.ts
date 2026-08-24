import { describe, it, expect } from 'vitest';
import { scoreRound, winnerIds } from './scoring';
import type { Card, Suit, CenterSpace, Tableau } from './types';

const c = (v: number, suit: Suit, owner: string): Card => ({ v, suit, owner });
const tab = (blitz: Card[]): Tableau => ({ blitz, post: [[], [], []], wood: [], woodIndex: 0 });
const empty = (): CenterSpace => ({ stack: [], history: [] });

describe('scoreRound', () => {
  it('counts stack + history cards per owner, minus 2 per blitz card', () => {
    const spaces = [
      { stack: [c(1, 'red', 'a'), c(2, 'red', 'b')], history: [[c(1, 'blue', 'a'), c(2, 'blue', 'a')]] },
      empty(),
    ];
    const scores = scoreRound(spaces, {
      a: tab([c(9, 'green', 'a')]),
      b: tab([]),
    });
    expect(scores.a).toEqual({ centerCount: 3, blitzLeft: 1, delta: 1 });
    expect(scores.b).toEqual({ centerCount: 1, blitzLeft: 0, delta: 1 });
  });
  it('gives players with no center cards an entry (pure blitz penalty)', () => {
    const scores = scoreRound([empty()], { z: tab([c(1, 'red', 'z'), c(2, 'red', 'z')]) });
    expect(scores.z).toEqual({ centerCount: 0, blitzLeft: 2, delta: -4 });
  });
});

describe('winnerIds', () => {
  it('empty when nobody reached the target', () => {
    expect(winnerIds({ a: 40, b: 74 }, 75)).toEqual([]);
  });
  it('highest scorer at/above target wins; ties return multiple', () => {
    expect(winnerIds({ a: 80, b: 76, c: 10 }, 75)).toEqual(['a']);
    expect(winnerIds({ a: 80, b: 80, c: 79 }, 75)).toEqual(['a', 'b']);
  });
});
