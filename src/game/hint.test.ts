import { describe, it, expect } from 'vitest';
import { hintSpace } from './hint';
import type { Card, CenterSpace, Suit, Tableau } from './types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });
const space = (...stack: Card[]): CenterSpace => ({ stack, history: [] });
const hand = (over: Partial<Tableau> = {}): Tableau =>
  ({ dash: [], post: [[], [], []], wood: [], woodIndex: 0, ...over });

describe('hintSpace', () => {
  it('points at where the best move LANDS, not at the card that makes it', () => {
    // Dash -> centre outranks post -> centre in the bot's own ranking, so the
    // answer is the dash card's destination even though the post move is
    // generated against a lower-numbered space.
    const t = hand({ dash: [c(5, 'red')], post: [[c(3, 'blue')], [], []] });
    const spaces = [space(c(2, 'blue')), space(), space(c(4, 'red'))];
    expect(hintSpace(t, spaces)).toBe(2);
  });

  it('settles ties on the first space rather than the last, so it cannot wander', () => {
    // An Ace fits every empty space at exactly the same rank. Re-running it must
    // give the same answer every time: the hint re-renders on a timer.
    const t = hand({ dash: [c(1, 'green')] });
    const spaces = [space(c(7, 'yellow')), space(), space(), space()];
    expect(hintSpace(t, spaces)).toBe(1);
    expect(hintSpace(t, spaces)).toBe(1);
  });

  it('stays silent when the only move has no square on the grid to point at', () => {
    // Blue 5 onto red 6 is a legal post-to-post build, and nothing else is legal.
    // A hint that pointed at the tableau would be answering a different question.
    const t = hand({ post: [[c(5, 'blue')], [c(6, 'red')], []] });
    expect(hintSpace(t, [space(c(9, 'green'))])).toBeNull();
  });

  it('stays silent for a player with nothing at all', () => {
    const t = hand({ dash: [c(9, 'blue')] });
    expect(hintSpace(t, [space(c(1, 'red'))])).toBeNull();
  });
});
