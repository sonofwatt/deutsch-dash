import { describe, it, expect, vi } from 'vitest';
import { createGameStore, legalTargets, tableReady, HOST_AWAY_MS, AWAY_MS, type Deps } from './store';
import type { PlayResult } from '../net/plays';
import { deal, buildDeck } from '../game/deck';
import type { Card, CenterSpace, PlayerInfo, RoomMeta, Suit, Room, Tableau } from '../game/types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });

function fakeDeps(over: Partial<Deps> = {}): Deps {
  return {
    ensureSignedIn: vi.fn(async () => 'me'),
    watchRoom: vi.fn(() => () => {}),
    joinRoom: vi.fn(async code => ({ ok: true as const, code })),
    createRoom: vi.fn(async () => 'ABCDEF'),
    setTargetScore: vi.fn(async () => {}),
    setReady: vi.fn(async () => {}),
    setSittingOut: vi.fn(async () => {}),
    setPaleCards: vi.fn(async () => {}),
    setCountdown: vi.fn(async () => {}),
    setIdentity: vi.fn(async () => {}),
    setHints: vi.fn(async () => {}),
    setOrderly: vi.fn(async () => {}),
    startRound: vi.fn(async () => {}),
    playToCenter: vi.fn(async () => ({ committed: true, winner: null })),
    reportRace: vi.fn(async () => {}),
    persistTableau: vi.fn(async () => {}),
    declareStuck: vi.fn(async () => {}),
    clearStuck: vi.fn(async () => {}),
    markAway: vi.fn(async () => {}),
    clearAway: vi.fn(async () => {}),
    announceBlitz: vi.fn(async () => {}),
    endRoundStalled: vi.fn(async () => {}),
    incrementStuckRounds: vi.fn(async () => 1),
    commitScores: vi.fn(async () => {}),
    nextRound: vi.fn(async () => {}),
    rematch: vi.fn(async () => {}),
    claimHost: vi.fn(async () => {}),
    addBot: vi.fn(async () => 'bot_star'),
    removeBot: vi.fn(async () => {}),
    stopPresence: vi.fn(),
    ...over,
  };
}

const seededTableau = (): Tableau => deal(buildDeck('me'), 3);

function playingRoom(tableau: Tableau): Room {
  return {
    meta: { createdAt: 1, hostId: 'me', creatorId: 'me', targetScore: 75, phase: 'playing', roundNumber: 1 },
    players: { me: { name: 'D', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0 } },
    round: { spaces: Array.from({ length: 16 }, () => ({ stack: [], history: [] })),
             tableaus: { me: tableau }, blitzedBy: null, scores: null, races: null, duels: null, endedAt: null, stuckRounds: 0, startedAt: 1 },
  };
}

describe('legalTargets', () => {
  it('lists center spaces and post stacks the source card fits', () => {
    const t: Tableau = { blitz: [c(1, 'red')], post: [[c(8, 'red')], [c(2, 'blue')], [c(7, 'green')]],
                         wood: [], woodIndex: 0 };
    const spaces = Array.from({ length: 16 }, () => ({ stack: [] as Card[], history: [] as Card[][] }));
    const fromBlitz = legalTargets(t, { kind: 'blitz' }, spaces);
    expect(fromBlitz.spaces).toHaveLength(16); // a 1 starts any empty space
    expect(fromBlitz.posts).toEqual([]);
    const fromPost2 = legalTargets(t, { kind: 'post', index: 2 }, spaces); // green 7 -> red 8
    expect(fromPost2.spaces).toEqual([]);
    expect(fromPost2.posts).toEqual([0]);
  });
});

describe('optimistic play', () => {
  it('removes the card locally, persists on committed transaction', async () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    const t = seededTableau();
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(t), tableau: t });

    store.getState().select({ kind: 'blitz' });
    const top = t.blitz[t.blitz.length - 1];
    // force the top card to be a red 1 so space 0 is legal
    const rigged: Tableau = { ...t, blitz: [...t.blitz.slice(0, -1), c(1, 'red')] };
    store.setState({ tableau: rigged });
    await store.getState().playTo({ space: 0 });

    expect(deps.playToCenter).toHaveBeenCalledWith('ABCDEF', 0, c(1, 'red'));
    expect(deps.persistTableau).toHaveBeenCalled();
    expect(store.getState().tableau!.blitz).toHaveLength(9);
    expect(store.getState().selection).toBeNull();
    expect(top).toBeDefined(); // silence unused warning
  });

  it('refuses a play once the round is over', async () => {
    // The board is still on screen under the blitz splash, which takes no pointer
    // events, so a tap in that window would otherwise land on a scored round.
    const deps = fakeDeps();
    const store = createGameStore(deps);
    const t = seededTableau();
    const room = playingRoom(t);
    store.setState({
      uid: 'me', code: 'ABCDEF', tableau: t,
      room: { ...room, meta: { ...room.meta, phase: 'roundEnd' } },
    });
    store.getState().select({ kind: 'blitz' });
    await store.getState().playTo({ space: 0 });
    expect(deps.playToCenter).not.toHaveBeenCalled();
  });

  it('restores the tableau when the transaction loses the race', async () => {
    const deps = fakeDeps({ playToCenter: vi.fn(async () => ({ committed: false, winner: 'ann' })) });
    const store = createGameStore(deps);
    const t = seededTableau();
    const rigged: Tableau = { ...t, blitz: [...t.blitz.slice(0, -1), c(1, 'red')] };
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(rigged), tableau: rigged });

    store.getState().select({ kind: 'blitz' });
    await store.getState().playTo({ space: 0 });

    expect(store.getState().tableau).toEqual(rigged); // rolled back
    expect(store.getState().lastRejected?.card).toEqual(c(1, 'red'));
    expect(store.getState().lastRejected?.space).toBe(0);   // which space to scowl at
    // The loser is the only client that knows a race happened - a winning
    // transaction looks exactly like an uncontested play - so it announces it.
    // ...and passes on who beat it, which only the aborted transaction knew.
    expect(deps.reportRace).toHaveBeenCalledWith('ABCDEF', 0, 'me', 'ann');
  });

  it('announces blitz when the last blitz card is played', async () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    const t = seededTableau();
    const oneLeft: Tableau = { ...t, blitz: [c(1, 'red')] };
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(oneLeft), tableau: oneLeft });

    store.getState().select({ kind: 'blitz' });
    await store.getState().playTo({ space: 0 });

    expect(deps.announceBlitz).toHaveBeenCalledWith('ABCDEF', 'me');
  });

  it('announces blitz when the last blitz card builds onto a post', async () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    const t: Tableau = { blitz: [c(7, 'green')],
                         post: [[c(8, 'red')], [c(2, 'blue')], [c(5, 'yellow')]], wood: [], woodIndex: 0 };
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(t), tableau: t });

    store.getState().select({ kind: 'blitz' });
    await store.getState().playTo({ post: 0 }); // green 7 builds on red 8

    expect(store.getState().tableau!.blitz).toHaveLength(0);
    expect(deps.announceBlitz).toHaveBeenCalledWith('ABCDEF', 'me');
    expect(deps.clearStuck).toHaveBeenCalledWith('ABCDEF', 'me');
  });

  it('illegal target is a no-op (no net call, tableau unchanged)', async () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    const t = seededTableau();
    const rigged: Tableau = { ...t, blitz: [...t.blitz.slice(0, -1), c(5, 'red')] };
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(rigged), tableau: rigged });
    store.getState().select({ kind: 'blitz' });
    await store.getState().playTo({ space: 0 }); // 5 on empty space: illegal
    expect(deps.playToCenter).not.toHaveBeenCalled();
    expect(store.getState().tableau).toEqual(rigged);
  });
});

describe('selection', () => {
  it('toggles off when the same source is selected twice', () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    store.getState().select({ kind: 'blitz' });
    expect(store.getState().selection).toEqual({ kind: 'blitz' });
    store.getState().select({ kind: 'blitz' });
    expect(store.getState().selection).toBeNull();
  });
});

describe('offline guard', () => {
  it('blocks playTo and flip while disconnected', async () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    const t = seededTableau();
    const rigged: Tableau = { ...t, blitz: [...t.blitz.slice(0, -1), c(1, 'red')] };
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(rigged), tableau: rigged, online: false });

    store.getState().select({ kind: 'blitz' });
    await store.getState().playTo({ space: 0 }); // would be legal if online
    expect(deps.playToCenter).not.toHaveBeenCalled();
    expect(deps.persistTableau).not.toHaveBeenCalled();
    expect(deps.clearStuck).not.toHaveBeenCalled();
    expect(store.getState().tableau).toEqual(rigged);

    const before = store.getState().tableau!.woodIndex;
    store.getState().flip();
    expect(store.getState().tableau!.woodIndex).toBe(before);

    store.getState().setOnline(true);
    store.getState().flip();
    expect(store.getState().tableau!.woodIndex).toBe(before + 3); // guard lifts with reconnection
  });
});

describe('all-stuck rotation re-entrancy', () => {
  it('a snapshot raised synchronously by clearStuck/persist rotates wood exactly once', async () => {
    let cb!: (room: Room | null) => void;
    const woodTab: Tableau = { blitz: [c(9, 'red')], post: [[], [], []],
                               wood: [c(1, 'red'), c(2, 'blue'), c(3, 'green')], woodIndex: 0 };
    const room = playingRoom(woodTab);
    room.players.me.stuckAt = 123; // every connected player is stuck
    // Firebase's set() raises local onValue events synchronously - model that:
    const reRaise = () => { cb(room); return Promise.resolve(); };
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
      clearStuck: vi.fn(reRaise),
      persistTableau: vi.fn(reRaise),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('ABCDEF', 'D', 'tulip');
    store.setState({ tableau: woodTab });

    cb(room);

    expect(store.getState().tableau!.wood.map(w => w.v)).toEqual([2, 3, 1]); // rotated by exactly one card
    expect(deps.incrementStuckRounds).toHaveBeenCalledTimes(1); // I am host; at most once
  });
});

describe('the lobby ready gate', () => {
  const lobby = (players: Record<string, PlayerInfo>, countdown?: number | null): Room => ({
    meta: { createdAt: 1, hostId: 'me', creatorId: 'me', targetScore: 75, phase: 'lobby',
            roundNumber: 0, ...(countdown === undefined ? {} : { countdown }) },
    players, round: null,
  });
  const human = (over: Partial<PlayerInfo> = {}): PlayerInfo => ({
    name: 'P', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null,
    score: 0, ...over,
  });
  const bot = (): PlayerInfo => human({ isBot: true, ready: true, badgeId: 'star' });

  describe('tableReady', () => {
    it('needs two players, so a host alone is never counted down', () => {
      expect(tableReady(lobby({ me: human({ ready: true }) }))).toBe(false);
    });
    it('is true when every human has readied and bots are taken as read', () => {
      expect(tableReady(lobby({ me: human({ ready: true }), b: bot() }))).toBe(true);
    });
    it('is false while anyone has not readied', () => {
      expect(tableReady(lobby({ me: human({ ready: true }), you: human() }))).toBe(false);
    });
    it('is false while a ready player has their tab hidden', () => {
      const players = { me: human({ ready: true }), you: human({ ready: true, awayAt: 5 }) };
      expect(tableReady(lobby(players))).toBe(false);
    });
    it('is false while a ready player is disconnected', () => {
      const players = { me: human({ ready: true }), you: human({ ready: true, connected: false }) };
      expect(tableReady(lobby(players))).toBe(false);
    });
    it('ignores a player sitting out entirely', () => {
      // Not ready, away and unreachable all at once - and none of it counts,
      // because they are not going to be dealt in.
      const out = human({ awayAt: 5, connected: false, sittingOut: true });
      expect(tableReady(lobby({ me: human({ ready: true }), b: bot(), out }))).toBe(true);
    });
    it('will not start a table of one plus spectators', () => {
      const players = { me: human({ ready: true }), out: human({ sittingOut: true }) };
      expect(tableReady(lobby(players))).toBe(false);
    });
  });

  it('the host writes 3 when the table readies, and nobody else does', async () => {
    for (const [who, expected] of [['me', 1], ['someone-else', 0]] as const) {
      let cb!: (room: Room | null) => void;
      const deps = fakeDeps({
        ensureSignedIn: vi.fn(async () => who),
        watchRoom: vi.fn((_c: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
      });
      const store = createGameStore(deps);
      await store.getState().enterRoom('ABCDEF', 'D', 'tulip');
      cb(lobby({ me: human({ ready: true }), b: bot() }));
      expect(deps.setCountdown).toHaveBeenCalledTimes(expected);
      if (expected) expect(deps.setCountdown).toHaveBeenCalledWith('ABCDEF', 3);
      store.getState().leave();
    }
  });

  it('does not start a second countdown once one is already running', async () => {
    let cb!: (room: Room | null) => void;
    const deps = fakeDeps({
      watchRoom: vi.fn((_c: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('ABCDEF', 'D', 'tulip');
    const ready = { me: human({ ready: true }), b: bot() };
    cb(lobby(ready));         // writes 3
    cb(lobby(ready, 3));      // the snapshot that write raises
    cb(lobby(ready, 3));      // and any other traffic
    expect(deps.setCountdown).toHaveBeenCalledTimes(1);
    store.getState().leave();
  });

  it('cancels a running countdown the moment somebody un-readies', async () => {
    let cb!: (room: Room | null) => void;
    const deps = fakeDeps({
      watchRoom: vi.fn((_c: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('ABCDEF', 'D', 'tulip');
    cb(lobby({ me: human({ ready: true }), you: human({ ready: true }) }));
    expect(deps.setCountdown).toHaveBeenLastCalledWith('ABCDEF', 3);
    cb(lobby({ me: human({ ready: true }), you: human() }, 2));
    expect(deps.setCountdown).toHaveBeenLastCalledWith('ABCDEF', null);
    expect(deps.startRound).not.toHaveBeenCalled();
    store.getState().leave();
  });

  it('refuses to change identity once the player has readied', async () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    store.setState({ uid: 'me', code: 'ABCDEF', room: lobby({ me: human({ ready: true }) }) });
    store.getState().setIdentity('New name', 'boat');
    expect(deps.setIdentity).not.toHaveBeenCalled();
  });

  it('changes name and badge together, passing the badge being given up', async () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    store.setState({ uid: 'me', code: 'ABCDEF', room: lobby({ me: human({ name: 'D' }) }) });
    store.getState().setIdentity('  Samantha  ', 'boat');
    expect(deps.setIdentity).toHaveBeenCalledWith('ABCDEF', 'me', 'Samantha', 'boat', 'tulip');
  });

  it('marks away when the tab is hidden in the lobby, and clears it on return', () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    store.setState({ uid: 'me', code: 'ABCDEF', room: lobby({ me: human() }) });
    store.getState().noteVisible(false);
    expect(deps.markAway).toHaveBeenCalledWith('ABCDEF', 'me');
    store.setState({ room: lobby({ me: human({ awayAt: 9 }) }) });
    store.getState().noteVisible(true);
    expect(deps.clearAway).toHaveBeenCalledWith('ABCDEF', 'me');
  });

  it('leaves awayAt alone outside the lobby - the idle timer owns it in a round', () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(seededTableau()) });
    store.getState().noteVisible(false);
    expect(deps.markAway).not.toHaveBeenCalled();
  });
});

describe('the host committing scores', () => {
  const roundEnd = (): Room => {
    const r = playingRoom(seededTableau());
    r.meta.phase = 'roundEnd';
    r.round!.blitzedBy = 'me';
    return r;
  };

  it('attempts the commit once per round, not once per snapshot, when it is refused', async () => {
    // A rejected RTDB write is rolled back out of the local cache, and the
    // rollback raises another snapshot - which used to walk straight back into
    // the commit. Against the live database (rules missing the `stats` grant)
    // that was a write every few milliseconds for as long as the round was up.
    let cb!: (room: Room | null) => void;
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
      commitScores: vi.fn(async () => { throw new Error('PERMISSION_DENIED'); }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('ABCDEF', 'D', 'tulip');

    cb(roundEnd());
    await Promise.resolve();
    cb(roundEnd());   // the rollback snapshot
    cb(roundEnd());   // and another
    await Promise.resolve();

    expect(deps.commitScores).toHaveBeenCalledTimes(1);
    expect(store.getState().actionError).toMatch(/scores/i);
  });

  it('re-arms the commit when the connection comes back', async () => {
    let cb!: (room: Room | null) => void;
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
      commitScores: vi.fn(async () => { throw new Error('offline'); }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('ABCDEF', 'D', 'tulip');

    cb(roundEnd());
    await Promise.resolve();
    store.getState().setOnline(false);
    store.getState().setOnline(true);
    cb(roundEnd());
    await Promise.resolve();

    expect(deps.commitScores).toHaveBeenCalledTimes(2);
  });
});

describe('stale-session guards', () => {
  // Defaults model the plain stand-in scenario: 'h' both created the room and holds
  // host, and is disconnected. Pass metaOverrides for phase/creatorId, and
  // hConnected=true to model the host reconnecting.
  const mkPlayers = (hConnected = false): Record<string, PlayerInfo> => ({
    h:  { name: 'H', badgeId: 'star',  joinedAt: 0, connected: hConnected, stuckAt: null, awayAt: null, score: 0 },
    me: { name: 'D', badgeId: 'tulip', joinedAt: 1, connected: true,       stuckAt: null, awayAt: null, score: 0 },
  });
  const mkRoom = (metaOverrides: Partial<RoomMeta> = {}, hConnected = false): Room => ({
    meta: { createdAt: 1, hostId: 'h', creatorId: 'h', targetScore: 75, phase: 'playing', roundNumber: 1,
            ...metaOverrides },
    players: mkPlayers(hConnected),
    round: null,
  });

  it('drops in-flight play continuations after leave()', async () => {
    let resolvePlay!: (v: PlayResult) => void;
    const deps = fakeDeps({
      playToCenter: vi.fn(() => new Promise<PlayResult>(res => { resolvePlay = res; })),
    });
    const store = createGameStore(deps);
    const t = seededTableau();
    const oneLeft: Tableau = { ...t, blitz: [c(1, 'red')] };
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(oneLeft), tableau: oneLeft });
    store.getState().select({ kind: 'blitz' });
    const inFlight = store.getState().playTo({ space: 0 });
    store.getState().leave();
    resolvePlay({ committed: true, winner: null });
    await inFlight;
    expect(deps.announceBlitz).not.toHaveBeenCalled();
    expect(deps.persistTableau).not.toHaveBeenCalled();
    expect(store.getState().tableau).toBeNull();
  });

  it('claims host after HOST_AWAY_MS when the host stays disconnected and I am next', async () => {
    let cb: ((room: Room | null) => void) | undefined;
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('AAAAAA', 'D', 'tulip');
    vi.useFakeTimers();
    try {
      cb!(mkRoom());
      vi.advanceTimersByTime(HOST_AWAY_MS + 1);
      expect(deps.claimHost).toHaveBeenCalledWith('AAAAAA', 'me');
    } finally {
      vi.useRealTimers();
    }
  });

  it('claims host after HOST_AWAY_MS when the host is disconnected in the lobby (previously impossible)', async () => {
    let cb: ((room: Room | null) => void) | undefined;
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('AAAAAA', 'D', 'tulip');
    vi.useFakeTimers();
    try {
      cb!(mkRoom({ phase: 'lobby' })); // the old `phase !== 'lobby'` guard made this case impossible
      vi.advanceTimersByTime(HOST_AWAY_MS + 1);
      expect(deps.claimHost).toHaveBeenCalledWith('AAAAAA', 'me');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a host who reconnects before the grace period elapses does not lose host', async () => {
    // Two disconnect cycles, not one: a single reconnect-then-wait can pass even if
    // the pending timer is never actually cancelled, because the timer's own
    // fire-time re-check (get().room at fire time) independently no-ops when it
    // finds the host connected. Only a SECOND disconnect - which must arm a fresh
    // full-length timer rather than silently reuse a stale, uncleared one - proves
    // cancellation itself happened, per spec item 3 ("must still cancel when the
    // host reconnects").
    let cb: ((room: Room | null) => void) | undefined;
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('AAAAAA', 'D', 'tulip');
    vi.useFakeTimers();
    try {
      cb!(mkRoom({ phase: 'lobby' }));               // t=0: host away - e.g. backgrounded for the invite share sheet
      vi.advanceTimersByTime(HOST_AWAY_MS / 2);       // t=H/2
      cb!(mkRoom({ phase: 'lobby' }, true));          // host reconnects - the pending timer must be cancelled outright
      vi.advanceTimersByTime(HOST_AWAY_MS / 4);       // t=3H/4
      cb!(mkRoom({ phase: 'lobby' }));                // host goes away again - must arm a FRESH full HOST_AWAY_MS timer
      vi.advanceTimersByTime(HOST_AWAY_MS / 4 + 1);   // t=H+1: past the FIRST disconnect's now-stale original deadline.
      // An uncancelled first timer would fire right here against this second,
      // disconnected snapshot - transferring host ~3/4 of a grace period early.
      expect(deps.claimHost).not.toHaveBeenCalled();
      vi.advanceTimersByTime(HOST_AWAY_MS * 3 / 4);   // t=7H/4+1: the fresh (second) timer's real deadline
      expect(deps.claimHost).toHaveBeenCalledWith('AAAAAA', 'me');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a timer armed in one room cannot fire into the next room', async () => {
    const cbs: Array<(room: Room | null) => void> = [];
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (room: Room | null) => void) => { cbs.push(f); return () => {}; }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('AAAAAA', 'D', 'tulip');
    vi.useFakeTimers();
    try {
      cbs[0]!(mkRoom());                                 // room A arms its watchdog (fires at t=HOST_AWAY_MS)
      vi.advanceTimersByTime(HOST_AWAY_MS * 3 / 5);       // t=0.6*HOST_AWAY_MS
      store.getState().leave();                           // must cancel room A's pending timer
      await store.getState().enterRoom('XYZABC', 'D', 'tulip');
      cbs[1]!(mkRoom());                                   // room B arms a FRESH watchdog (fires t=1.6*HOST_AWAY_MS)
      vi.advanceTimersByTime(HOST_AWAY_MS * 3 / 5);       // t=1.2*HOST_AWAY_MS - past A's old deadline, before B's
      expect(deps.claimHost).not.toHaveBeenCalled();      // stale A-timer must not hit room B
      vi.advanceTimersByTime(HOST_AWAY_MS * 2 / 5 + 1);   // t=1.6*HOST_AWAY_MS+1 - B's own watchdog legitimately fires
      expect(deps.claimHost).toHaveBeenCalledTimes(1);
      expect(deps.claimHost).toHaveBeenCalledWith('XYZABC', 'me');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('creator reclaim', () => {
  it('the creator reclaims host immediately (no timer advance) when a snapshot shows a different hostId', async () => {
    let cb: ((room: Room | null) => void) | undefined;
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('AAAAAA', 'D', 'tulip');
    const room: Room = {
      meta: { createdAt: 1, hostId: 'h', creatorId: 'me', targetScore: 75, phase: 'lobby', roundNumber: 0 },
      // my own presence write may not have landed yet - reclaim must not depend on it
      players: {
        h:  { name: 'H', badgeId: 'star',  joinedAt: 0, connected: true,  stuckAt: null, awayAt: null, score: 0 },
        me: { name: 'D', badgeId: 'tulip', joinedAt: 1, connected: false, stuckAt: null, awayAt: null, score: 0 },
      },
      round: null,
    };
    // no vi.useFakeTimers(), no time advance at all: claimHost must already have
    // been called synchronously inside cb(), proving this is not the setTimeout path.
    cb!(room);
    expect(deps.claimHost).toHaveBeenCalledWith('AAAAAA', 'me');
  });

  it('a non-creator does not reclaim on that same snapshot shape', async () => {
    let cb: ((room: Room | null) => void) | undefined;
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('AAAAAA', 'D', 'tulip');
    const room: Room = {
      meta: { createdAt: 1, hostId: 'h', creatorId: 'someone-else', targetScore: 75, phase: 'lobby', roundNumber: 0 },
      players: {
        h:  { name: 'H', badgeId: 'star',  joinedAt: 0, connected: true,  stuckAt: null, awayAt: null, score: 0 },
        me: { name: 'D', badgeId: 'tulip', joinedAt: 1, connected: false, stuckAt: null, awayAt: null, score: 0 },
      },
      round: null,
    };
    cb!(room);
    expect(deps.claimHost).not.toHaveBeenCalled();
  });
});

describe('AI players', () => {
  function roomWithBot(hostId = 'me'): Room {
    return {
      meta: { createdAt: 1, hostId, creatorId: hostId, targetScore: 75, phase: 'playing', roundNumber: 1 },
      players: {
        me: { name: 'D', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0 },
        [hostId]: { name: 'H', badgeId: 'bell', joinedAt: 0, connected: true, stuckAt: null, awayAt: null, score: 0 },
        bot_star: { name: 'Ada', badgeId: 'star', joinedAt: 2, connected: true, stuckAt: null, awayAt: null,
                    score: 0, isBot: true, botLevel: 'hard' },
      },
      round: {
        spaces: Array.from({ length: 16 }, () => ({ stack: [], history: [] })),
        tableaus: { me: deal(buildDeck('me'), 3), bot_star: deal(buildDeck('bot_star'), 3) },
        blitzedBy: null, scores: null, races: null, duels: null, endedAt: null, stuckRounds: 0, startedAt: 1,
      },
    };
  }

  async function run(hostId: string) {
    let cb!: (r: Room | null) => void;
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (room: Room | null) => void) => { cb = f; return () => {}; }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('ABCDEF', 'D', 'tulip');
    vi.useFakeTimers();
    cb(roomWithBot(hostId));
    await vi.advanceTimersByTimeAsync(9000); // bots are slower now: ~6 hard turns
    store.getState().leave();
    vi.useRealTimers();
    return deps;
  }

  it('the host plays the bot hand on a timer', async () => {
    const deps = await run('me');
    // deal(buildDeck) puts blue 1 on the bot's first post, the only card it can
    // legally place with the centre empty. WHICH space it lands in is deliberately
    // left open: on a sloppy roll the bot takes a random legal move, and with an
    // empty centre every space is legal for an Ace. Pinning it to space 0 made
    // this test fail about one run in six.
    expect(deps.playToCenter).toHaveBeenCalledWith(
      'ABCDEF', expect.any(Number), { v: 1, suit: 'blue', owner: 'bot_star' });
    const picked = vi.mocked(deps.playToCenter).mock.calls.map(call => call[1]);
    expect(picked.every(i => Number.isInteger(i) && i >= 0 && i < 16)).toBe(true);
    expect(deps.persistTableau).toHaveBeenCalledWith('ABCDEF', 'bot_star', expect.anything());
  });

  it('a client that is not host never touches a bot hand', async () => {
    const deps = await run('someone-else');
    expect(deps.playToCenter).not.toHaveBeenCalled();
    expect(deps.persistTableau).not.toHaveBeenCalledWith('ABCDEF', 'bot_star', expect.anything());
    expect(deps.persistTableau).toHaveBeenCalledWith('ABCDEF', 'me', expect.anything()); // still adopts its own
  });
});

describe('automatic stuck detection', () => {
  // Only a red 6 could land here, so a blue 9 on top of the Blitz pile is dead
  const blocked = (): CenterSpace[] => [{ stack: [c(5, 'red')], history: [] }];
  const noMoves = (over: Partial<Tableau> = {}): Tableau =>
    ({ blitz: [c(9, 'blue')], post: [[], [], []], wood: [], woodIndex: 0, ...over });

  function room(t: Tableau, stuckAt: number | null = null): Room {
    return {
      meta: { createdAt: 1, hostId: 'me', creatorId: 'me', targetScore: 75, phase: 'playing', roundNumber: 1 },
      players: { me: { name: 'D', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt, awayAt: null, score: 0 } },
      round: { spaces: blocked(), tableaus: { me: t }, blitzedBy: null, scores: null, races: null, duels: null, endedAt: null,
               stuckRounds: 0, startedAt: 1 },
    };
  }

  async function feed(t: Tableau, stuckAt: number | null = null) {
    let cb!: (r: Room | null) => void;
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (r: Room | null) => void) => { cb = f; return () => {}; }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('ABCDEF', 'D', 'tulip');
    cb(room(t, stuckAt));
    return { deps, store, cb };
  }

  it('declares immediately when the wood pile is gone - nothing left to turn over', async () => {
    const { deps } = await feed(noMoves());
    expect(deps.declareStuck).toHaveBeenCalledWith('ABCDEF', 'me');
  });

  it('does not declare while there is wood left to turn over', async () => {
    const wood = Array.from({ length: 9 }, () => c(9, 'blue'));
    const { deps } = await feed(noMoves({ wood }));
    expect(deps.declareStuck).not.toHaveBeenCalled();
  });

  it('declares once the whole pile has been turned over with nothing to show', async () => {
    const wood = Array.from({ length: 9 }, () => c(9, 'blue'));
    const { deps, store } = await feed(noMoves({ wood }));
    for (let i = 0; i < 3; i++) store.getState().flip(); // 3 flips of 3 = the whole pile
    expect(deps.declareStuck).toHaveBeenCalledWith('ABCDEF', 'me');
  });

  it('withdraws the claim as soon as the board frees the player', async () => {
    // already flagged stuck, and now holding a card that fits the centre
    const { deps } = await feed(noMoves({ blitz: [c(6, 'red')] }), 12345);
    expect(deps.clearStuck).toHaveBeenCalledWith('ABCDEF', 'me');
    expect(deps.declareStuck).not.toHaveBeenCalled();
  });
});

describe('a dead socket must not wedge the join buttons', () => {
  // Firebase's get()/update() reject outright when the socket is gone - which is
  // what coming back to a tab after the phone slept looks like. joinPhase used to
  // stay on 'joining' through that, disabling every join and create button for good.
  it('enterRoom reports offline instead of leaving joinPhase on joining', async () => {
    const store = createGameStore(fakeDeps({
      joinRoom: vi.fn(async () => { throw new Error('client is offline'); }),
    }));
    const res = await store.getState().enterRoom('ABCDEF', 'D', 'tulip');
    expect(res).toEqual({ ok: false, reason: 'offline' });
    expect(store.getState().joinPhase).toBe('idle');
    expect(store.getState().joinError).toBe('offline');
  });

  it('hostRoom clears joinPhase before it rethrows', async () => {
    const store = createGameStore(fakeDeps({
      createRoom: vi.fn(async () => { throw new Error('client is offline'); }),
    }));
    await expect(store.getState().hostRoom('D', 'tulip')).rejects.toThrow();
    expect(store.getState().joinPhase).toBe('idle');
    expect(store.getState().joinError).toBe('offline');
  });

  it('a refused join still reports its own reason, not offline', async () => {
    const store = createGameStore(fakeDeps({
      joinRoom: vi.fn(async () => ({ ok: false as const, reason: 'full' as const })),
    }));
    expect(await store.getState().enterRoom('ABCDEF', 'D', 'tulip'))
      .toEqual({ ok: false, reason: 'full' });
    expect(store.getState().joinError).toBe('full');
  });
});


describe('away players', () => {
  // A table that is hung exactly the way the 2026-08-26 playtest hung: I am stuck,
  // and the other human has legal moves - so is correctly never marked stuck - and
  // is not playing them. Nothing rotates and the round cannot end.
  const idleTable = (awayAt: number | null): Room => ({
    meta: { createdAt: 1, hostId: 'me', creatorId: 'me', targetScore: 75, phase: 'playing', roundNumber: 1 },
    players: {
      me:   { name: 'D', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: 123, awayAt: null, score: 0 },
      idle: { name: 'I', badgeId: 'star',  joinedAt: 2, connected: true, stuckAt: null, awayAt, score: 0 },
    },
    round: { spaces: Array.from({ length: 16 }, () => ({ stack: [], history: [] })),
             tableaus: {}, blitzedBy: null, scores: null, races: null, duels: null,
             endedAt: null, stuckRounds: 0, startedAt: 1 },
  });

  const solo = (awayAt: number | null = null, phase: Room['meta']['phase'] = 'playing'): Room => ({
    meta: { createdAt: 1, hostId: 'me', creatorId: 'me', targetScore: 75, phase, roundNumber: 1 },
    players: { me: { name: 'D', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt, score: 0 } },
    round: { spaces: Array.from({ length: 16 }, () => ({ stack: [], history: [] })),
             tableaus: {}, blitzedBy: null, scores: null, races: null, duels: null,
             endedAt: null, stuckRounds: 0, startedAt: 1 },
  });

  async function joined() {
    let cb!: (r: Room | null) => void;
    const deps = fakeDeps({
      watchRoom: vi.fn((_code: string, f: (r: Room | null) => void) => { cb = f; return () => {}; }),
    });
    const store = createGameStore(deps);
    await store.getState().enterRoom('ABCDEF', 'D', 'tulip');
    return { deps, store, cb };
  }

  it('marks itself away after AWAY_MS of touching nothing', async () => {
    const { deps, store, cb } = await joined();
    vi.useFakeTimers();
    try {
      cb(solo());
      vi.advanceTimersByTime(AWAY_MS - 1);
      expect(deps.markAway).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(deps.markAway).toHaveBeenCalledWith('ABCDEF', 'me');
    } finally {
      store.getState().leave();
      vi.useRealTimers();
    }
  });

  it('activity arms a FRESH full timer rather than letting the old one run out', async () => {
    const { deps, store, cb } = await joined();
    vi.useFakeTimers();
    try {
      cb(solo());
      vi.advanceTimersByTime(AWAY_MS / 2);
      store.getState().noteActivity();
      vi.advanceTimersByTime(AWAY_MS / 2 + 1); // past the FIRST timer's now-stale deadline
      expect(deps.markAway).not.toHaveBeenCalled();
      vi.advanceTimersByTime(AWAY_MS / 2);     // the fresh timer's own deadline
      expect(deps.markAway).toHaveBeenCalledTimes(1);
    } finally {
      store.getState().leave();
      vi.useRealTimers();
    }
  });

  it('a snapshot is somebody else\'s activity, not mine, and must not reset the timer', async () => {
    // Otherwise a busy table keeps an idle player looking present indefinitely -
    // every play by anyone else raises a snapshot here.
    const { deps, store, cb } = await joined();
    vi.useFakeTimers();
    try {
      cb(solo());
      vi.advanceTimersByTime(AWAY_MS / 2);
      cb(solo()); // someone else played
      vi.advanceTimersByTime(AWAY_MS / 2 + 1);
      expect(deps.markAway).toHaveBeenCalledWith('ABCDEF', 'me');
    } finally {
      store.getState().leave();
      vi.useRealTimers();
    }
  });

  it('a reload starts the clock rather than clearing an away flag already set', async () => {
    // `flips` resets on reload too, so a tab that reloads itself every so often
    // must not be able to launder itself back into being present.
    const { deps, store, cb } = await joined();
    vi.useFakeTimers();
    try {
      cb(solo(7000)); // fresh store, RTDB already says I am away
      expect(deps.clearAway).not.toHaveBeenCalled();
      vi.advanceTimersByTime(AWAY_MS + 1);
      expect(deps.markAway).not.toHaveBeenCalled(); // already marked: no pointless rewrite
    } finally {
      store.getState().leave();
      vi.useRealTimers();
    }
  });

  it('withdraws the flag on the first sign of life', async () => {
    const { deps, store, cb } = await joined();
    cb(solo(7000));
    store.getState().noteActivity();
    expect(deps.clearAway).toHaveBeenCalledWith('ABCDEF', 'me');
    store.getState().leave();
  });

  it('runs no away clock outside a live round', async () => {
    const { deps, store, cb } = await joined();
    vi.useFakeTimers();
    try {
      cb(solo(null, 'lobby'));
      vi.advanceTimersByTime(AWAY_MS * 2);
      expect(deps.markAway).not.toHaveBeenCalled();
    } finally {
      store.getState().leave();
      vi.useRealTimers();
    }
  });

  it('never marks a bot away - a bot that stops acting is a bug in the host', async () => {
    const { deps, store, cb } = await joined();
    vi.useFakeTimers();
    try {
      const room = solo();
      room.players.bot_star = { name: 'Ada', badgeId: 'star', joinedAt: 2, connected: true,
                                stuckAt: null, awayAt: null, score: 0, isBot: true, botLevel: 'hard' };
      cb(room);
      await vi.advanceTimersByTimeAsync(AWAY_MS + 1);
      expect(deps.markAway).toHaveBeenCalledWith('ABCDEF', 'me');
      expect(deps.markAway).not.toHaveBeenCalledWith('ABCDEF', 'bot_star');
    } finally {
      store.getState().leave();
      vi.useRealTimers();
    }
  });

  it('an away host rotates on behalf of a table of stuck bots - the reported repro', async () => {
    // One human doing nothing, two bots: the shape that hung for five minutes on
    // 2026-08-26. The away client is the ONLY one still running, and it is not
    // itself stuck, so if it declines to act on allConnectedStuck nobody ever
    // rotates and the round cannot reach its three-fruitless-rotations end.
    const { deps, store, cb } = await joined();
    const room = solo(7000); // me: away, host, and not stuck - I have moves, I am just not there
    for (const id of ['bot_one', 'bot_two']) {
      room.players[id] = { name: id, badgeId: 'star', joinedAt: 2, connected: true,
                           stuckAt: 500, awayAt: null, score: 0, isBot: true, botLevel: 'medium' };
    }
    cb(room);
    expect(deps.incrementStuckRounds).toHaveBeenCalledTimes(1);
    expect(deps.clearStuck).toHaveBeenCalledWith('ABCDEF', 'bot_one'); // the bots' piles move too
    expect(deps.clearStuck).not.toHaveBeenCalledWith('ABCDEF', 'me');  // I was never stuck to clear
    store.getState().leave();
  });

  it('the hung round rotates once the idle player is away, and not before', async () => {
    const before = await joined();
    before.cb(idleTable(null));
    expect(before.deps.incrementStuckRounds).not.toHaveBeenCalled(); // the bug: waits forever
    before.store.getState().leave();

    const after = await joined();
    after.cb(idleTable(7000));
    expect(after.deps.incrementStuckRounds).toHaveBeenCalledTimes(1);
    after.store.getState().leave();
  });
});
