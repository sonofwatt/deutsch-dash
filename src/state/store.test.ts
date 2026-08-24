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
