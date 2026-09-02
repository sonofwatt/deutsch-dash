import { describe, it, expect, afterEach } from 'vitest';
import {
  dasherOf, emptyGame, roundScore, statsOf, totals, winnerOf, type KeeperGame,
} from './model';
import { loadGame, saveGame } from './storage';
import { statsFor } from '../game/stats';

const game = (over: Partial<KeeperGame> = {}): KeeperGame => ({
  ...emptyGame(),
  players: [
    { id: 'tulip', name: 'Ann', badgeId: 'tulip' },
    { id: 'star', name: 'Bo', badgeId: 'star' },
  ],
  ...over,
});

describe('keeper model', () => {
  it('turns the two numbers a player counts into a round score', () => {
    expect(roundScore(9, 0)).toEqual({ centerCount: 9, dashLeft: 0, delta: 9 });
    expect(roundScore(3, 4)).toEqual({ centerCount: 3, dashLeft: 4, delta: -5 });
  });

  it('adds the rounds up, and ignores a player who has since been removed', () => {
    const g = game({ rounds: [
      { scores: { tulip: roundScore(9, 0), star: roundScore(2, 5), ghost: roundScore(50, 0) }, ms: null },
      { scores: { tulip: roundScore(4, 3), star: roundScore(6, 1) }, ms: null },
    ] });
    expect(totals(g)).toEqual({ tulip: 7, star: -4 });
  });

  it('starts everyone on zero before a round is entered', () => {
    expect(totals(game())).toEqual({ tulip: 0, star: 0 });
  });

  it('reads the dasher off the numbers rather than asking who won', () => {
    expect(dasherOf({ tulip: roundScore(9, 0), star: roundScore(2, 5) })).toBe('tulip');
    expect(dasherOf({ tulip: roundScore(4, 2), star: roundScore(2, 5) })).toBeNull();
    // Two empty piles cannot both be right, so credit neither rather than guess.
    expect(dasherOf({ tulip: roundScore(9, 0), star: roundScore(7, 0) })).toBeNull();
  });

  it('declares a winner only when somebody stands alone at the target', () => {
    const won = game({ targetScore: 25,
      rounds: [{ scores: { tulip: roundScore(30, 0), star: roundScore(1, 2) }, ms: null }] });
    expect(winnerOf(won)).toBe('tulip');
    const tied = game({ targetScore: 25,
      rounds: [{ scores: { tulip: roundScore(30, 0), star: roundScore(30, 0) }, ms: null }] });
    expect(winnerOf(tied)).toBeNull();   // level at the top plays another round
    expect(winnerOf(game({ targetScore: 25 }))).toBeNull();
  });

  it('folds the rounds into the same stats the online game keeps', () => {
    const g = game({ rounds: [
      { scores: { tulip: roundScore(9, 0), star: roundScore(2, 5) }, ms: 47_000 },
      { scores: { tulip: roundScore(5, 2), star: roundScore(1, 6) }, ms: null },
    ] });
    const stats = statsOf(g)!;
    expect(stats.rounds).toBe(2);
    expect(statsFor(stats, 'tulip').dashes).toBe(1);      // only round one was emptied
    expect(statsFor(stats, 'star').lastStreak).toBe(2);
    expect(stats.races).toBe(0);                           // nothing to race across a table
    // Timed rounds do count, when somebody used the clock.
    expect(stats.fastest).toEqual({ uid: 'tulip', ms: 47_000, round: 1 });
  });

  it('has no stats to speak of before the first round', () => {
    expect(statsOf(game())).toBeNull();
  });
});

describe('keeper storage', () => {
  const shim = () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
      },
    });
    return store;
  };
  afterEach(() => { delete (globalThis as Record<string, unknown>).localStorage; });

  it('does nothing at all where there is no DOM', () => {
    // The test environment is node, and this module is imported by a screen: an
    // unguarded read here would throw before a single test ran.
    expect(loadGame()).toBeNull();
    expect(() => saveGame(game())).not.toThrow();
  });

  it('survives the tab being closed mid-game', () => {
    shim();
    const g = game({
      rounds: [{ scores: { tulip: roundScore(9, 0), star: roundScore(2, 5) }, ms: 61_000 }],
      snark: false,
    });
    saveGame(g);
    expect(loadGame()).toEqual(g);
    saveGame(null);
    expect(loadGame()).toBeNull();
  });

  it('starts clean rather than crashing on a corrupt or half-written game', () => {
    const store = shim();
    store.set('bz.keeper', '{"players": not json');
    expect(loadGame()).toBeNull();
    store.set('bz.keeper', '{"targetScore":75}');   // no players, no rounds
    expect(loadGame()).toBeNull();
  });

  it('fills in a field added after a game was saved', () => {
    const store = shim();
    store.set('bz.keeper', JSON.stringify({ players: [], rounds: [], targetScore: 50 }));
    expect(loadGame()).toEqual(
      { players: [], rounds: [], targetScore: 50, snark: true, runningSince: null, pendingMs: null });
  });

  it('reads a game saved before rounds could be timed', () => {
    // Rounds used to be a bare map of scores. One saved that way must still open.
    const store = shim();
    store.set('bz.keeper', JSON.stringify({
      players: [{ id: 'tulip', name: 'Ann', badgeId: 'tulip' }], targetScore: 25,
      rounds: [{ tulip: { centerCount: 9, dashLeft: 0, delta: 9 } }],
    }));
    const loaded = loadGame()!;
    expect(loaded.rounds[0].ms).toBeNull();
    expect(loaded.rounds[0].scores.tulip.delta).toBe(9);
    expect(totals(loaded)).toEqual({ tulip: 9 });
  });

  it('reads a game saved while the Dash pile was still called blitz', () => {
    // A phone holding a game from before the field names caught up with the
    // screen. The old key is read, the new one is written back, and the
    // arithmetic is untouched - including who is credited with the dash, which
    // is worked out from the pile rather than stored.
    const store = shim();
    store.set('bz.keeper', JSON.stringify({
      players: [{ id: 'tulip', name: 'Ann', badgeId: 'tulip' },
                { id: 'star', name: 'Bo', badgeId: 'star' }], targetScore: 25,
      rounds: [{ ms: null, scores: { tulip: { centerCount: 9, blitzLeft: 0, delta: 9 },
                                     star: { centerCount: 2, blitzLeft: 5, delta: -8 } } }],
    }));
    const loaded = loadGame()!;
    expect(loaded.rounds[0].scores).toEqual({
      tulip: { centerCount: 9, dashLeft: 0, delta: 9 },
      star: { centerCount: 2, dashLeft: 5, delta: -8 },
    });
    expect(dasherOf(loaded.rounds[0].scores)).toBe('tulip');
    expect(totals(loaded)).toEqual({ tulip: 9, star: -8 });
  });

  it('keeps playing when the browser refuses to store anything', () => {
    // Safari in a private window throws on write rather than failing quietly.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} },
    });
    expect(() => saveGame(game())).not.toThrow();
  });
});
