import { describe, it, expect } from 'vitest';
import { commentary, type CommentaryInput } from './commentary';
import type { GameStats } from '../game/stats';
import type { CenterSpace, PlayerInfo, RoundScore, Suit } from '../game/types';

const player = (name: string, score: number, extra: Partial<PlayerInfo> = {}): PlayerInfo => ({
  name, badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, score, ...extra,
});
const sc = (centerCount: number, blitzLeft: number): RoundScore =>
  ({ centerCount, blitzLeft, delta: centerCount - 2 * blitzLeft });
const run = (upto: number, owner: string, suit: Suit = 'red'): CenterSpace['stack'] =>
  Array.from({ length: upto }, (_, i) => ({ v: i + 1, suit, owner }));

const base = (over: Partial<CommentaryInput> = {}): CommentaryInput => ({
  players: { ann: player('Ann', 20), bo: player('Bo', 18) },
  scores: { ann: sc(6, 0), bo: sc(4, 1) },
  spaces: [], duels: null, blitzedBy: 'ann', roundNumber: 3, targetScore: 75,
  durationMs: 120_000, stuckRounds: 0, stats: null, ...over,
});
const ids = (input: CommentaryInput) => commentary(input).map(r => r.id);
const textOf = (input: CommentaryInput, id: string) =>
  commentary(input).find(r => r.id === id)?.text ?? '';

describe('commentary', () => {
  it('says nothing about an empty table', () => {
    expect(commentary(base({ players: {}, scores: {} }))).toEqual([]);
  });

  it('calls out a fast blitz, and stays quiet about an ordinary one', () => {
    expect(ids(base({ durationMs: 38_000 }))).toContain('speed-blitz');
    expect(textOf(base({ durationMs: 38_000 }), 'speed-blitz')).toContain('38');
    expect(ids(base({ durationMs: 120_000 }))).not.toContain('speed-blitz');
  });

  it('counts in English', () => {
    // "1 seconds" and "0 apart" both turned up in a real round.
    expect(textOf(base({ durationMs: 1_000 }), 'speed-blitz')).toContain('1 second.');
    expect(textOf(base({ durationMs: 2_000 }), 'speed-blitz')).toContain('2 seconds');
    const level = base({ players: { ann: player('Ann', 12), bo: player('Bo', 12) } });
    expect(textOf(level, 'photo-finish')).not.toContain('0 ');
    expect(textOf(level, 'photo-finish')).toMatch(/level|Not a point/);
  });

  it('knows a round nobody won', () => {
    expect(ids(base({ blitzedBy: null }))).toContain('stalled');
  });

  it('spots a rivalry from the duel tally, counting both directions', () => {
    // Two lost to each other twice one way and once the other: one rivalry, three races.
    const duels = { ann: { bo: 2 }, bo: { ann: 1 } };
    const text = textOf(base({ duels }), 'rivalry');
    expect(text).toMatch(/\b3\b/);        // both directions counted, whichever line came up
    expect(text).toContain('Ann');
    expect(text).toContain('Bo');
  });

  it('ignores duels involving somebody who has left the room', () => {
    // A player removed between the race and the sheet must not become "undefined".
    const remarks = commentary(base({ duels: { ann: { ghost: 5 } } }));
    expect(remarks.map(r => r.id)).not.toContain('rivalry');
    expect(remarks.every(r => !r.text.includes('undefined'))).toBe(true);
  });

  it('notices a runaway leader, but calls a close game a photo finish instead', () => {
    const runaway = base({ players: { ann: player('Ann', 60), bo: player('Bo', 18) } });
    expect(ids(runaway)).toContain('runaway');
    expect(ids(runaway)).not.toContain('photo-finish');
    expect(ids(base())).toContain('photo-finish');   // 20 vs 18
  });

  it('warns the table when someone is one round from winning', () => {
    const input = base({ players: { ann: player('Ann', 71), bo: player('Bo', 18) } });
    expect(textOf(input, 'match-point')).toContain('Ann');
    // Only one of the two phrasings quotes the gap, so pin the arithmetic across rounds.
    const texts = [3, 4, 5, 6].map(n => textOf({ ...input, roundNumber: n }, 'match-point'));
    expect(texts.some(t => t.includes('4 more'))).toBe(true);
    // ...but not once the game is actually over, where it would be nonsense.
    expect(ids({ ...input, final: true })).not.toContain('match-point');
  });

  it('is ruder about a negative score than a merely bad one', () => {
    expect(ids(base({ players: { ann: player('Ann', 20), bo: player('Bo', -6) } }))).toContain('basement');
    expect(ids(base())).not.toContain('basement');
    // ...but names nobody when the whole table is equally in the hole: which of
    // them sorts last is an accident of key order, not a fact about the game.
    expect(ids(base({ players: { ann: player('Ann', -8), bo: player('Bo', -8) } }))).not.toContain('basement');
  });

  it('reserves its worst for humans losing to the easy bot', () => {
    const players = {
      ann: player('Ann', 10),
      bot: player('Botty', 40, { isBot: true, botLevel: 'easy' }),
    };
    expect(ids(base({ players, scores: { ann: sc(2, 3), bot: sc(9, 0) } }))).toContain('easy-shame');
    const hard = { ...players, bot: player('Botty', 40, { isBot: true, botLevel: 'hard' }) };
    expect(ids(base({ players: hard, scores: { ann: sc(2, 3), bot: sc(9, 0) } }))).toContain('bot-ahead');
  });

  it('credits whoever closed the piles, from the board rather than the scores', () => {
    // Bo closes them: Ann is already the subject of two other rules in this
    // fixture, and the thinning pass would drop a third remark about her.
    const spaces: CenterSpace[] = [
      { stack: [], history: [run(10, 'bo')] },
      { stack: [], history: [run(10, 'bo', 'blue')] },
      { stack: run(3, 'ann', 'green'), history: [] },
    ];
    const text = textOf(base({ spaces }), 'pile-closer');
    expect(text).toContain('Bo');
    expect(text).toMatch(/\b2\b/);
  });

  it('does not make one player the sole punchline more than twice', () => {
    // A round engineered so half a dozen rules all point at Ann.
    const input = base({
      players: { ann: player('Ann', 70), bo: player('Bo', 4), cy: player('Cy', 3) },
      scores: { ann: sc(12, 0), bo: sc(0, 9), cy: sc(1, 8) },
      duels: { bo: { ann: 4 }, cy: { ann: 3 } },
      durationMs: 30_000, spaces: [{ stack: [], history: [run(10, 'ann')] }],
    });
    const remarks = commentary(input);
    expect(remarks.length).toBeLessThanOrEqual(6);
    const soloAnn = remarks.filter(r => r.about.length === 1 && r.about[0] === 'ann');
    expect(soloAnn.length).toBeLessThanOrEqual(2);
    // A remark she shares with someone still lands: the other party has not spoken.
    expect(remarks.some(r => r.about.length > 1 && r.about.includes('ann'))).toBe(true);
  });

  it('leads with the most interesting thing that happened', () => {
    const remarks = commentary(base({ durationMs: 30_000, roundNumber: 1 }));
    // A 30-second blitz outranks "it is round one".
    expect(remarks[0].id).toBe('speed-blitz');
    expect(remarks.map(r => r.priority)).toEqual([...remarks.map(r => r.priority)].sort((a, b) => b - a));
  });

  it('is stable within a round and moves on between them', () => {
    const a = commentary(base({ roundNumber: 3 }));
    expect(commentary(base({ roundNumber: 3 }))).toEqual(a);  // no randomness: the carousel re-renders on a timer
    const later = commentary(base({ roundNumber: 4 }));
    expect(later.map(r => r.id)).toEqual(a.map(r => r.id));   // same situation...
    expect(later).not.toEqual(a);                             // ...different words
  });

  const stats = (over: Partial<GameStats> = {}): GameStats => ({
    rounds: 4, players: {}, fastest: null, best: null, worst: null, allStuck: 0, races: 0, ...over,
  });
  const pStats = (over = {}) =>
    ({ blitzes: 0, lastPlaces: 0, lastStreak: 0, racesWon: 0, racesLost: 0, ...over });

  it('notices a losing streak, which one round on its own cannot see', () => {
    const input = base({ stats: stats({ players: { bo: pStats({ lastStreak: 3 }) } }) });
    expect(textOf(input, 'last-streak')).toContain('Bo');
    expect(textOf(input, 'last-streak')).toMatch(/\b3\b/);
  });

  it('calls a record round only in the round that set it', () => {
    const best = { uid: 'ann', delta: 21, round: 3 };
    expect(ids(base({ roundNumber: 3, stats: stats({ best }) }))).toContain('record-round');
    // Round 4: still the record, no longer news.
    expect(ids(base({ roundNumber: 4, stats: stats({ best }) }))).not.toContain('record-round');
  });

  it('salutes a player who has never lost a race, once there have been some', () => {
    // Bo, not Ann: this fixture already spends both of Ann's slots on the round
    // itself, and the thinning pass would drop a third remark about her.
    const players = { bo: pStats({ racesWon: 4, racesLost: 0 }), ann: pStats({ racesLost: 4 }) };
    expect(ids(base({ stats: stats({ players, races: 8 }) }))).toContain('unbeaten');
    // Two races between them is not yet a record worth defending.
    expect(ids(base({ stats: stats({ players, races: 2 }) }))).not.toContain('unbeaten');
  });

  it('keeps the standing fastest blitz, except in the round that set it', () => {
    const fastest = { uid: 'bo', ms: 31_000, round: 2 };
    expect(textOf(base({ roundNumber: 3, stats: stats({ fastest }) }), 'standing-record')).toContain('31');
    expect(ids(base({ roundNumber: 2, stats: stats({ fastest }) }))).not.toContain('standing-record');
  });

  it('waits three rounds before mentioning that somebody has never blitzed', () => {
    const players = { ann: pStats({ blitzes: 2 }), bo: pStats({ blitzes: 0 }) };
    expect(ids(base({ stats: stats({ rounds: 2, players }) }))).not.toContain('never-blitzed');
    expect(textOf(base({ stats: stats({ rounds: 4, players }) }), 'never-blitzed')).toContain('Bo');
  });

  it('counts the standstills across the whole game', () => {
    expect(textOf(base({ stats: stats({ allStuck: 4 }) }), 'all-stuck')).toMatch(/\b4\b/);
    expect(ids(base({ stats: stats({ allStuck: 2 }) }))).not.toContain('all-stuck');
  });

  it('says nothing game-long in the first round of a game', () => {
    const long = ['last-streak', 'record-round', 'unbeaten', 'standing-record', 'blitz-hoarder', 'all-stuck'];
    const first = ids(base({
      roundNumber: 1,
      stats: stats({ rounds: 1, allStuck: 5, players: { bo: pStats({ lastStreak: 1 }) } }),
    }));
    expect(long.filter(id => first.includes(id))).toEqual([]);
  });

  it('saves the champion line for the final sheet', () => {
    const input = base({ players: { ann: player('Ann', 76), bo: player('Bo', 30) } });
    expect(ids(input)).not.toContain('champion');
    const final = commentary({ ...input, final: true });
    expect(final[0].id).toBe('champion');
    expect(final[0].text).toContain('Ann');
  });
});
