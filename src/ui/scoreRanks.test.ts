import { describe, it, expect } from 'vitest';
import { rankRows, signed } from './scoreRanks';
import type { PlayerInfo, RoundScore } from '../game/types';

const p = (name: string, score: number): PlayerInfo => ({
  name, badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score,
});
const d = (delta: number): RoundScore => ({ centerCount: delta, dashLeft: 0, delta });

describe('signed', () => {
  it('marks a gain and leaves a loss and a zero alone', () => {
    expect([signed(6), signed(-4), signed(0)]).toEqual(['+6', '-4', '0']);
  });
});

describe('rankRows', () => {
  it('reports no movement after the first round, when everyone started level', () => {
    // The playtest bug: all three were on zero, the round gave them an order for
    // the first time, and the sheet announced that somebody had "dropped 2
    // places" - the places being the order they had joined the room in.
    const players = { a: p('Ann', 4), b: p('Bo', 9), c: p('Cy', -2) };
    const scores = { a: d(4), b: d(9), c: d(-2) };
    const { move, places, previous, current } = rankRows(players, scores);
    expect(places).toEqual({ a: 0, b: 0, c: 0 });
    expect(move).toEqual({ a: null, b: null, c: null });
    // and nothing slides across the sheet either: it lands in its final order
    expect(previous).toEqual(current);
  });

  it('counts a genuine overtake, in both directions', () => {
    // Before: Ann 20, Bo 10, Cy 5. After: Cy 25, Ann 20, Bo 10.
    const players = { a: p('Ann', 20), b: p('Bo', 10), c: p('Cy', 25) };
    const scores = { a: d(0), b: d(0), c: d(20) };
    const { move, places, previous, current } = rankRows(players, scores);
    expect(previous).toEqual(['a', 'b', 'c']);
    expect(current).toEqual(['c', 'a', 'b']);
    expect(places).toEqual({ a: -1, b: -1, c: 2 }); // Cy passed two; both were passed once
    expect(move).toEqual({ a: 'down', b: 'down', c: 'up' });
  });

  it('does not call breaking a tie a place gained', () => {
    // Level on 10, then one of them pulls ahead. Nobody was passed.
    const players = { a: p('Ann', 15), b: p('Bo', 10) };
    const scores = { a: d(5), b: d(0) };
    const { move, places } = rankRows(players, scores);
    expect(places).toEqual({ a: 0, b: 0 });
    expect(move).toEqual({ a: null, b: null });
  });

  it('does not call being caught a place lost', () => {
    // Ann was ahead on 15, Bo draws level with her. Still nobody passed anybody.
    const players = { a: p('Ann', 15), b: p('Bo', 15) };
    const scores = { a: d(0), b: d(5) };
    expect(rankRows(players, scores).move).toEqual({ a: null, b: null });
  });

  it('reads the standings straight off the totals with no round to subtract', () => {
    // The game-over sheet passes no scores: previous and current are the same.
    const players = { a: p('Ann', 40), b: p('Bo', 75) };
    const { previous, current, move } = rankRows(players, null);
    expect(current).toEqual(['b', 'a']);
    expect(previous).toEqual(['b', 'a']);
    expect(move).toEqual({ a: null, b: null });
  });
});
