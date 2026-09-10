import { describe, it, expect } from 'vitest';
import { nextStats, normalizeStats, statsFor, type GameStats, type RoundOutcome } from './stats';
import type { RoundScore } from './types';

const sc = (delta: number): RoundScore => ({ centerCount: 0, dashLeft: 0, delta });

const round = (over: Partial<RoundOutcome> = {}): RoundOutcome => ({
  roundNumber: 1,
  scores: { ann: sc(9), bo: sc(-4) },
  duels: null, dashedBy: 'ann', durationMs: 60_000, stuckRounds: 0,
  totals: { ann: 9, bo: -4 },
  ...over,
});

describe('the round history', () => {
  it('keeps a line per round, with the deltas and the totals as they stood', () => {
    const one = nextStats(null, round());
    expect(one.history['1']).toEqual({ delta: { ann: 9, bo: -4 }, total: { ann: 9, bo: -4 } });
    const two = nextStats(one, round({ roundNumber: 2, scores: { ann: sc(3), bo: sc(1) },
      totals: { ann: 12, bo: -3 } }));
    expect(Object.keys(two.history).sort()).toEqual(['1', '2']);
    expect(two.history['1'].total.ann).toBe(9);   // round 1 is not rewritten
    expect(two.history['2'].total.ann).toBe(12);
  });

  it('is keyed by round, so committing the same round twice writes one line', () => {
    // commitScores is idempotent by computing from the pre-write snapshot, and
    // this has to be idempotent the same way: an array would have appended.
    const one = nextStats(null, round());
    const again = nextStats(one, round());
    expect(Object.keys(again.history)).toEqual(['1']);
    expect(again.history['1'].delta).toEqual({ ann: 9, bo: -4 });
  });

  it('records a total with no delta for somebody who sat the round out', () => {
    // scoreRound leaves them out entirely; their total is carried and unmoved.
    const s = nextStats(null, round({ scores: { ann: sc(9) }, totals: { ann: 9, bo: -4 } }));
    expect(s.history['1'].delta).toEqual({ ann: 9 });
    expect(s.history['1'].total).toEqual({ ann: 9, bo: -4 });
  });

  it('reads a game that predates it as no history rather than as broken', () => {
    const old = normalizeStats({ rounds: 3, players: {}, allStuck: 0, races: 0 });
    expect(old!.history).toEqual({});
  });
});

describe('nextStats', () => {
  it('counts a dash and a bottom finish', () => {
    const s = nextStats(null, round());
    expect(statsFor(s, 'ann').dashes).toBe(1);
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

  it('keeps only the fastest dash, and ignores a round with no usable clock', () => {
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
    nextStats(one, round({ roundNumber: 2, dashedBy: 'bo', totals: { ann: 1, bo: 30 } }));
    expect(one).toEqual(snapshot);
  });

  it('counts the run of rounds one player has ended', () => {
    const one = nextStats(null, round({ dashedBy: 'ann' }));
    expect(statsFor(one, 'ann').dashStreak).toBe(1);
    expect(statsFor(one, 'bo').dashStreak).toBe(0);
    const two = nextStats(one, round({ roundNumber: 2, dashedBy: 'ann', totals: { ann: 18, bo: -8 } }));
    expect(statsFor(two, 'ann').dashStreak).toBe(2);
  });

  it('resets the run the moment somebody else dashes', () => {
    const two = nextStats(nextStats(null, round({ dashedBy: 'ann' })),
      round({ roundNumber: 2, dashedBy: 'ann', totals: { ann: 18, bo: -8 } }));
    const three = nextStats(two, round({ roundNumber: 3, dashedBy: 'bo', totals: { ann: 14, bo: 1 } }));
    expect(statsFor(three, 'ann').dashStreak).toBe(0);
    expect(statsFor(three, 'bo').dashStreak).toBe(1);
    // The lifetime count is untouched by the reset - that is what `dashes` is for.
    expect(statsFor(three, 'ann').dashes).toBe(2);
  });

  it('resets the whole table on a round that stalled with no dasher', () => {
    // Nobody won it, so nobody is on a run through it.
    const one = nextStats(null, round({ dashedBy: 'ann' }));
    const stalled = nextStats(one, round({ roundNumber: 2, dashedBy: null, totals: { ann: 9, bo: -4 } }));
    expect(statsFor(stalled, 'ann').dashStreak).toBe(0);
  });

  it('resets a run for somebody who sat the round out', () => {
    // They did not win it either. `totals` carries every player in the room and
    // not only the ones who scored, which is what makes them reachable here.
    const one = nextStats(null, round({ dashedBy: 'ann' }));
    const out = nextStats(one, round({
      roundNumber: 2, dashedBy: 'bo', scores: { bo: sc(5) }, totals: { ann: 9, bo: 1 },
    }));
    expect(statsFor(out, 'ann').dashStreak).toBe(0);
    expect(statsFor(out, 'bo').dashStreak).toBe(1);
  });

  it('counts a run at a single player, where the last-place block does not', () => {
    // The bottom-of-the-table block is skipped at one player and skipped again on
    // a level table. Neither has anything to do with who dashed, which is why the
    // streak is counted outside it.
    const solo = nextStats(null, round({ scores: { ann: sc(9) }, totals: { ann: 9 } }));
    expect(statsFor(solo, 'ann').dashStreak).toBe(1);
    const level = nextStats(null, round({ dashedBy: 'ann', totals: { ann: 5, bo: 5 } }));
    expect(statsFor(level, 'ann').dashStreak).toBe(1);
    expect(statsFor(level, 'bo').dashStreak).toBe(0);
  });

  it('reads a room that has never had stats written to it', () => {
    expect(normalizeStats(undefined)).toBeNull();
    // Spelled out rather than compared to NO_PLAYER_STATS, deliberately: this is
    // the one place that pins what a brand-new player's stats ARE, and comparing
    // the constant to itself would pass however it changed.
    expect(statsFor(null, 'ann')).toEqual(
      { dashes: 0, lastPlaces: 0, lastStreak: 0, dashStreak: 0, racesWon: 0, racesLost: 0 });
    // RTDB gives back only what was written, so partial objects have to be safe.
    expect(normalizeStats({ rounds: 4 })!.players).toEqual({});
    expect(normalizeStats({ rounds: 4 })!.races).toBe(0);
  });
});
