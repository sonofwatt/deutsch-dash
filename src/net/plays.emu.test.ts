/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { createRoom, normalizeRoom } from './rooms';
import { commitScores, nextRound, playToCenter, startRound } from './plays';
import { get, ref, update } from 'firebase/database';
import type { Card, CenterSpace, Room, Suit } from '../game/types';

const emu = describe.runIf(process.env.EMULATOR === '1');

emu('center transactions against emulator', () => {
  it('exactly one of two same-card racers wins a space', async () => {
    const code = await createRoom('Host', 'tulip');
    const { db, ensureSignedIn } = await import('./firebase');
    const uid = await ensureSignedIn();
    const room: Room = {
      meta: { createdAt: Date.now(), hostId: uid, creatorId: uid, targetScore: 75, phase: 'lobby', roundNumber: 0 },
      players: { [uid]: { name: 'Host', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0 } },
      round: null,
    };
    await startRound(code, room);
    const one: Card = { v: 1, suit: 'red', owner: uid };
    const results = await Promise.all([
      playToCenter(code, 0, one),
      playToCenter(code, 0, one), // same card racing itself: second must abort
    ]);
    expect(results.filter(r => r.committed)).toHaveLength(1);
    // The loser is told who beat it, off the aborted transaction's own snapshot.
    expect(results.find(r => !r.committed)!.winner).toBe(uid);
    const snap = await get(ref(db, `rooms/${code}/round/spaces/0/stack`));
    expect(snap.val()).toHaveLength(1);
  });
});

emu('game-over threshold against emulator', () => {
  // Answers "should the game have ended at 24 with the target set to 25?" against
  // the real write path rather than the pure scorer: commitScores is what decides,
  // and it must clear the bar, not merely approach it.
  async function roundWorth(centerCards: number) {
    const code = await createRoom('Host', 'tulip');
    const { db, ensureSignedIn } = await import('./firebase');
    const uid = await ensureSignedIn();
    const meta = { createdAt: Date.now(), hostId: uid, creatorId: uid, targetScore: 25,
                   phase: 'roundEnd' as const, roundNumber: 1 };
    const players = { [uid]: { name: 'Host', badgeId: 'tulip' as const, joinedAt: 1,
                               connected: true, stuckAt: null, awayAt: null, score: 0 } };
    await startRound(code, { meta: { ...meta, phase: 'lobby' }, players, round: null });
    await update(ref(db, `rooms/${code}/meta`), { phase: 'roundEnd' }); // the blitz landed

    // n cards of mine sitting in the centre, nothing left in my Blitz pile:
    // delta is exactly n (+1 each, no -2 penalty).
    const suits: Suit[] = ['red', 'blue', 'green', 'yellow'];
    const mine: Card[] = Array.from({ length: centerCards }, (_, i) =>
      ({ v: (i % 10) + 1, suit: suits[Math.floor(i / 10) % 4], owner: uid }));
    const spaces: CenterSpace[] = Array.from({ length: 16 }, (_, i) =>
      ({ stack: i === 0 ? mine : [], history: [] }));
    const room: Room = {
      meta, players,
      round: { spaces, tableaus: { [uid]: { blitz: [], post: [[], [], []], wood: [], woodIndex: 0 } },
               blitzedBy: uid, scores: null, races: null, duels: null, endedAt: null, stuckRounds: 0, startedAt: 1 },
    };
    await commitScores(code, room);
    const snap = await get(ref(db, `rooms/${code}`));
    const written = snap.val() as { meta: { phase: string }; players: Record<string, { score: number }> };
    return { phase: written.meta.phase, score: written.players[uid].score };
  }

  it('one short of the target keeps playing', async () => {
    expect(await roundWorth(24)).toEqual({ phase: 'roundEnd', score: 24 });
  });
  it('reaching the target ends the game', async () => {
    expect(await roundWorth(25)).toEqual({ phase: 'gameOver', score: 25 });
  });
});

emu('the round shown in the 2026-08-25 playtest screenshot', () => {
  // Replays that exact board: Dave blitzes for +24, the other player is left
  // holding all ten Blitz cards for -20, and the target is 25. The report was
  // "the game ended at 24" - so this asserts both halves: the game must NOT end
  // one short of the target, and "Next round" must actually deal the next round.
  it('scores 24/-12, keeps playing, and deals round 2', async () => {
    const code = await createRoom('Dave', 'boat');
    const { db, ensureSignedIn } = await import('./firebase');
    const dave = await ensureSignedIn();
    const other = 'other-player-uid';
    await update(ref(db, `rooms/${code}`), {
      [`players/${other}`]: { name: 'sonofwatt', badgeId: 'anchor', joinedAt: 2,
                              connected: true, stuckAt: null, awayAt: null, score: 0 },
      'meta/targetScore': 25,
    });

    const players = {
      [dave]: { name: 'Dave', badgeId: 'boat' as const, joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0 },
      [other]: { name: 'sonofwatt', badgeId: 'anchor' as const, joinedAt: 2, connected: true, stuckAt: null, awayAt: null, score: 0 },
    };
    const meta = { createdAt: Date.now(), hostId: dave, creatorId: dave, targetScore: 25,
                   phase: 'roundEnd' as const, roundNumber: 1 };
    await startRound(code, { meta: { ...meta, phase: 'lobby' }, players, round: null });
    await update(ref(db, `rooms/${code}/meta`), { phase: 'roundEnd' });

    const suits: Suit[] = ['red', 'blue', 'green', 'yellow'];
    const owned = (owner: string, n: number, from = 0): Card[] => Array.from({ length: n }, (_, i) =>
      ({ v: ((from + i) % 10) + 1, suit: suits[Math.floor((from + i) / 10) % 4], owner }));
    const spaces: CenterSpace[] = Array.from({ length: 16 }, (_, i) =>
      ({ stack: i === 0 ? owned(dave, 24) : i === 1 ? owned(other, 8) : [], history: [] }));
    const room: Room = {
      meta, players,
      round: {
        spaces,
        tableaus: {
          [dave]: { blitz: [], post: [[], [], [], [], []], wood: [], woodIndex: 0 },
          [other]: { blitz: owned(other, 10, 8), post: [[], [], [], [], []], wood: [], woodIndex: 0 },
        },
        blitzedBy: dave, scores: null, races: null, duels: null, endedAt: null, stuckRounds: 0, startedAt: 1,
      },
    };

    await commitScores(code, room);
    const afterScoring = normalizeRoom((await get(ref(db, `rooms/${code}`))).val())!;
    expect(afterScoring.players[dave].score).toBe(24);
    expect(afterScoring.players[other].score).toBe(-12);
    expect(afterScoring.meta.phase).toBe('roundEnd'); // 24 does not clear a target of 25

    await nextRound(code, afterScoring);
    const afterNext = normalizeRoom((await get(ref(db, `rooms/${code}`))).val())!;
    expect(afterNext.meta.phase).toBe('playing');
    expect(afterNext.meta.roundNumber).toBe(afterScoring.meta.roundNumber + 1);
    expect(afterNext.round!.blitzedBy).toBeNull();
    expect(afterNext.round!.scores).toBeNull();
    expect(afterNext.round!.spaces.every(sp => sp.stack.length === 0)).toBe(true);
    // both players dealt a fresh 2-player tableau: 10 blitz, 5 posts, 25 wood
    for (const uid of [dave, other]) {
      const t = afterNext.round!.tableaus[uid];
      expect(t.blitz).toHaveLength(10);
      expect(t.post).toHaveLength(5);
      expect(t.wood).toHaveLength(25);
    }
    expect(afterNext.players[dave].score).toBe(24); // totals carry into round 2
  });
});
