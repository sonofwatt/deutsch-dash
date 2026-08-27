import { describe, it, expect } from 'vitest';
import { openingsAfter } from './openings';
import type { Card, CenterSpace, Suit, Tableau } from '../game/types';

const c = (v: number, suit: Suit, owner = 'them'): Card => ({ v, suit, owner });
const board = (...tops: (Card | null)[]): CenterSpace[] =>
  tops.map(t => ({ stack: t ? [t] : [], history: [] }));
const hand = (over: Partial<Tableau> = {}): Tableau =>
  ({ blitz: [], post: [[], [], []], wood: [], woodIndex: 0, ...over });

describe('openingsAfter', () => {
  const mine = hand({ blitz: [c(6, 'red', 'me')] });   // a red 6, on top of my Blitz

  it('lights the space somebody else just played to that my card fits', () => {
    const before = board(null, null);
    const after = board(c(5, 'red'), null);
    expect(openingsAfter(before, after, mine, 'me', 7)).toEqual({ 0: { suit: 'red', at: 7 } });
  });

  it('takes its colour from the card now on the space, not from mine', () => {
    // An Ace of any colour opens an empty space to my red 6? No - but a green 5
    // does not take a red 6 either. Use the case that does: my red 6 on a red 5.
    const after = board(c(5, 'red'));
    const { 0: opening } = openingsAfter(board(null), after, mine, 'me', 1);
    expect(opening.suit).toBe('red');
  });

  it('says nothing about a space I cannot use', () => {
    const after = board(c(5, 'green'));  // green 5 wants a green 6; mine is red
    expect(openingsAfter(board(null), after, mine, 'me', 1)).toEqual({});
  });

  it('says nothing about my own play - I already know where I put it', () => {
    const after = board(c(5, 'red', 'me'));
    expect(openingsAfter(board(null), after, hand({ blitz: [c(6, 'red', 'me')] }), 'me', 1)).toEqual({});
  });

  it('says nothing about a space that did not change', () => {
    const same = board(c(5, 'red'));
    expect(openingsAfter(same, board(c(5, 'red')), mine, 'me', 1)).toEqual({});
  });

  it('fires again when the same space changes a second time', () => {
    const first = openingsAfter(board(c(4, 'red')), board(c(5, 'red')), mine, 'me', 1);
    expect(first).toEqual({ 0: { suit: 'red', at: 1 } });
    // ...and the nonce moves on, which is what remounts the element and replays it
    const second = openingsAfter(board(c(5, 'red')), board(c(4, 'red')), hand({ blitz: [c(5, 'red', 'me')] }), 'me', 2);
    expect(second).toEqual({ 0: { suit: 'red', at: 2 } });
  });

  it('ignores a space that was cleared rather than played to', () => {
    // A finished 1..10 pile empties its space. There is no card to take a colour
    // from, and it is open to every Ace on the table rather than to me.
    expect(openingsAfter(board(c(10, 'red')), board(null), hand({ blitz: [c(1, 'blue', 'me')] }), 'me', 1))
      .toEqual({});
  });

  it('reads every face-up pile, not just the Blitz', () => {
    const t = hand({ wood: [c(6, 'red', 'me')], woodIndex: 1 });
    expect(openingsAfter(board(null), board(c(5, 'red')), t, 'me', 1)).toEqual({ 0: { suit: 'red', at: 1 } });
    const posts = hand({ post: [[], [c(6, 'red', 'me')], []] });
    expect(openingsAfter(board(null), board(c(5, 'red')), posts, 'me', 1)).toEqual({ 0: { suit: 'red', at: 1 } });
  });

  it('says nothing at all when the player is holding nothing face up', () => {
    expect(openingsAfter(board(null), board(c(5, 'red')), hand(), 'me', 1)).toEqual({});
  });
});

describe('useOpenings, as a host switch', () => {
  // The hook itself needs a renderer, so this drives the one decision it makes
  // that is worth pinning: `enabled` gates the COMPARISON, never the record of
  // where the board currently is. Mirrors the expression in the hook.
  const gated = (from: CenterSpace[] | null, to: CenterSpace[], t: Tableau, on: boolean) =>
    (from && t && on ? openingsAfter(from, to, t, 'me', 1) : {});

  const mine = hand({ blitz: [c(6, 'red', 'me')] });

  it('shows nothing while the host has hints off', () => {
    expect(gated(board(null), board(c(5, 'red')), mine, false)).toEqual({});
  });
  it('shows the opening once hints are on', () => {
    expect(gated(board(null), board(c(5, 'red')), mine, true)).toEqual({ 0: { suit: 'red', at: 1 } });
  });
  it('has nothing to compare against on the first board of a round', () => {
    expect(gated(null, board(c(5, 'red')), mine, true)).toEqual({});
  });
});
