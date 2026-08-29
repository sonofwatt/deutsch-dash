import { describe, it, expect } from 'vitest';
import { normalizeRoom } from './rooms';

describe('a round holds the size it was dealt with', () => {
  // The board used to be derived from the live player count on every client,
  // which was safe only while that count could not change mid-round. It can now:
  // somebody may join a game in progress. Without spaceCount their arrival grows
  // the board under everybody's hands, which is the exact thing sizing on the
  // whole room was chosen to avoid.
  const round = (spaceCount?: number) => ({
    tableaus: {}, blitzedBy: null, scores: null, races: null, duels: null,
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
