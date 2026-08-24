/// <reference types="node" />
import { describe, it, expect, beforeAll } from 'vitest';
import { createRoom, joinRoom, normalizeRoom } from './rooms';
import { get, ref } from 'firebase/database';

const emu = describe.runIf(process.env.EMULATOR === '1');

emu('rooms against emulator', () => {
  beforeAll(async () => {
    const { ensureSignedIn } = await import('./firebase');
    await ensureSignedIn();
  });

  it('createRoom writes meta + host player; joinRoom rejects bad codes', async () => {
    const code = await createRoom('Dav', 'tulip');
    expect(code).toHaveLength(6);
    const { db } = await import('./firebase');
    const snap = await get(ref(db, `rooms/${code}`));
    const room = normalizeRoom(snap.val())!;
    expect(room.meta.phase).toBe('lobby');
    expect(room.meta.targetScore).toBe(75);
    expect(Object.keys(room.players)).toHaveLength(1);

    const bad = await joinRoom('ZZZZZZ', 'Eve', 'star');
    expect(bad).toEqual({ ok: false, reason: 'not-found' });
    // same anonymous uid rejoining its own room is always ok
    const rejoin = await joinRoom(code, 'Dav', 'tulip');
    expect(rejoin).toEqual({ ok: true, code });
  });
});
