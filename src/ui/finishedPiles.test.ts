import { describe, it, expect } from 'vitest';
import { finishesSince, historyCounts } from './finishedPiles';
import { PILE_FINISH_MS, PILE_FLIP_MS, PILE_GO_MS, PILE_HOLD_MS } from './components/CenterGrid';
import type { Card, CenterSpace, Suit } from '../game/types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });
const run = (suit: Suit, owner: string): Card[] =>
  Array.from({ length: 10 }, (_, i) => c(i + 1, suit, owner));
const sp = (history: Card[][] = [], stack: Card[] = []): CenterSpace => ({ stack, history });

describe('spotting a finished pile', () => {
  it('reports the space, and the card that completed it', () => {
    const before = [sp(), sp()];
    const after = [sp(), sp([run('blue', 'ada')])];
    const { finished } = finishesSince(historyCounts(before), after, 1);
    expect(finished).toHaveLength(1);
    expect(finished[0].space).toBe(1);
    // The LAST card of the run: the 10 is what completed the pile, and its owner
    // is whose badge goes on the back of it.
    expect(finished[0].card.v).toBe(10);
    expect(finished[0].card.owner).toBe('ada');
  });

  it('says nothing about a board that has not changed', () => {
    const board = [sp([run('red', 'me')]), sp()];
    const { finished } = finishesSince(historyCounts(board), board, 1);
    expect(finished).toEqual([]);
  });

  it('does not replay the piles a board already had when you arrived', () => {
    // Seeded from the board as it stands, which is what walking into a game in
    // progress does. Arriving somewhere is not an event.
    const inProgress = [sp([run('red', 'ada'), run('blue', 'bo')]), sp([run('green', 'cy')])];
    const { finished } = finishesSince(historyCounts(inProgress), inProgress, 1);
    expect(finished).toEqual([]);
  });

  it('gives each finish its own nonce, so the same space twice replays', () => {
    const one = finishesSince([0], [sp([run('red', 'ada')])], 7);
    expect(one.finished[0].seq).toBe(7);
    expect(one.seq).toBe(8);
    const two = finishesSince(one.counts, [sp([run('red', 'ada'), run('blue', 'ada')])], one.seq);
    expect(two.finished[0].seq).toBe(8);
    expect(two.seq).toBe(9);
  });

  it('reports two spaces finishing in the same snapshot', () => {
    const { finished } = finishesSince([0, 0], [sp([run('red', 'a')]), sp([run('blue', 'b')])], 1);
    expect(finished.map(f => f.space)).toEqual([0, 1]);
    expect(finished.map(f => f.seq)).toEqual([1, 2]);
  });

  it('ignores a space that lost history, which is a new board and not a finish', () => {
    // A round boundary deals a fresh board. Counts go DOWN, and nothing finished.
    const { finished } = finishesSince([2, 1], [sp(), sp()], 1);
    expect(finished).toEqual([]);
  });

  it('survives a run that filtered down to nothing', () => {
    // normalizeSpace drops non-cards out of a run, and a run that emptied was
    // never a run - the rails already refuse to colour one.
    const { finished } = finishesSince([0], [{ stack: [], history: [[]] }], 1);
    expect(finished).toEqual([]);
  });

  it('counts history per space, which is what a finish is a change in', () => {
    expect(historyCounts([sp([run('red', 'a'), run('blue', 'b')]), sp(), sp([run('green', 'c')])]))
      .toEqual([2, 0, 1]);
  });
});

describe('how long a finish is on screen', () => {
  it('holds for the 800ms that was asked for, after the turn has finished', () => {
    expect(PILE_HOLD_MS).toBe(800);
  });

  it('outlives all three phases, turn and hold and clearing away', () => {
    // Getting this wrong is SILENT. At turn + hold the element unmounted exactly
    // as its exit animation began, so the pile vanished instead of clearing away
    // - the browser had computed the right animation and simply never ran it, and
    // no test could have noticed from the markup.
    expect(PILE_FINISH_MS).toBe(PILE_FLIP_MS + PILE_HOLD_MS + PILE_GO_MS);
  });

  it('turns over before it holds, so the badge is what is being held', () => {
    expect(PILE_FLIP_MS).toBeGreaterThan(0);
    expect(PILE_FINISH_MS - PILE_GO_MS - PILE_FLIP_MS).toBe(PILE_HOLD_MS);
  });
});
