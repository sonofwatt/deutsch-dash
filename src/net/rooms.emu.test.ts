/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRoom, joinRoom, normalizeRoom, peekRoom, setIdentity, MAX_PLAYERS, ROOM_TTL_MS } from './rooms';
import { startRound } from './plays';
import { makeRoomCode } from './roomCodes';
import {
  connectDatabaseEmulator, get, getDatabase, increment, ref, set, update, type Database,
} from 'firebase/database';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
  type RulesTestEnvironment, type RulesTestContext,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { BadgeId } from '../game/badges';

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

  it('an expired room turns a newcomer away and still lets a member back in', async () => {
    // Only time can age a room now that createdAt is write-once, so the aged
    // room is seeded with the rules off, in the namespace the app's own db uses.
    // Expiry used to run before the rejoin check, so it gated every reload and
    // every resume after a phone slept, against this device's clock.
    const { ensureSignedIn } = await import('./firebase');
    const me = await ensureSignedIn();
    // rules-unit-testing addresses the namespace named by its projectId, with no
    // suffix, so this is the app's demo-dash-default-rtdb and not demo-dash.
    const aged = await initializeTestEnvironment({
      projectId: 'demo-dash-default-rtdb', database: { host: '127.0.0.1', port: 9000 },
    });
    try {
      const code = makeRoomCode();
      await aged.withSecurityRulesDisabled(async ctx => {
        await set(ref(ctx.database(), `rooms/${code}`), {
          meta: { createdAt: Date.now() - ROOM_TTL_MS - 60_000, hostId: 'old-host', creatorId: 'old-host',
                  targetScore: 75, phase: 'lobby', roundNumber: 0, playerCount: 1 },
          players: { 'old-host': { name: 'Old', badgeId: 'tulip', joinedAt: 1, connected: false, score: 0 } },
          badges: { tulip: 'old-host' },
        });
      });
      expect(await joinRoom(code, 'New', 'star')).toEqual({ ok: false, reason: 'expired' });
      await aged.withSecurityRulesDisabled(async ctx => {
        await set(ref(ctx.database(), `rooms/${code}/players/${me}`),
          { name: 'Me', badgeId: 'star', joinedAt: 1, connected: false, score: 0 });
      });
      expect(await joinRoom(code, 'Me', 'star')).toEqual({ ok: true, code });
    } finally {
      await aged.cleanup();
    }
  });
});

// The 8-player cap and badge uniqueness live entirely in database.rules.json,
// so testing them honestly means proving the RULES reject/allow writes - not
// just observing that joinRoom()'s client-side pre-checks do.
//
// CORRECTED (see server-side-limits-report.md, Finding 1 / the correction to
// its old Finding 2): this describe block was originally written believing
// the regular client SDK (firebase/database) could not be used to prove rule
// rejection here at all - "against a demo-* project's local emulator, every
// connection is treated as an owner and bypasses .write/.validate entirely."
// That conclusion was wrong. The real cause was a databaseURL namespace bug
// in src/net/firebase.ts: the app's emulator config pointed at
// `?ns=demo-dash`, a namespace the emulator never loads database.rules.json
// into (so it defaults to fully open), while firebase.json's declared rules
// are only auto-loaded into `demo-dash-default-rtdb`. Every "unauthenticated
// write succeeded" / "invalid write succeeded" probe that led to the old
// conclusion was run against that open, ruleless namespace. Now that
// firebase.ts points at the correct namespace, the regular client SDK DOES
// enforce .write/.validate for real - see the
// 'app writes under real security rules' describe block below, whose first
// test is written specifically as a regression canary for this exact bug.
//
// @firebase/rules-unit-testing's authenticatedContext()/assertFails/
// assertSucceeds remains the right tool for THIS describe block, though: it
// drives the emulator's rules-evaluation endpoint directly and lets each test
// below mutate one rules.json clause at a time and observe exactly one test
// fail (see the report's "how I confirmed each one bites" section) without
// needing a second real signed-in identity for every case. The describe
// block below this one uses real second identities (a second Firebase app +
// signInAnonymously) instead, specifically to prove the app's own code paths
// - not just the rules engine in isolation.
const rulesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database.rules.json');

emu('server-side player cap and badge uniqueness (database.rules.json)', () => {
  const HOST = 'rules-test-host';
  const RACER = 'rules-test-racer';
  let testEnv: RulesTestEnvironment;
  let hostCtx: RulesTestContext;
  let racerCtx: RulesTestContext;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      // Deliberately NOT 'demo-dash' (the app's real projectId/demoConfig,
      // see ./firebase): @firebase/rules-unit-testing's .database() pushes
      // the given `rules` directly into `?ns=<projectId>` (its own source
      // comment says so - "otherwise the RTDB SDK will by default use
      // `${projectId}-default-rtdb`, which is treated as a different DB").
      // Confirmed empirically that this matters: with this projectId set to
      // 'demo-dash', temporarily reverting src/net/firebase.ts's emulator
      // databaseURL to the old buggy `?ns=demo-dash` (the Finding-1 bug)
      // did NOT make the new 'app writes under real security rules' canary
      // test below fail when the full suite ran - because THIS beforeAll,
      // running first in the same file, had already pushed real rules into
      // that exact namespace as a side effect, masking the very bug the
      // canary exists to catch. A dedicated projectId here keeps this
      // describe block's rules-injection completely out of any namespace
      // the app itself (or the tests that drive it as a real client) ever
      // touches, so a regression in EITHER place is caught independently.
      projectId: 'demo-dash-rules-test',
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
      [`players/${HOST}`]: { name: 'Host', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0, ready: true },
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
        name: 'Racer', badgeId: 'clover', joinedAt: Date.now(), connected: true, stuckAt: null, score: 0,
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

  it('lets any player report a lost race without opening up the rest of the round', async () => {
    const code = 'RACEFLAG1';
    await seedRoom(code, 0);
    const db = racerCtx.database();
    // The loser of a race is by definition not the host most of the time, and has
    // to be able to say so - round/races is written by whoever lost.
    await assertSucceeds(db.ref(`rooms/${code}/round/races/3`).set({ by: RACER, at: 1 }));
    // The tally the commentary reads goes in the same write, so it needs the same
    // permission - a rivalry can only be counted if the loser can record it.
    await assertSucceeds(db.ref(`rooms/${code}/round/duels/${RACER}/${HOST}`).set(2));
    // But these are holes in the host-only round node, not a door: a non-host
    // still cannot write the round itself and wipe the board through them.
    await assertFails(db.ref(`rooms/${code}/round`).set({ races: { 3: { by: RACER, at: 1 } } }));
  });

  it('lets only the host write the game-long stats', async () => {
    const code = 'GAMESTATS';
    await seedRoom(code, 0);
    // One writer by design: the host derives them inside commitScores, so anybody
    // else writing here could only be rewriting history.
    await assertSucceeds(hostCtx.database().ref(`rooms/${code}/stats`).set({ rounds: 1, races: 0 }));
    await assertFails(racerCtx.database().ref(`rooms/${code}/stats/rounds`).set(99));
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

  it('createRoom succeeds as ONE atomic write, and claims the badge', async () => {
    // This used to be two sequential writes, and this test used to assert that
    // shape, because the players/$uid .validate read meta/phase and that
    // cross-reference only worked against already-committed data. No rule reads
    // meta/phase any more, so the write is now one multi-path update, and this is
    // what proves that against the rules engine rather than by reading them:
    // hostId and creatorId validate against `root`, which is the PRE-write tree,
    // where this room has no players at all, and that is the branch of their
    // condition that has to carry a create. If a future rule reads across the
    // write again, this goes red before a player ever meets a room that cannot be
    // made. (The regular client SDK cannot prove rule compliance here; see the
    // note above this describe block.)
    const code = 'CREATENEW';
    const db = hostCtx.database();
    await assertSucceeds(db.ref(`rooms/${code}`).update({
      meta: { createdAt: Date.now(), hostId: HOST, creatorId: HOST, targetScore: 75, phase: 'lobby', roundNumber: 0, playerCount: 1 },
      [`players/${HOST}`]: { name: 'Host', badgeId: 'clownfish', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0, ready: true },
      'badges/clownfish': HOST,
    }));
    // and the whole room is there, rather than a meta with nobody in it
    expect((await db.ref(`rooms/${code}/meta/hostId`).get()).val()).toBe(HOST);
    expect((await db.ref(`rooms/${code}/badges/clownfish`).get()).val()).toBe(HOST);

    // Functional regression: the real createRoom() (regular SDK) still
    // produces this same shape end-to-end.
    const { ensureSignedIn, db: realDb } = await import('./firebase');
    await ensureSignedIn();
    const realCode = await createRoom('Solo', 'clownfish');
    const snap = await get(ref(realDb, `rooms/${realCode}`));
    const room = normalizeRoom(snap.val())!;
    expect(room.meta.phase).toBe('lobby');
    expect(room.meta.playerCount).toBe(1);
    expect(Object.keys(room.players)).toHaveLength(1);
    const badgeSnap = await get(ref(realDb, `rooms/${realCode}/badges/clownfish`));
    expect(badgeSnap.val()).toBe(room.meta.hostId);
  });

  it('admits a brand-new player into a game already in progress', async () => {
    // This used to be refused at the rules level: a new player record was
    // lobby-only. A game in progress now takes spectators - they get a record and
    // no hand, watch the board live, and startRound deals them in at the next
    // round. Pinned here because it is a DELIBERATE loosening of the rules and
    // the only thing standing between the feature and a silent refusal is this
    // file being deployed.
    const code = 'MIDGAME';
    await seedRoom(code, 0);
    await assertSucceeds(hostCtx.database().ref(`rooms/${code}/meta/phase`).set('playing'));
    await assertSucceeds(racerCtx.database().ref(`rooms/${code}`).update({
      [`players/${RACER}`]: {
        name: 'Racer', badgeId: 'clover', joinedAt: Date.now(), connected: true, stuckAt: null, score: 0,
      },
      'meta/playerCount': 2,
    }));
  });

  it('still caps the room at 8 mid-game - the seat limit was never the phase gate', async () => {
    // The counter is what enforces the cap, which is why it is tracked rather
    // than counted live. Removing the phase gate must not have loosened it.
    const code = 'MIDGAMEFULL';
    await seedRoom(code, 7); // HOST + seed-0..6 = 8 players
    await assertSucceeds(hostCtx.database().ref(`rooms/${code}/meta/phase`).set('playing'));
    await assertFails(racerCtx.database().ref(`rooms/${code}`).update({
      [`players/${RACER}`]: {
        name: 'Racer', badgeId: 'clover', joinedAt: Date.now(), connected: true, stuckAt: null, score: 0,
      },
      'meta/playerCount': 9,
    }));
  });

  // Task 5 (host-continuity): meta/hostId's new .validate must reject promoting
  // a uid that isn't actually a player in this room, while still allowing a
  // real one - covering both the ordinary claimHost() path (players already
  // exist) and, via the "createRoom still succeeds" test above (meta written
  // before players, same seedRoom/createRoomAs two-step shape this rule must
  // tolerate), the room-creation bootstrap path where no players exist yet.
  it('hostId validate: rejects a uid that is not a player in the room, allows an existing one', async () => {
    const code = 'HOSTVALID';
    await seedRoom(code, 1); // HOST + 'seed-0'
    const db = hostCtx.database();
    await assertFails(db.ref(`rooms/${code}/meta/hostId`).set('not-a-player-in-this-room'));
    await assertSucceeds(db.ref(`rooms/${code}/meta/hostId`).set('seed-0'));
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (server-side-limits-report.md): the app's REAL client path,
// against the REAL namespace, is now the primary evidence that
// database.rules.json actually protects this app - not just that the rules
// engine rejects synthetic writes in isolation (the block above), and not
// just that ordinary app calls "still pass" (open rules would too; see the
// first describe block in this file, none of which asserts a rejection).
//
// Every test below drives ordinary firebase/database client connections -
// no @firebase/rules-unit-testing here - against demo-dash-default-rtdb,
// the exact namespace src/net/firebase.ts now points the emulator config at.
// ---------------------------------------------------------------------------

emu('app writes under real security rules (regular client SDK, correct namespace)', () => {
  const createdApps: FirebaseApp[] = [];

  beforeAll(async () => {
    const { ensureSignedIn } = await import('./firebase');
    await ensureSignedIn();
  });

  afterAll(async () => {
    await Promise.all(createdApps.map(a => deleteApp(a)));
  });

  // A second, genuinely concurrent, genuinely-signed-in identity - needed for
  // every test below - can't be had from the singleton `auth`/`db` in
  // ./firebase (it's always whichever single user that module is currently
  // signed in as). A second Firebase app instance is the standard way to get
  // a second live connection with its own auth session against the same
  // emulator, mirroring two different browser tabs.
  async function secondaryIdentity(name: string): Promise<{ app: FirebaseApp; db: Database; uid: string }> {
    const { demoConfig } = await import('./firebase');
    const app = initializeApp(demoConfig, name);
    const secAuth = getAuth(app);
    connectAuthEmulator(secAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const secDb = getDatabase(app);
    connectDatabaseEmulator(secDb, '127.0.0.1', 9000);
    const uid = (await signInAnonymously(secAuth)).user.uid;
    // Force the new connection's websocket handshake (and auth-token
    // attachment) to finish now, not during the timed race below: a
    // freshly-constructed Database/Auth pair still has to open and
    // authenticate its own socket to the emulator, and racing that
    // cold-start against the primary db (already warm from every earlier
    // operation in this file) isn't a real concurrency test - it's just
    // measuring connection setup time, and the warm side always "wins"
    // regardless of which mechanism either side uses. Confirmed
    // empirically: without this, a debug-logged race consistently showed
    // the fresh secondary identity's read landing AFTER the warm primary
    // identity's entire read+write had already completed. A nonexistent
    // room path is a harmless, always-authorized (`rooms/$code`'s .read is
    // `auth != null`) real round trip - `.info/connected` looked like a
    // cheaper option but get() doesn't support that synthetic path.
    await get(ref(secDb, 'rooms/__warmup__/meta'));
    return { app, db: secDb, uid };
  }

  // Mirrors joinRoom()'s real logic (src/net/rooms.ts) - including its
  // branch between a brand-new join (players/$uid + badges/$badgeId +
  // meta/playerCount via increment(1), all one atomic update) and a rejoin
  // (connected:true only) - against an explicit Database handle instead of
  // the singleton primary one. joinRoom() itself is bound to ./firebase's
  // module-level db/auth, so it can only ever act as whichever single uid
  // that module is currently signed in as; it cannot be called "as" a second
  // concurrent identity, which every race test below needs. This sends the
  // exact writes joinRoom() sends, just addressed at a different connection.
  async function joinAs(
    database: Database, code: string, uid: string, name: string, badgeId: BadgeId,
  ): Promise<'ok' | 'rejected'> {
    const snap = await get(ref(database, `rooms/${code}`));
    const room = normalizeRoom(snap.val());
    const rejoining = !!room && uid in room.players;
    try {
      if (rejoining) {
        await update(ref(database, `rooms/${code}/players/${uid}`), { connected: true });
      } else {
        await update(ref(database, `rooms/${code}`), {
          [`players/${uid}`]: { name, badgeId, joinedAt: Date.now(), connected: true, stuckAt: null, awayAt: null, score: 0, ready: true },
          [`badges/${badgeId}`]: uid,
          'meta/playerCount': increment(1),
        });
      }
      return 'ok';
    } catch {
      return 'rejected';
    }
  }

  // Mirrors createRoom()'s real two-step write (meta first via set(), then
  // players+badges via update() - see src/net/rooms.ts and the report's
  // Finding 3 on why the order matters) against an explicit Database handle,
  // for the same reason joinAs() exists: createRoom() is bound to the
  // singleton primary db/auth. Used below only to seat a THIRD identity as
  // room owner, freeing the primary identity to be a genuine racer through
  // the real, exported joinRoom() instead of always being "the host."
  async function createRoomAs(
    database: Database, uid: string, name: string, badgeId: BadgeId,
  ): Promise<string> {
    const code = makeRoomCode();
    await set(ref(database, `rooms/${code}/meta`), {
      createdAt: Date.now(), hostId: uid, targetScore: 75, phase: 'lobby', roundNumber: 0, playerCount: 1,
    });
    await update(ref(database, `rooms/${code}`), {
      [`players/${uid}`]: { name, badgeId, joinedAt: Date.now(), connected: true, stuckAt: null, awayAt: null, score: 0, ready: true },
      [`badges/${badgeId}`]: uid,
    });
    return code;
  }

  it('a player can mark themselves away, and cannot mark anybody else away', async () => {
    // The away fix claims it needs no rules change, on the strength of
    // players/$uid already being writable by its owner. That is a claim about
    // database.rules.json, so it is checked against the real rules here.
    const code = await createRoom('Host', 'tulip');
    const hostUid = (await peekRoom(code))!.meta.hostId;

    const p2 = await secondaryIdentity('away-p2');
    createdApps.push(p2.app);
    expect(await joinAs(p2.db, code, p2.uid, 'P2', 'clover')).toBe('ok');

    await set(ref(p2.db, `rooms/${code}/players/${p2.uid}/awayAt`), Date.now());
    expect((await peekRoom(code))!.players[p2.uid].awayAt).not.toBeNull();

    let rejected = false;
    try {
      await set(ref(p2.db, `rooms/${code}/players/${hostUid}/awayAt`), Date.now());
    } catch { rejected = true; }
    expect(rejected, 'a non-host wrote another player\'s awayAt').toBe(true);
  });

  it('a lobby badge swap releases the old badge, and a taken one is refused whole', async () => {
    // setIdentity claims this needs no rules change either: the CLAIM is allowed
    // by badges/$badgeId's validate against a free badge, and the RELEASE is
    // allowed because RTDB does not run validate rules on a delete and that
    // node's .write is only `auth != null`. Both halves are claims about
    // database.rules.json, so both are checked against the real rules here.
    const code = await createRoom('Dave', 'tulip');
    const dave = (await peekRoom(code))!.meta.hostId;

    // A second, genuinely different identity holding 'boat' - it has to be a
    // different uid, because a badge claimed under MY uid is one I am allowed to
    // re-claim and the refusal below would not be a refusal at all.
    const p2 = await secondaryIdentity('swap-p2');
    createdApps.push(p2.app);
    expect(await joinAs(p2.db, code, p2.uid, 'Sam', 'boat')).toBe('ok');

    await setIdentity(code, dave, 'Davey', 'anchor', 'tulip');
    const swapped = (await peekRoom(code))!;
    expect(swapped.players[dave].name).toBe('Davey');
    expect(swapped.players[dave].badgeId).toBe('anchor');
    const { db } = await import('./firebase');
    const badges = (await get(ref(db, `rooms/${code}/badges`))).val() as Record<string, string>;
    expect(badges.anchor).toBe(dave);
    expect(badges.tulip, 'the old badge is still claimed, so nobody else can take it').toBeUndefined();

    // Sam's badge is refused - and because the write is atomic, the name that
    // travelled with it does not land either. Half a swap would be worse than
    // none: a player left with a name they did not keep and a badge they lost.
    let rejected = false;
    try {
      await setIdentity(code, dave, 'Nope', 'boat', 'anchor');
    } catch { rejected = true; }
    expect(rejected, 'a player took a badge somebody else was wearing').toBe(true);
    const after = (await peekRoom(code))!;
    expect(after.players[dave].name).toBe('Davey');
    expect(after.players[dave].badgeId).toBe('anchor');
    expect(after.players[p2.uid].badgeId).toBe('boat');
  });

  it('CANARY: a non-host cannot write another player\'s round/tableaus - proves rules are ON in this namespace', async () => {
    const code = await createRoom('Host', 'tulip');
    const hostRoom = (await peekRoom(code))!;
    const hostUid = hostRoom.meta.hostId;

    const p2 = await secondaryIdentity('canary-p2');
    createdApps.push(p2.app);
    expect(await joinAs(p2.db, code, p2.uid, 'P2', 'clover')).toBe('ok');

    // Real host-only round write (the other thing Finding 1 asked to check
    // carefully) - must still succeed under real rules for this test to mean
    // anything beyond "writes are rejected."
    const room = (await peekRoom(code))!;
    await startRound(code, room);

    let rejected = false;
    try {
      await set(ref(p2.db, `rooms/${code}/round/tableaus/${hostUid}`), {
        dash: [], post: [[], [], []], wood: [], woodIndex: 0,
      });
    } catch {
      rejected = true;
    }
    expect(
      rejected,
      'A non-host, non-owner write to round/tableaus/<hostUid> SUCCEEDED through the ' +
      'ordinary client SDK. Either database.rules.json stopped protecting this path, or ' +
      "- the exact Finding-1 bug - the app's emulator databaseURL " +
      "(src/net/firebase.ts) is no longer pointed at the namespace database.rules.json " +
      'is actually loaded into (?ns=demo-dash-default-rtdb).',
    ).toBe(true);
  });

  it('genuine cap race: two distinct identities racing for the 8th seat - exactly one wins, playerCount lands on 8', async () => {
    // Room owner is a THIRD identity (not primary), specifically so racer A
    // below can be the primary identity going through the REAL, exported
    // joinRoom() - not just joinAs()'s mirror - as a genuine new joiner
    // rather than the room's own host. That matters here more than in the
    // other tests in this block: this is the one race that Finding 2's fix
    // in src/net/rooms.ts (the increment() sentinel) exists to close, so
    // this test should exercise that real code, not only its mirror.
    const owner = await secondaryIdentity('cap-owner');
    createdApps.push(owner.app);
    const code = await createRoomAs(owner.db, owner.uid, 'Owner', 'tulip');
    // Top up to MAX_PLAYERS - 1 total (owner + placeholders), through the
    // real client SDK, as the owner/host - who has write access to any
    // players/$uid. Each write is the exact players/$uid +
    // meta/playerCount(increment(1)) shape a real join sends; badges/* is
    // deliberately left untouched for these placeholders (only 8 badges
    // exist total, and this test needs 2 spare ones for the actual racers
    // below - the badge race is covered by its own, separate test).
    for (let i = 0; i < MAX_PLAYERS - 2; i++) {
      await update(ref(owner.db, `rooms/${code}`), {
        [`players/seed-${i}`]: {
          name: `Seed${i}`, badgeId: 'star', joinedAt: i, connected: true, stuckAt: null, score: 0,
        },
        'meta/playerCount': increment(1),
      });
    }
    const before = (await peekRoom(code))!;
    expect(Object.keys(before.players)).toHaveLength(MAX_PLAYERS - 1);
    expect(before.meta.playerCount).toBe(MAX_PLAYERS - 1);

    const racerB = await secondaryIdentity('cap-racer-b');
    createdApps.push(racerB.app);

    const [realResA, resB] = await Promise.all([
      joinRoom(code, 'RacerA', 'anchor'),                      // the real, exported function
      joinAs(racerB.db, code, racerB.uid, 'RacerB', 'acorn'),  // distinct badge: isolates the
    ]);                                                         // cap from badge uniqueness
    // Not asserting *which* JoinResult.reason the loser gets: depending on
    // exact timing, joinRoom()'s pre-check can itself observe the room
    // already full (reason 'full') just as validly as the rules rejecting
    // its update() (reason 'race') - both are the client correctly
    // reporting "you didn't get a seat," which is the property under test.
    const results: Array<'ok' | 'rejected'> = [realResA.ok ? 'ok' : 'rejected', resB];
    expect(results.filter(r => r === 'ok')).toHaveLength(1);
    expect(results.filter(r => r === 'rejected')).toHaveLength(1);

    const after = (await peekRoom(code))!;
    expect(Object.keys(after.players)).toHaveLength(MAX_PLAYERS);
    expect(after.meta.playerCount).toBe(MAX_PLAYERS);
  });

  it('badge race: two distinct identities claiming the same badge - exactly one wins', async () => {
    // Deliberately NOT routed through the real joinRoom() the way the cap
    // race above is: joinRoom()'s badge-taken pre-check is a stale client
    // read, and empirically (confirmed while building this test, with
    // logging) the primary connection's read+write consistently completes
    // fast enough that the OTHER racer's pre-check - not database.rules.json
    // - ends up deciding the winner, which would mean this test was
    // actually exercising joinRoom()'s client-side shortcut instead of the
    // rule it's meant to prove. joinAs() has no such pre-check for a new
    // badge claim - it always attempts the write and lets the server
    // decide - so using it for BOTH sides guarantees database.rules.json's
    // badges/$badgeId validate (specifically its
    // "!data.exists() || data.val() === auth.uid" clause) is the only thing
    // that can produce the rejection, regardless of which side is faster.
    const code = await createRoom('Host', 'tulip'); // plenty of cap headroom: isolates badge uniqueness

    const claimantA = await secondaryIdentity('badge-racer-a');
    const claimantB = await secondaryIdentity('badge-racer-b');
    createdApps.push(claimantA.app, claimantB.app);

    const [resA, resB] = await Promise.all([
      joinAs(claimantA.db, code, claimantA.uid, 'ClaimA', 'bell'),
      joinAs(claimantB.db, code, claimantB.uid, 'ClaimB', 'bell'), // same badge as A
    ]);
    const results: Array<'ok' | 'rejected'> = [resA, resB];
    expect(results.filter(r => r === 'ok')).toHaveLength(1);
    expect(results.filter(r => r === 'rejected')).toHaveLength(1);

    const { db: primaryDb } = await import('./firebase');
    const winnerUid = resA === 'ok' ? claimantA.uid : claimantB.uid;
    const badgeSnap = await get(ref(primaryDb, `rooms/${code}/badges/bell`));
    expect(badgeSnap.val()).toBe(winnerUid);

    const room = (await peekRoom(code))!;
    expect(Object.keys(room.players)).toHaveLength(2); // host + exactly one claimant
  });

  it('happy path: createRoom -> joinRoom (second identity) -> rejoin, all succeed end-to-end under real rules', async () => {
    const code = await createRoom('Host', 'tulip');
    const p2 = await secondaryIdentity('happy-p2');
    createdApps.push(p2.app);

    expect(await joinAs(p2.db, code, p2.uid, 'P2', 'clover')).toBe('ok');
    let room = (await peekRoom(code))!;
    expect(Object.keys(room.players)).toHaveLength(2);
    expect(room.meta.playerCount).toBe(2);

    // Rejoin: same secondary uid, already a member - must still succeed, and
    // must NOT bump playerCount again (this exercises the data.exists()
    // branch of players/$uid's validate, and the auth.uid === $uid branch of
    // its .write, for a real NON-host uid, not the room's creator).
    expect(await joinAs(p2.db, code, p2.uid, 'P2 renamed', 'clover')).toBe('ok');
    room = (await peekRoom(code))!;
    expect(Object.keys(room.players)).toHaveLength(2);
    expect(room.meta.playerCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// The audit's validation rules (2026-09-03). The rules used to bound WHO may
// write each path and never WHAT: a player's own record took any badgeId, any
// type in any field, and every one of those was a crash for every client in the
// room, because the render sites indexed BADGES with it or handed an object to
// React as a child. The client reads defensively now (badgeFor, isCard, the
// counts in normalizeRoom); these rules refuse the writes at the door as well.
// Every bound below is pinned by one refused write and, where the shape matters,
// one accepted one. Leaf validates only: no $other, no hasChildren on
// containers, no cross-path reads of the write itself - the structural tier is
// written out in docs/audit-2026-09-03.md and waits on a production probe.
// ---------------------------------------------------------------------------
emu('validation rules bound what a client may store (database.rules.json)', () => {
  const HOST = 'val-host';
  const OTHER = 'val-other';
  let testEnv: RulesTestEnvironment;
  let hostCtx: RulesTestContext;
  let otherCtx: RulesTestContext;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      // Its own namespace, for the reason the block above gives for its own.
      projectId: 'demo-dash-validate-test',
      database: { host: '127.0.0.1', port: 9000, rules: readFileSync(rulesPath, 'utf8') },
    });
    hostCtx = testEnv.authenticatedContext(HOST);
    otherCtx = testEnv.authenticatedContext(OTHER);
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  const player = (name: string, badgeId = 'star') =>
    ({ name, badgeId, joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0 });
  const card = (v: number, suit: string, owner: string) => ({ v, suit, owner });

  /** A two-player room the way createRoom and joinRoom leave one. */
  async function room(code: string): Promise<void> {
    const db = hostCtx.database();
    await assertSucceeds(db.ref(`rooms/${code}/meta`).set({
      createdAt: Date.now(), hostId: HOST, creatorId: HOST, targetScore: 75, phase: 'lobby', roundNumber: 0, playerCount: 1,
    }));
    await assertSucceeds(db.ref(`rooms/${code}`).update({
      [`players/${HOST}`]: player('Host', 'tulip'), 'badges/tulip': HOST,
    }));
    await assertSucceeds(otherCtx.database().ref(`rooms/${code}`).update({
      [`players/${OTHER}`]: player('Other', 'clover'), 'badges/clover': OTHER, 'meta/playerCount': 2,
    }));
  }

  it('a badge that does not exist is refused on a player record, and a retired one is not', async () => {
    const code = 'VALBADGE';
    await room(code);
    const mine = otherCtx.database().ref(`rooms/${code}/players/${OTHER}/badgeId`);
    await assertFails(mine.set('not-a-badge'));
    await assertFails(mine.set(7));
    await assertSucceeds(mine.set('kite')); // retired, still drawable: a room may still hold one
    await assertFails(otherCtx.database().ref(`rooms/${code}/badges/zzz-not-a-badge`).set(OTHER));
  });

  it('createdAt is written once, by the room\'s first write, and never again', async () => {
    // One write of 0 by anyone holding the code used to make every join and every
    // rejoin say the room had expired for as long as it stood. room() above is
    // the proof that a fresh room's createdAt is accepted.
    const code = 'VALBORN';
    await room(code);
    await assertFails(otherCtx.database().ref(`rooms/${code}/meta/createdAt`).set(0));
    await assertFails(hostCtx.database().ref(`rooms/${code}/meta/createdAt`).set(Date.now()));
    await assertFails(otherCtx.database().ref(`rooms/${code}/meta/createdAt`).set('yesterday'));
  });

  it('a name is a string of at most 32 characters, and the numbers are numbers', async () => {
    const code = 'VALTYPES';
    await room(code);
    const me = otherCtx.database().ref(`rooms/${code}/players/${OTHER}`);
    await assertFails(me.child('name').set('n'.repeat(33)));
    await assertFails(me.child('name').set({ evil: 1 }));
    await assertFails(me.child('name').set(''));
    await assertSucceeds(me.child('name').set('A perfectly fine name'));
    await assertFails(me.child('score').set('twelve'));
    await assertFails(me.child('joinedAt').set('yesterday'));
    await assertFails(me.child('connected').set('yes'));
    await assertSucceeds(me.child('score').set(-4));
  });

  it('a human cannot become a bot, and a bot level is one of the four', async () => {
    const code = 'VALBOT';
    await room(code);
    const me = otherCtx.database().ref(`rooms/${code}/players/${OTHER}`);
    await assertFails(me.child('isBot').set(true));          // the uid does not start with bot_
    await assertFails(me.child('botLevel').set('impossible'));
    const bot = hostCtx.database().ref(`rooms/${code}/players/bot_bell`);
    await assertSucceeds(bot.set({ ...player('Ada', 'bell'), ready: true, isBot: true, botLevel: 'hard' }));
    await assertFails(bot.child('botLevel').set('lol'));
  });

  it('host and creator can only be a human who is in the room', async () => {
    const code = 'VALHOST';
    await room(code);
    await assertSucceeds(hostCtx.database().ref(`rooms/${code}/players/bot_bell`)
      .set({ ...player('Ada', 'bell'), ready: true, isBot: true, botLevel: 'hard' }));
    const meta = otherCtx.database().ref(`rooms/${code}/meta`);
    await assertFails(meta.child('hostId').set('bot_bell'));
    await assertFails(meta.child('hostId').set({ deep: 1 }));
    await assertFails(meta.child('creatorId').set('a-stranger'));
    await assertFails(meta.child('creatorId').set('bot_bell'));
    await assertSucceeds(meta.child('hostId').set(OTHER));
    await assertSucceeds(meta.child('creatorId').set(OTHER));
  });

  it('the phase is a phase and the meta numbers are numbers in range', async () => {
    const code = 'VALMETA';
    await room(code);
    const meta = otherCtx.database().ref(`rooms/${code}/meta`);
    await assertFails(meta.child('phase').set('nonsense'));
    await assertFails(meta.child('targetScore').set('abc'));
    await assertFails(meta.child('targetScore').set(0));
    await assertFails(meta.child('roundNumber').set({ a: 1 }));
    await assertFails(meta.child('countdown').set(1e12));
    await assertFails(meta.child('countdown').set('GO'));
    await assertFails(meta.child('hintsOn').set('on'));
    await assertSucceeds(meta.child('phase').set('playing'));
    await assertSucceeds(meta.child('targetScore').set(100));
    await assertSucceeds(meta.child('countdown').set(3));
    await assertSucceeds(meta.child('countdown').set(null)); // a delete is never validated
  });

  it('the board is dealt at a size a deal can produce', async () => {
    const code = 'VALCOUNT';
    await room(code);
    const round = hostCtx.database().ref(`rooms/${code}/round`);
    await assertFails(round.child('spaceCount').set(1e9));
    await assertFails(round.child('spaceCount').set(0));
    await assertFails(round.child('spaceCount').set('lots'));
    await assertFails(round.child('postCount').set(4));
    await assertSucceeds(round.child('spaceCount').set(16));
    await assertSucceeds(round.child('postCount').set(5));
    await assertFails(round.child('seats/9').set(HOST));
    await assertSucceeds(round.child('seats/0').set(HOST));
  });

  it('scores and startedAt are the host\'s alone now; stuckRounds stays open but numeric', async () => {
    // A stranger could pre-write round/scores, and commitScores, which is
    // idempotent on scores existing, would then never run: totals frozen for
    // the rest of the game with no error anywhere. Only the host ever wrote it.
    const code = 'VALSCORE';
    await room(code);
    const other = otherCtx.database().ref(`rooms/${code}/round`);
    await assertFails(other.child('scores').set({ [HOST]: { centerCount: 0, dashLeft: 10, delta: -20 } }));
    await assertFails(other.child('startedAt').set(1));
    await assertFails(other.child('stuckRounds').set('x'));
    await assertSucceeds(other.child('stuckRounds').set(1));
    const host = hostCtx.database().ref(`rooms/${code}/round`);
    await assertSucceeds(host.child('scores').set({ [HOST]: { centerCount: 3, dashLeft: 2, delta: -1 } }));
    await assertFails(host.child('scores').set({ [HOST]: { centerCount: 'three' } }));
    await assertSucceeds(host.child('startedAt').set(Date.now()));
  });

  it('only cards go in a centre space, and only on a space the board has', async () => {
    const code = 'VALSPACE';
    await room(code);
    const spaces = otherCtx.database().ref(`rooms/${code}/round/spaces`);
    await assertFails(spaces.child('0/stack').set([true]));
    await assertFails(spaces.child('0/stack').set([{ v: 1, suit: 'red' }]));           // no owner
    await assertFails(spaces.child('0/stack').set([card(11, 'red', OTHER)]));          // no such card
    await assertFails(spaces.child('0/stack').set([card(1, 'plaid', OTHER)]));
    await assertFails(spaces.child('0/history').set([7]));
    await assertFails(spaces.child('0/suit').set('purple'));
    await assertFails(spaces.child('999').set({ stack: [card(1, 'red', OTHER)] }));
    await assertSucceeds(spaces.child('0').set({ stack: [card(1, 'red', OTHER)], history: [[card(1, 'blue', HOST)]] }));
  });

  it('a hand holds only its owner\'s cards, and the wood index stays in the pile', async () => {
    const code = 'VALHAND';
    await room(code);
    const mine = otherCtx.database().ref(`rooms/${code}/round/tableaus/${OTHER}`);
    await assertFails(mine.set({ dash: [card(1, 'red', HOST)], post: [[]], wood: [], woodIndex: 0 }));
    await assertFails(mine.set({ dash: ['junk'], woodIndex: 0 }));
    await assertFails(mine.set({ dash: [card(1, 'red', OTHER)], woodIndex: 99 }));
    await assertFails(mine.set({ dash: [card(1, 'red', OTHER)], post: { 7: [card(2, 'red', OTHER)] }, woodIndex: 0 }));
    await assertSucceeds(mine.set({
      dash: [card(1, 'red', OTHER)], post: [[card(2, 'blue', OTHER)], [], []],
      wood: [card(3, 'green', OTHER), card(4, 'yellow', OTHER)], woodIndex: 2,
    }));
  });

  it('a race record and a duel tally keep their shape', async () => {
    const code = 'VALRACE';
    await room(code);
    const round = otherCtx.database().ref(`rooms/${code}/round`);
    await assertFails(round.child('races/3').set('me'));
    await assertFails(round.child('races/3').set({ by: OTHER }));                        // no nonce
    await assertFails(round.child('races/99').set({ by: OTHER, at: 1 }));
    await assertSucceeds(round.child('races/3').set({ by: OTHER, at: 1 }));
    await assertFails(round.child(`duels/${OTHER}/${HOST}`).set('two'));
    await assertFails(round.child(`duels/${OTHER}/${HOST}`).set(-1));
    await assertSucceeds(round.child(`duels/${OTHER}/${HOST}`).set(2));
    await assertFails(round.child('dashedBy').set({ uid: OTHER }));
    await assertSucceeds(round.child('dashedBy').set(OTHER));
  });
});

emu('the resume path threads the room it already read', () => {
  it('rejoins on a room passed in, and leaves the player record as it stands', async () => {
    // The saving this exists for: entry used to download the same room three
    // times, 47,373 bytes measured, because `peekRoom` and `joinRoom` share no
    // cache. `Join.tsx` peeks to decide whether this device is already a member,
    // and hands that same object on rather than paying for it twice.
    const code = await createRoom('Host', 'tulip');
    const { db, ensureSignedIn } = await import('./firebase');
    const uid = await ensureSignedIn();
    const peeked = await peekRoom(code);
    expect(peeked!.players[uid]).toBeTruthy(); // this is what puts Join.tsx on the resume path

    const res = await joinRoom(code, 'Host', 'tulip', peeked!);
    expect(res).toEqual({ ok: true, code });
    // The rejoin branch touches `connected` and nothing else: a resume must not
    // rewrite the name and badge the player already owns.
    const mine = (await get(ref(db, `rooms/${code}/players/${uid}`))).val();
    expect(mine.name).toBe('Host');
    expect(mine.badgeId).toBe('tulip');
  });

  it('TRUSTS what it is handed, which is why only the resume path may hand it anything', async () => {
    // The decisive proof that the second read is gone rather than merely cheaper:
    // the same call against a code that does not exist answers differently
    // depending only on whether a room came with it. Nothing else can explain
    // that, because the code is the only thing the server could be asked about.
    //
    // It is also the cost of the trade, stated where somebody will find it. The
    // room is believed without being checked, so a membership that has since gone
    // away - a player the host removed between the peek and the join - is still
    // believed for that window. The resume path's window is one await. The form
    // path's is however long it takes to type a name and pick a badge, which is
    // why it passes nothing and pays for its own read.
    const { ensureSignedIn } = await import('./firebase');
    const uid = await ensureSignedIn();
    const absent = makeRoomCode();

    expect(await joinRoom(absent, 'Ghost', 'star')).toEqual({ ok: false, reason: 'not-found' });

    const asIfMember = normalizeRoom({
      meta: { createdAt: Date.now(), hostId: uid, creatorId: uid, targetScore: 75, phase: 'lobby', roundNumber: 0 },
      players: { [uid]: { name: 'Ghost', badgeId: 'star', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0 } },
      round: null,
    })!;
    expect(await joinRoom(absent, 'Ghost', 'star', asIfMember)).toEqual({ ok: true, code: absent });
  });
});
