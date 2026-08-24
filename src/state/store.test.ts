import { describe, it, expect, vi } from 'vitest';
import { createGameStore, legalTargets, type Deps } from './store';
import { deal, buildDeck } from '../game/deck';
import type { Card, Suit, Room, Tableau } from '../game/types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });

function fakeDeps(over: Partial<Deps> = {}): Deps {
  return {
    ensureSignedIn: vi.fn(async () => 'me'),
    watchRoom: vi.fn(() => () => {}),
    joinRoom: vi.fn(async code => ({ ok: true as const, code })),
    createRoom: vi.fn(async () => 'ABCDEF'),
    setTargetScore: vi.fn(async () => {}),
    startRound: vi.fn(async () => {}),
    playToCenter: vi.fn(async () => true),
    persistTableau: vi.fn(async () => {}),
    declareStuck: vi.fn(async () => {}),
    clearStuck: vi.fn(async () => {}),
    announceBlitz: vi.fn(async () => {}),
    endRoundStalled: vi.fn(async () => {}),
    incrementStuckRounds: vi.fn(async () => 1),
    commitScores: vi.fn(async () => {}),
    nextRound: vi.fn(async () => {}),
    rematch: vi.fn(async () => {}),
    claimHost: vi.fn(async () => {}),
    ...over,
  };
}

const seededTableau = (): Tableau => deal(buildDeck('me'), 3);

function playingRoom(tableau: Tableau): Room {
  return {
    meta: { createdAt: 1, hostId: 'me', targetScore: 75, phase: 'playing', roundNumber: 1 },
    players: { me: { name: 'D', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, score: 0 } },
    round: { spaces: Array.from({ length: 16 }, () => ({ stack: [], history: [] })),
             tableaus: { me: tableau }, blitzedBy: null, scores: null, stuckRounds: 0, startedAt: 1 },
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

  it('restores the tableau when the transaction loses the race', async () => {
    const deps = fakeDeps({ playToCenter: vi.fn(async () => false) });
    const store = createGameStore(deps);
    const t = seededTableau();
    const rigged: Tableau = { ...t, blitz: [...t.blitz.slice(0, -1), c(1, 'red')] };
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(rigged), tableau: rigged });

    store.getState().select({ kind: 'blitz' });
    await store.getState().playTo({ space: 0 });

    expect(store.getState().tableau).toEqual(rigged); // rolled back
    expect(store.getState().lastRejected?.card).toEqual(c(1, 'red'));
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

describe('stale-session guards', () => {
  it('drops in-flight play continuations after leave()', async () => {
    let resolvePlay!: (v: boolean) => void;
    const deps = fakeDeps({
      playToCenter: vi.fn(() => new Promise<boolean>(res => { resolvePlay = res; })),
    });
    const store = createGameStore(deps);
    const t = seededTableau();
    const oneLeft: Tableau = { ...t, blitz: [c(1, 'red')] };
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(oneLeft), tableau: oneLeft });
    store.getState().select({ kind: 'blitz' });
    const inFlight = store.getState().playTo({ space: 0 });
    store.getState().leave();
    resolvePlay(true);
    await inFlight;
    expect(deps.announceBlitz).not.toHaveBeenCalled();
    expect(deps.persistTableau).not.toHaveBeenCalled();
    expect(store.getState().tableau).toBeNull();
  });

  it('arms the host-transfer timer and cancels it on leave()', async () => {
    const mkPlayers = () => ({
      h:  { name: 'H', badgeId: 'star' as const,  joinedAt: 0, connected: false, stuckAt: null, score: 0 },
      me: { name: 'D', badgeId: 'tulip' as const, joinedAt: 1, connected: true,  stuckAt: null, score: 0 },
    });
    const mkRoom = (): Room => ({
      meta: { createdAt: 1, hostId: 'h', targetScore: 75, phase: 'playing', roundNumber: 1 },
      players: mkPlayers(),
      round: null,
    });
    // positive control: without leave(), the watchdog claims host after 5s
    let cb1: ((room: Room | null) => void) | undefined;
    const deps1 = fakeDeps({
      watchRoom: vi.fn((_code: string, cb: (room: Room | null) => void) => { cb1 = cb; return () => {}; }),
    });
    const s1 = createGameStore(deps1);
    await s1.getState().enterRoom('ABCDEF', 'D', 'tulip');
    vi.useFakeTimers();
    try {
      cb1!(mkRoom());
      vi.advanceTimersByTime(5001);
      expect(deps1.claimHost).toHaveBeenCalledWith('ABCDEF', 'me');
    } finally {
      vi.useRealTimers();
    }

    // regression: leave() cancels the pending timer
    let cb2: ((room: Room | null) => void) | undefined;
    const deps2 = fakeDeps({
      watchRoom: vi.fn((_code: string, cb: (room: Room | null) => void) => { cb2 = cb; return () => {}; }),
    });
    const s2 = createGameStore(deps2);
    await s2.getState().enterRoom('ABCDEF', 'D', 'tulip');
    vi.useFakeTimers();
    try {
      cb2!(mkRoom());
      s2.getState().leave();
      vi.advanceTimersByTime(10000);
      expect(deps2.claimHost).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
