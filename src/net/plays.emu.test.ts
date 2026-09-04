/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { createRoom, normalizeRoom, setOrderly, setSittingOut } from './rooms';
import { commitScores, nextRound, playToCenter, startRound } from './plays';
import { get, onValue, ref, update } from 'firebase/database';
import type { Card, CenterSpace, Room, Suit } from '../game/types';

const emu = describe.runIf(process.env.EMULATOR === '1');

emu('center transactions against emulator', () => {
  it('exactly one of two same-card racers wins a space', async () => {
    const code = await createRoom('Host', 'tulip');
    const { db, ensureSignedIn } = await import('./firebase');
    const uid = await ensureSignedIn();
    const room: Room = {
      meta: { createdAt: Date.now(), hostId: uid, creatorId: uid, targetScore: 75, phase: 'lobby', roundNumber: 0 },
      players: { [uid]: { name: 'Host', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0, ready: true } },
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

emu('orderly grid against emulator', () => {
  it('the centre transaction refuses a wrong-colour card on a suit-locked space', async () => {
    // The client already declines to offer the move (canPlayToSpace), but the
    // client is not what is trusted. This is the write actually reaching the
    // database and being turned away by the space's own suit.
    const code = await createRoom('Host', 'tulip');
    const { db, ensureSignedIn } = await import('./firebase');
    const uid = await ensureSignedIn();
    await setOrderly(code, true);
    const room: Room = {
      meta: { createdAt: Date.now(), hostId: uid, creatorId: uid, targetScore: 75,
              phase: 'lobby', roundNumber: 0, orderlyGrid: true },
      players: { [uid]: { name: 'Host', badgeId: 'tulip', joinedAt: 1, connected: true,
                          stuckAt: null, awayAt: null, score: 0 } },
      round: null,
    };
    await startRound(code, room);
    // One player: 4 spaces, 4 columns, so space 0 belongs to red and space 1 to blue.
    const snap = await get(ref(db, `rooms/${code}/round/spaces/0`));
    expect(snap.val().suit).toBe('red');

    expect((await playToCenter(code, 0, { v: 1, suit: 'blue', owner: uid })).committed).toBe(false);
    expect((await playToCenter(code, 0, { v: 1, suit: 'red', owner: uid })).committed).toBe(true);
    // and the constraint is still there afterwards, rather than spread away by the write
    expect((await get(ref(db, `rooms/${code}/round/spaces/0`))).val().suit).toBe('red');
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
                               connected: true, stuckAt: null, awayAt: null, score: 0, ready: true } };
    await startRound(code, { meta: { ...meta, phase: 'lobby' }, players, round: null });
    await update(ref(db, `rooms/${code}/meta`), { phase: 'roundEnd' }); // the dash landed

    // n cards of mine sitting in the centre, nothing left in my Dash pile:
    // delta is exactly n (+1 each, no -2 penalty).
    const suits: Suit[] = ['red', 'blue', 'green', 'yellow'];
    const mine: Card[] = Array.from({ length: centerCards }, (_, i) =>
      ({ v: (i % 10) + 1, suit: suits[Math.floor(i / 10) % 4], owner: uid }));
    const spaces: CenterSpace[] = Array.from({ length: 16 }, (_, i) =>
      ({ stack: i === 0 ? mine : [], history: [] }));
    const room: Room = {
      meta, players,
      round: { spaces, tableaus: { [uid]: { dash: [], post: [[], [], []], wood: [], woodIndex: 0 } },
               dashedBy: uid, scores: null, races: null, duels: null, endedAt: null, stuckRounds: 0, startedAt: 1 },
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
  // Replays that exact board: Dave dashes for +24, the other player is left
  // holding all ten Dash cards for -20, and the target is 25. The report was
  // "the game ended at 24" - so this asserts both halves: the game must NOT end
  // one short of the target, and "Next round" must actually deal the next round.
  it('scores 24/-12, keeps playing, and deals round 2', async () => {
    const code = await createRoom('Dave', 'boat');
    const { db, ensureSignedIn } = await import('./firebase');
    const dave = await ensureSignedIn();
    const other = 'other-player-uid';
    await update(ref(db, `rooms/${code}`), {
      [`players/${other}`]: { name: 'sonofwatt', badgeId: 'anchor', joinedAt: 2,
                              connected: true, stuckAt: null, awayAt: null, score: 0, ready: true },
      'meta/targetScore': 25,
    });

    const players = {
      [dave]: { name: 'Dave', badgeId: 'boat' as const, joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0, ready: true },
      [other]: { name: 'sonofwatt', badgeId: 'anchor' as const, joinedAt: 2, connected: true, stuckAt: null, awayAt: null, score: 0, ready: true },
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
          [dave]: { dash: [], post: [[], [], [], [], []], wood: [], woodIndex: 0 },
          [other]: { dash: owned(other, 10, 8), post: [[], [], [], [], []], wood: [], woodIndex: 0 },
        },
        dashedBy: dave, scores: null, races: null, duels: null, endedAt: null, stuckRounds: 0, startedAt: 1,
      },
    };

    await commitScores(code, room);
    const afterScoring = normalizeRoom((await get(ref(db, `rooms/${code}`))).val())!;
    expect(afterScoring.players[dave].score).toBe(24);
    expect(afterScoring.players[other].score).toBe(-12);
    expect(afterScoring.meta.phase).toBe('roundEnd'); // 24 does not clear a target of 25

    // startRound clears `ready`, and it deals a HAND only to players who have
    // one set - which is what leaves an unready player behind on a forced start.
    // Between rounds the score sheet's own ready gate is what puts it back; here
    // that is done by hand.
    await update(ref(db, `rooms/${code}`), {
      [`players/${dave}/ready`]: true, [`players/${other}/ready`]: true,
    });
    const readied = normalizeRoom((await get(ref(db, `rooms/${code}`))).val())!;
    await nextRound(code, readied);
    const afterNext = normalizeRoom((await get(ref(db, `rooms/${code}`))).val())!;
    expect(afterNext.meta.phase).toBe('playing');
    expect(afterNext.meta.roundNumber).toBe(afterScoring.meta.roundNumber + 1);
    expect(afterNext.round!.dashedBy).toBeNull();
    expect(afterNext.round!.scores).toBeNull();
    expect(afterNext.round!.spaces.every(sp => sp.stack.length === 0)).toBe(true);
    // both players dealt a fresh 2-player tableau: 10 dash, 5 posts, 25 wood
    for (const uid of [dave, other]) {
      const t = afterNext.round!.tableaus[uid];
      expect(t.dash).toHaveLength(10);
      expect(t.post).toHaveLength(5);
      expect(t.wood).toHaveLength(25);
    }
    expect(afterNext.players[dave].score).toBe(24); // totals carry into round 2
  });
});

emu('the score commit does not ride on the stats write', () => {
  // The 2026-08-27 playtest fault. `stats` gained its own .write grant in
  // a93e7d2; the live database was still running rules from before it. Stats went
  // in the SAME multi-path update as the scores, a multi-path update is atomic,
  // so one denied decoration rejected the round's scores AND every player's
  // total. The host saw a sheet regardless (RTDB shows a write locally before the
  // server answers it) and nobody else saw one at all.
  //
  // The fix is that they are two writes, scores first. This proves it from the
  // outside: there must be a moment where the scores are committed and the stats
  // are not, which cannot happen if the two are one write.
  it('commits the scores in a write of their own, before the stats', async () => {
    const code = await createRoom('Host', 'tulip');
    const { db, ensureSignedIn } = await import('./firebase');
    const uid = await ensureSignedIn();
    const players = { [uid]: { name: 'Host', badgeId: 'tulip' as const, joinedAt: 1,
                               connected: true, stuckAt: null, awayAt: null, score: 0, ready: true } };
    const meta = { createdAt: Date.now(), hostId: uid, creatorId: uid, targetScore: 75,
                   phase: 'roundEnd' as const, roundNumber: 1 };
    await startRound(code, { meta: { ...meta, phase: 'lobby' }, players, round: null });
    await update(ref(db, `rooms/${code}/meta`), { phase: 'roundEnd' });

    const seen: { scores: boolean; stats: boolean }[] = [];
    const off = onValue(ref(db, `rooms/${code}`), snap => {
      const v = (snap.val() ?? {}) as { round?: { scores?: unknown }; stats?: unknown };
      seen.push({ scores: v.round?.scores != null, stats: v.stats != null });
    });

    const room: Room = {
      meta, players,
      round: { spaces: Array.from({ length: 16 }, () => ({ stack: [] as Card[], history: [] as Card[][] })),
               tableaus: { [uid]: { dash: [], post: [[], [], []], wood: [], woodIndex: 0 } },
               dashedBy: uid, scores: null, races: null, duels: null, endedAt: null,
               stuckRounds: 0, startedAt: 1 },
    };
    await commitScores(code, room);
    off();

    expect(seen.some(v => v.scores && !v.stats), 'scores and stats landed as one write').toBe(true);
    const written = (await get(ref(db, `rooms/${code}`))).val() as { stats?: unknown };
    expect(written.stats, 'the stats still get written, just separately').not.toBeNull();
  });
});

emu('sitting out leaves the round in progress', () => {
  // The claim worth checking against the real rules rather than reasoning about:
  // that a round played without somebody moves their total NOT AT ALL, while
  // their hand is still sitting there for them to come back to. The hand is kept
  // on purpose - re-dealing one would mint duplicates of the cards they already
  // have in the middle, same owner, same cardId, playable twice.
  it('keeps the hand, and the round scores without them', async () => {
    const code = await createRoom('Dave', 'tulip');
    const { db, ensureSignedIn } = await import('./firebase');
    const dave = await ensureSignedIn();
    const other = 'other-player-uid';
    // Real totals, IN THE DATABASE - commitScores reads the room it is given, and
    // a fixture that only claims a score in memory proves nothing about it.
    await update(ref(db, `rooms/${code}`), {
      [`players/${other}`]: { name: 'Sam', badgeId: 'anchor', joinedAt: 2, connected: true,
                              stuckAt: null, awayAt: null, score: 5, ready: true },
      [`players/${dave}/score`]: 12,
    });
    const players = {
      [dave]: { name: 'Dave', badgeId: 'tulip' as const, joinedAt: 1, connected: true,
                stuckAt: null, awayAt: null, score: 12, ready: true },
      [other]: { name: 'Sam', badgeId: 'anchor' as const, joinedAt: 2, connected: true,
                 stuckAt: null, awayAt: null, score: 5, ready: true },
    };
    const meta = { createdAt: Date.now(), hostId: dave, creatorId: dave, targetScore: 75,
                   phase: 'lobby' as const, roundNumber: 1 };
    await startRound(code, { meta, players, round: null });
    expect(Object.keys((await normalizeRoom((await get(ref(db, `rooms/${code}`))).val()))!.round!.tableaus))
      .toHaveLength(2);

    // Dave walks away mid-round. His own client writes it, no host involved.
    await setSittingOut(code, dave, true);
    const mid = normalizeRoom((await get(ref(db, `rooms/${code}`))).val())!;
    expect(Object.keys(mid.round!.tableaus).sort(), 'the hand is still there to come back to')
      .toEqual([dave, other].sort());
    expect(mid.players[dave].sittingOut).toBe(true);
    expect(mid.players[dave].ready ?? null, 'ready cleared with it').toBeNull();

    // ...and he can step straight back into the round he left.
    await setSittingOut(code, dave, false);
    const back = normalizeRoom((await get(ref(db, `rooms/${code}`))).val())!;
    expect(back.players[dave].sittingOut ?? null).toBeNull();
    expect(back.round!.tableaus[dave], 'the same hand, not a fresh deal')
      .toEqual(mid.round!.tableaus[dave]);
    await setSittingOut(code, dave, true);   // out again for the scoring below

    // Sam dashes; the round is scored.
    await update(ref(db, `rooms/${code}`), { 'round/dashedBy': other, 'meta/phase': 'roundEnd' });
    const atEnd = normalizeRoom((await get(ref(db, `rooms/${code}`))).val())!;
    await commitScores(code, atEnd);
    const after = normalizeRoom((await get(ref(db, `rooms/${code}`))).val())!;

    expect(after.round!.scores![dave], 'no RoundScore for a player who sat it out').toBeUndefined();
    expect(after.players[dave].score, 'his total stands exactly still').toBe(12);
    expect(after.players[other].score, 'and everyone else is scored as usual').not.toBe(5);

    // The next deal leaves him out until he says otherwise. `other` has to be
    // readied again first: startRound clears the flag and deals a hand only to
    // players who have set it, which is the same mechanism that leaves an unready
    // player behind on a forced start. Sitting out is the stronger claim of the
    // two - it survives being ready - and that is what this pins.
    await update(ref(db, `rooms/${code}`), {
      [`players/${other}/ready`]: true, [`players/${dave}/ready`]: true,
    });
    const readied = normalizeRoom((await get(ref(db, `rooms/${code}`))).val())!;
    await nextRound(code, readied);
    const dealt = normalizeRoom((await get(ref(db, `rooms/${code}`))).val())!.round!.tableaus;
    expect(Object.keys(dealt)).toEqual([other]);
  });
});

emu('a centre play the player who made it can see', () => {
  it('reaches this client before the server answers, so the next play is judged on a board that has it', async () => {
    // The bug this pins: the hand updates optimistically but the centre pile is
    // rendered straight off server state, so for one whole round trip the card
    // is in neither place. The animation is the smaller half. `playTo` gates the
    // next play on `room.round.spaces[space]`, so during that window a red 3
    // followed by a red 4 onto the same space drops the second one with no card
    // and no scowl, and flinging makes that window routine.
    const code = await createRoom('Host', 'tulip');
    const { db, ensureSignedIn } = await import('./firebase');
    const uid = await ensureSignedIn();
    const room: Room = {
      meta: { createdAt: Date.now(), hostId: uid, creatorId: uid, targetScore: 75, phase: 'lobby', roundNumber: 0 },
      players: { [uid]: { name: 'Host', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0, ready: true } },
      round: null,
    };
    await startRound(code, room);

    // The listener the app itself runs. What it reports is what the player sees,
    // because nothing renders the centre off the local hand.
    const seen: (CenterSpace | null)[] = [];
    let firstCallback!: () => void;
    const ready = new Promise<void>(resolve => { firstCallback = resolve; });
    const stop = onValue(ref(db, `rooms/${code}/round/spaces/0`), snap => {
      seen.push(snap.val() as CenterSpace | null);
      firstCallback();
    });
    await ready; // the empty board, before anything is played
    const before = seen.length;

    const one: Card = { v: 1, suit: 'red', owner: uid };
    const inFlight = playToCenter(code, 0, one); // deliberately not awaited: this IS the window
    // Microtasks only, so nothing here has had the chance to reach the server and
    // come back. A card visible at this point can only be the local echo.
    await Promise.resolve();
    await Promise.resolve();
    stop();

    expect(seen.slice(before).at(-1)?.stack).toEqual([one]);
    expect((await inFlight).committed).toBe(true);
  });
});
