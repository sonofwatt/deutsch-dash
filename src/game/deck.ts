import type { Card, Suit, Tableau } from './types';

export const SUITS: Suit[] = ['red', 'blue', 'green', 'yellow'];

export type Rng = () => number; // returns [0, 1)

export function buildDeck(owner: string): Card[] {
  return SUITS.flatMap(suit =>
    Array.from({ length: 10 }, (_, i) => ({ v: i + 1, suit, owner })),
  );
}

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function deal(deck: Card[], postCount: number): Tableau {
  return {
    dash: deck.slice(0, 10),
    post: Array.from({ length: postCount }, (_, i) => [deck[10 + i]]),
    wood: deck.slice(10 + postCount),
    woodIndex: 0,
  };
}
