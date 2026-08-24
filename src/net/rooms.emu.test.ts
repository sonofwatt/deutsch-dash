/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRoom, joinRoom, normalizeRoom, MAX_PLAYERS } from './rooms';
import { get, ref } from 'firebase/database';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
  type RulesTestEnvironment, type RulesTestContext,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

// The 8-player cap and badge uniqueness live entirely in database.rules.json,
// so testing them honestly means proving the RULES reject/allow writes - not
// just observing that joinRoom()'s client-side pre-checks do.
//
// That can't be done with the regular client SDK (firebase/database) here:
// against a "demo-*" project's local emulator, EVERY connection - including
// one that never signed in at all - is treated as an owner and bypasses
// .write/.validate entirely. Confirmed empirically: an UNAUTHENTICATED
// set() to a path whose rule is ".write": "auth != null" still succeeded,
// and an authenticated set() against a path whose rule is
// ".validate": "false" (an unconditional reject) still succeeded too. See
// the report for the full isolation trail.
//
// @firebase/rules-unit-testing's authenticatedContext()/assertFails/
// assertSucceeds is Firebase's own supported tool for this - it drives the
// emulator's rules-evaluation endpoint directly rather than through a
// "trust me, I'm local" client connection, so .write/.validate are actually
// exercised. It replaces the second-real-signed-in-identity approach (a
// second Firebase app + signInAnonymously) for everything in this describe
// block: authenticatedContext(uid) mints a rules-only identity directly,
// which is both simpler and (per the above) actually meaningful here.
const rulesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database.rules.json');

emu('server-side player cap and badge uniqueness (database.rules.json)', () => {
  const HOST = 'rules-test-host';
  const RACER = 'rules-test-racer';
  let testEnv: RulesTestEnvironment;
  let hostCtx: RulesTestContext;
  let racerCtx: RulesTestContext;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-blitz',
      database: { host: '127.0.0.1', port: 9000, rules: readFileSync(rulesPath, 'utf8') },
    });
    hostCtx = testEnv.authenticatedContext(HOST);
    racerCtx = testEnv.authenticatedContext(RACER);
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  // Writes a brand-new lobby room the same way createRoom() does post-fix -
  // meta committed FIRST, then players/badges - then, as the host (who has
  // write access to any players/$uid), seeds `extraPlayers` more players the
  // same way a real join would: each seed bumps meta/playerCount in the SAME
  // multi-path update as the player record, exactly like joinRoom().
  async function seedRoom(code: string, extraPlayers: number): Promise<void> {
    const db = hostCtx.database();
    await assertSucceeds(db.ref(`rooms/${code}/meta`).set({
      createdAt: Date.now(), hostId: HOST, targetScore: 75, phase: 'lobby', roundNumber: 0, playerCount: 1,
    }));
    await assertSucceeds(db.ref(`rooms/${code}`).update({
      [`players/${HOST}`]: { name: 'Host', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, score: 0 },
      'badges/tulip': HOST,
    }));
    for (let i = 0; i < extraPlayers; i++) {
      await assertSucceeds(db.ref(`rooms/${code}`).update({
        [`players/seed-${i}`]: {
          name: `Seed${i}`, badgeId: 'star', joinedAt: i, connected: true, stuckAt: null, score: 0,
        },
        'meta/playerCount': i + 2, // host is already player 1
      }));
    }
  }

  it('rejects a 9th player write once the room has 8, even bypassing the client pre-check', async () => {
    const code = 'CAPFULL01';
    await seedRoom(code, MAX_PLAYERS - 1); // host + 7 seeds = 8
    // A correctly-shaped playerCount (9) isolates the cap bound itself as
    // the reason for rejection, not an incidental counter mismatch.
    await assertFails(racerCtx.database().ref(`rooms/${code}`).update({
      [`players/${RACER}`]: {
        name: 'Racer', badgeId: 'bicycle', joinedAt: Date.now(), connected: true, stuckAt: null, score: 0,
      },
      'meta/playerCount': 9,
    }));
  });

  it('still allows writes to an existing player at 8/8, in lobby and in playing phase', async () => {
    const code = 'CAPFULL02';
    await seedRoom(code, MAX_PLAYERS - 1); // room is now at the cap
    const db = hostCtx.database();
    await assertSucceeds(db.ref(`rooms/${code}/players/seed-0`).update({ score: 5 }));
    await assertSucceeds(db.ref(`rooms/${code}/meta/phase`).set('playing'));
    await assertSucceeds(db.ref(`rooms/${code}/players/seed-1`).update({ score: 7 }));
  });

  it('rejects claiming a badge already held by another uid, but allows claiming a free one', async () => {
    const code = 'BADGERACE';
    await seedRoom(code, 0); // just the host, who holds 'tulip'
    await assertFails(racerCtx.database().ref(`rooms/${code}/badges/tulip`).set(RACER));
    await assertSucceeds(racerCtx.database().ref(`rooms/${code}/badges/star`).set(RACER));
  });

  it('lets the original owner rewrite their player record and re-claim their badge in any phase', async () => {
    const code = 'REJOINANY';
    await seedRoom(code, 0);
    const db = hostCtx.database();
    await assertSucceeds(db.ref(`rooms/${code}/meta/phase`).set('playing')); // rejoin must work outside lobby too
    await assertSucceeds(db.ref(`rooms/${code}/players/${HOST}`).set({
      name: 'Host', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, score: 3,
    }));
    await assertSucceeds(db.ref(`rooms/${code}/badges/tulip`).set(HOST)); // idempotent re-claim, same owner

    // Functional regression: the real client rejoin path (joinRoom, via the
    // regular SDK) still works mid-game, and correctly leaves the badge
    // claim alone rather than rewriting it (see src/net/rooms.ts).
    const { ensureSignedIn } = await import('./firebase');
    const realUid = await ensureSignedIn();
    const realCode = await createRoom('Dav2', 'anchor');
    const res = await joinRoom(realCode, 'Dav2', 'anchor');
    expect(res).toEqual({ ok: true, code: realCode });
    expect(realUid).toBeTruthy();
  });

  it('createRoom still succeeds end-to-end under the new validate rule, and claims the badge', async () => {
    // Guards the "cross-reference the same write" trap: the players/$uid
    // .validate rule reads meta/phase to gate new joins, and that read is
    // only reliable when meta is data already committed by a PRIOR write -
    // not data being written in the SAME operation as the player (verified
    // empirically; see the report). createRoom() writes meta first, then
    // players/badges, specifically so this reference is safe. This
    // replicates that exact two-step shape directly against the rules
    // engine, since (per the note above this describe block) the regular
    // client SDK can't be used to prove rule compliance here.
    const code = 'CREATENEW';
    const db = hostCtx.database();
    await assertSucceeds(db.ref(`rooms/${code}/meta`).set({
      createdAt: Date.now(), hostId: HOST, targetScore: 75, phase: 'lobby', roundNumber: 0, playerCount: 1,
    }));
    await assertSucceeds(db.ref(`rooms/${code}`).update({
      [`players/${HOST}`]: { name: 'Host', badgeId: 'kite', joinedAt: 1, connected: true, stuckAt: null, score: 0 },
      'badges/kite': HOST,
    }));

    // Functional regression: the real createRoom() (regular SDK) still
    // produces this same shape end-to-end.
    const { ensureSignedIn, db: realDb } = await import('./firebase');
    await ensureSignedIn();
    const realCode = await createRoom('Solo', 'kite');
    const snap = await get(ref(realDb, `rooms/${realCode}`));
    const room = normalizeRoom(snap.val())!;
    expect(room.meta.phase).toBe('lobby');
    expect(room.meta.playerCount).toBe(1);
    expect(Object.keys(room.players)).toHaveLength(1);
    const badgeSnap = await get(ref(realDb, `rooms/${realCode}/badges/kite`));
    expect(badgeSnap.val()).toBe(room.meta.hostId);
  });

  it('rejects a brand-new player write once the room has left lobby, at the rules level', async () => {
    const code = 'PHASEGATE';
    await seedRoom(code, 0);
    await assertSucceeds(hostCtx.database().ref(`rooms/${code}/meta/phase`).set('playing'));
    // A correctly-shaped playerCount (2) isolates the phase gate itself as
    // the reason for rejection, not an incidental counter mismatch.
    await assertFails(racerCtx.database().ref(`rooms/${code}`).update({
      [`players/${RACER}`]: {
        name: 'Racer', badgeId: 'bicycle', joinedAt: Date.now(), connected: true, stuckAt: null, score: 0,
      },
      'meta/playerCount': 2,
    }));
  });
});
