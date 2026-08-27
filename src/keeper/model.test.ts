import { describe, it, expect, afterEach } from 'vitest';
import {
  blitzerOf, emptyGame, roundScore, statsOf, totals, winnerOf, type KeeperGame,
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
    expect(roundScore(9, 0)).toEqual({ centerCount: 9, blitzLeft: 0, delta: 9 });
    expect(roundScore(3, 4)).toEqual({ centerCount: 3, blitzLeft: 4, delta: -5 });
  });

  it('adds the rounds up, and ignores a player who has since been removed', () => {
    const g = game({ rounds: [
      { tulip: roundScore(9, 0), star: roundScore(2, 5), ghost: roundScore(50, 0) },
      { tulip: roundScore(4, 3), star: roundScore(6, 1) },
    ] });
    expect(totals(g)).toEqual({ tulip: 7, star: -4 });
  });

  it('starts everyone on zero before a round is entered', () => {
    expect(totals(game())).toEqual({ tulip: 0, star: 0 });
  });

  it('reads the blitzer off the numbers rather than asking who won', () => {
    expect(blitzerOf({ tulip: roundScore(9, 0), star: roundScore(2, 5) })).toBe('tulip');
    expect(blitzerOf({ tulip: roundScore(4, 2), star: roundScore(2, 5) })).toBeNull();
    // Two empty piles cannot both be right, so credit neither rather than guess.
    expect(blitzerOf({ tulip: roundScore(9, 0), star: roundScore(7, 0) })).toBeNull();
  });

  it('declares a winner only when somebody stands alone at the target', () => {
    const won = game({ targetScore: 25, rounds: [{ tulip: roundScore(30, 0), star: roundScore(1, 2) }] });
    expect(winnerOf(won)).toBe('tulip');
    const tied = game({ targetScore: 25, rounds: [{ tulip: roundScore(30, 0), star: roundScore(30, 0) }] });
    expect(winnerOf(tied)).toBeNull();   // level at the top plays another round
    expect(winnerOf(game({ targetScore: 25 }))).toBeNull();
  });

  it('folds the rounds into the same stats the online game keeps', () => {
    const g = game({ rounds: [
      { tulip: roundScore(9, 0), star: roundScore(2, 5) },
      { tulip: roundScore(5, 2), star: roundScore(1, 6) },
    ] });
    const stats = statsOf(g)!;
    expect(stats.rounds).toBe(2);
    expect(statsFor(stats, 'tulip').blitzes).toBe(1);      // only round one was emptied
    expect(statsFor(stats, 'star').lastStreak).toBe(2);
    expect(stats.races).toBe(0);                           // nothing to race across a table
    expect(stats.fastest).toBeNull();                      // nobody is holding a stopwatch
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
    const g = game({ rounds: [{ tulip: roundScore(9, 0), star: roundScore(2, 5) }], snark: false });
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
    expect(loadGame()).toEqual({ players: [], rounds: [], targetScore: 50, snark: true });
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
