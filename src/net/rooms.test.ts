import { describe, it, expect } from 'vitest';
import { normalizeRoom } from './rooms';

describe('a round holds the size it was dealt with', () => {
  // The board used to be derived from the live player count on every client,
  // which was safe only while that count could not change mid-round. It can now:
  // somebody may join a game in progress. Without spaceCount their arrival grows
  // the board under everybody's hands, which is the exact thing sizing on the
  // whole room was chosen to avoid.
  const round = (spaceCount?: number) => ({
    tableaus: {}, dashedBy: null, scores: null, races: null, duels: null,
    endedAt: null, stuckRounds: 0, startedAt: 1, ...(spaceCount ? { spaceCount } : {}),
  });
  const raw = (players: number, r: unknown) => ({
    meta: { createdAt: 1, hostId: 'a', creatorId: 'a', targetScore: 75, phase: 'playing', roundNumber: 1 },
    players: Object.fromEntries(Array.from({ length: players }, (_, i) => [`p${i}`,
      { name: `P${i}`, badgeId: 'star', joinedAt: i, connected: true, stuckAt: null, awayAt: null, score: 0 }])),
    round: r,
  });

  it('keeps a four-player board at 16 when a fifth player walks in mid-round', () => {
    expect(normalizeRoom(raw(4, round(16)))!.round!.spaces).toHaveLength(16);
    expect(normalizeRoom(raw(5, round(16)))!.round!.spaces).toHaveLength(16);
  });

  it('falls back to the player count for a round dealt before the field existed', () => {
    // Correct for those rounds: nobody could join one of them late.
    expect(normalizeRoom(raw(5, round()))!.round!.spaces).toHaveLength(20);
  });
});

describe('a room is read defensively', () => {
  // Everything under a room was written by some client, and several fields by any
  // authed client, so a value that is not what the code expects is a matter of
  // when, not if. These are the shapes that used to take every client in the
  // room down, or turn its totals into NaN.
  const base = () => ({
    meta: { createdAt: 1, hostId: 'a', creatorId: 'a', targetScore: 75, phase: 'playing', roundNumber: 1 },
    players: { a: { name: 'A', badgeId: 'star', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0 } },
    round: { tableaus: { a: { dash: [], post: [[], [], []], wood: [], woodIndex: 0 } }, dashedBy: null, scores: null,
             races: null, duels: null, endedAt: null, stuckRounds: 0, startedAt: 1 },
  });

  it('holds a forged space count to the board a real deal can produce', () => {
    // Array.from({ length: 1e9 }) is a RangeError, on every client, on every snapshot.
    const r = base(); (r.round as Record<string, unknown>).spaceCount = 1e9;
    expect(normalizeRoom(r)!.round!.spaces).toHaveLength(4);
    (r.round as Record<string, unknown>).spaceCount = -3;
    expect(normalizeRoom(r)!.round!.spaces).toHaveLength(4);
    (r.round as Record<string, unknown>).spaceCount = 'lots';
    expect(normalizeRoom(r)!.round!.spaces).toHaveLength(4);
    (r.round as Record<string, unknown>).spaceCount = 32;
    expect(normalizeRoom(r)!.round!.spaces).toHaveLength(32);
  });

  it('holds a forged post count too', () => {
    const r = base(); (r.round as Record<string, unknown>).postCount = 1e7;
    expect(normalizeRoom(r)!.round!.tableaus.a.post).toHaveLength(3);
  });

  it('reads numbers that are not numbers as their defaults', () => {
    const r = base();
    (r.players.a as Record<string, unknown>).score = 'twelve';
    (r.players.a as Record<string, unknown>).joinedAt = null;
    (r.meta as Record<string, unknown>).targetScore = { evil: true };
    (r.meta as Record<string, unknown>).countdown = 'GO';
    (r.round as Record<string, unknown>).stuckRounds = NaN;
    const room = normalizeRoom(r)!;
    expect(room.players.a.score).toBe(0);
    expect(room.players.a.joinedAt).toBe(0);
    expect(room.meta.targetScore).toBe(75);
    expect(room.meta.countdown).toBeNull();
    expect(room.round!.stuckRounds).toBe(0);
  });

  it('holds a name to the length the join form allows', () => {
    const r = base(); r.players.a.name = 'x'.repeat(5000);
    expect(normalizeRoom(r)!.players.a.name).toHaveLength(14);
  });

  it('drops a player record that is not a record, and a seat that is not a uid', () => {
    const r = base();
    (r.players as Record<string, unknown>).ghost = 'boo';
    (r.round as Record<string, unknown>).seats = ['a', 7, null];
    const room = normalizeRoom(r)!;
    expect(Object.keys(room.players)).toEqual(['a']);
    expect(room.round!.seats).toEqual(['a']);
  });

  it('reads a tally that is not an object as absent', () => {
    const r = base();
    (r.round as Record<string, unknown>).scores = 'none';
    (r.round as Record<string, unknown>).duels = 4;
    (r.round as Record<string, unknown>).dashedBy = { uid: 'a' };
    const room = normalizeRoom(r)!;
    expect(room.round!.scores).toBeNull();
    expect(room.round!.duels).toBeNull();
    expect(room.round!.dashedBy).toBeNull();
  });
});
