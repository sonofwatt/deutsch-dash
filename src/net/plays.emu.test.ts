/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { createRoom } from './rooms';
import { playToCenter, startRound } from './plays';
import { get, ref } from 'firebase/database';
import type { Card, Room } from '../game/types';

const emu = describe.runIf(process.env.EMULATOR === '1');

emu('center transactions against emulator', () => {
  it('exactly one of two same-card racers wins a space', async () => {
    const code = await createRoom('Host', 'tulip');
    const { db, ensureSignedIn } = await import('./firebase');
    const uid = await ensureSignedIn();
    const room: Room = {
      meta: { createdAt: Date.now(), hostId: uid, creatorId: uid, targetScore: 75, phase: 'lobby', roundNumber: 0 },
      players: { [uid]: { name: 'Host', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, score: 0 } },
      round: null,
    };
    await startRound(code, room);
    const one: Card = { v: 1, suit: 'red', owner: uid };
    const results = await Promise.all([
      playToCenter(code, 0, one),
      playToCenter(code, 0, one), // same card racing itself: second must abort
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const snap = await get(ref(db, `rooms/${code}/round/spaces/0/stack`));
    expect(snap.val()).toHaveLength(1);
  });
});
