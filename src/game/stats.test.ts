import { describe, it, expect } from 'vitest';
import { nextStats, normalizeStats, statsFor, type GameStats, type RoundOutcome } from './stats';
import type { RoundScore } from './types';

const sc = (delta: number): RoundScore => ({ centerCount: 0, blitzLeft: 0, delta });

const round = (over: Partial<RoundOutcome> = {}): RoundOutcome => ({
  roundNumber: 1,
  scores: { ann: sc(9), bo: sc(-4) },
  duels: null, blitzedBy: 'ann', durationMs: 60_000, stuckRounds: 0,
  totals: { ann: 9, bo: -4 },
  ...over,
});

describe('nextStats', () => {
  it('counts a blitz and a bottom finish', () => {
    const s = nextStats(null, round());
    expect(statsFor(s, 'ann').blitzes).toBe(1);
    expect(statsFor(s, 'bo').lastPlaces).toBe(1);
    expect(statsFor(s, 'bo').lastStreak).toBe(1);
    expect(statsFor(s, 'ann').lastStreak).toBe(0);
  });

  it('breaks a streak the moment somebody climbs off the bottom', () => {
    const one = nextStats(null, round({ roundNumber: 1, totals: { ann: 9, bo: -4 } }));
    const two = nextStats(one, round({ roundNumber: 2, totals: { ann: 18, bo: -8 } }));
    expect(statsFor(two, 'bo').lastStreak).toBe(2);
    const three = nextStats(two, round({ roundNumber: 3, totals: { ann: 2, bo: 5 } }));
    expect(statsFor(three, 'bo').lastStreak).toBe(0);
    expect(statsFor(three, 'bo').lastPlaces).toBe(2);   // the tally survives the streak
    expect(statsFor(three, 'ann').lastStreak).toBe(1);
  });

  it('gives everyone level on the lowest total the wooden spoon', () => {
    // Otherwise the sort order picks a scapegoat between two identical scores.
    const s = nextStats(null, round({ totals: { ann: 9, bo: -4, cy: -4 }, scores: { ann: sc(9), bo: sc(-4), cy: sc(-4) } }));
    expect(statsFor(s, 'bo').lastPlaces).toBe(1);
    expect(statsFor(s, 'cy').lastPlaces).toBe(1);
  });

  it('gives nobody last place when the whole table is level', () => {
    // A round nobody scores in moves everyone by -20, and awarding the entire room
    // a last place each had all three players on a three-round losing streak.
    const one = nextStats(null, round({
      roundNumber: 1, totals: { ann: -20, bo: -20, cy: -20 },
      scores: { ann: sc(-20), bo: sc(-20), cy: sc(-20) },
    }));
    expect(statsFor(one, 'ann').lastPlaces).toBe(0);
    expect(statsFor(one, 'bo').lastStreak).toBe(0);
    // ...and a level round breaks a streak that was running.
    const prev = nextStats(null, round({ totals: { ann: 9, bo: -4, cy: 1 }, scores: { ann: sc(9), bo: sc(-4), cy: sc(1) } }));
    expect(statsFor(prev, 'bo').lastStreak).toBe(1);
    const levelled = nextStats(prev, round({
      roundNumber: 2, totals: { ann: 0, bo: 0, cy: 0 }, scores: { ann: sc(0), bo: sc(0), cy: sc(0) },
    }));
    expect(statsFor(levelled, 'bo').lastStreak).toBe(0);
  });

  it('says nothing about last place in a one-player room', () => {
    const s = nextStats(null, round({ totals: { ann: 9 }, scores: { ann: sc(9) } }));
    expect(statsFor(s, 'ann').lastPlaces).toBe(0);
  });

  it('tallies races from both sides of the duel table', () => {
    const s = nextStats(null, round({ duels: { ann: { bo: 2 }, bo: { ann: 3 } } }));
    expect(s.races).toBe(5);
    expect(statsFor(s, 'ann').racesLost).toBe(2);
    expect(statsFor(s, 'ann').racesWon).toBe(3);
    expect(statsFor(s, 'bo').racesLost).toBe(3);
  });

  it('keeps the best and worst round of the game, with the round they happened', () => {
    const one = nextStats(null, round({ roundNumber: 1 }));           // ann +9, bo -4
    expect(one.best).toEqual({ uid: 'ann', delta: 9, round: 1 });
    expect(one.worst).toEqual({ uid: 'bo', delta: -4, round: 1 });
    const two = nextStats(one, round({ roundNumber: 2, scores: { ann: sc(3), bo: sc(-11) } }));
    expect(two.best).toEqual({ uid: 'ann', delta: 9, round: 1 });     // not beaten
    expect(two.worst).toEqual({ uid: 'bo', delta: -11, round: 2 });   // beaten
  });

  it('keeps only the fastest blitz, and ignores a round with no usable clock', () => {
    const one = nextStats(null, round({ roundNumber: 1, durationMs: 60_000 }));
    const two = nextStats(one, round({ roundNumber: 2, durationMs: 90_000 }));
    expect(two.fastest).toEqual({ uid: 'ann', ms: 60_000, round: 1 });
    const three = nextStats(two, round({ roundNumber: 3, durationMs: null }));
    expect(three.fastest).toEqual({ uid: 'ann', ms: 60_000, round: 1 });
    const four = nextStats(three, round({ roundNumber: 4, durationMs: 20_000 }));
    expect(four.fastest).toEqual({ uid: 'ann', ms: 20_000, round: 4 });
  });

  it('sums the standstills across the game', () => {
    const one = nextStats(null, round({ roundNumber: 1, stuckRounds: 2 }));
    expect(nextStats(one, round({ roundNumber: 2, stuckRounds: 1 })).allStuck).toBe(3);
  });

  it('never mutates what it was given', () => {
    const one = nextStats(null, round());
    const snapshot = JSON.parse(JSON.stringify(one)) as GameStats;
    nextStats(one, round({ roundNumber: 2, blitzedBy: 'bo', totals: { ann: 1, bo: 30 } }));
    expect(one).toEqual(snapshot);
  });

  it('reads a room that has never had stats written to it', () => {
    expect(normalizeStats(undefined)).toBeNull();
    expect(statsFor(null, 'ann')).toEqual(
      { blitzes: 0, lastPlaces: 0, lastStreak: 0, racesWon: 0, racesLost: 0 });
    // RTDB gives back only what was written, so partial objects have to be safe.
    expect(normalizeStats({ rounds: 4 })!.players).toEqual({});
    expect(normalizeStats({ rounds: 4 })!.races).toBe(0);
  });
});
