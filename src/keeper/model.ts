import { nextStats, type GameStats } from '../game/stats';
import { winnerIds } from '../game/scoring';
import type { BadgeId } from '../game/badges';
import type { RoundScore } from '../game/types';

export interface KeeperPlayer { id: string; name: string; badgeId: BadgeId }

/**
 * A game of Dutch Blitz played with real cards, where the phone is only the
 * scorepad. No room, no network, no accounts - it lives in localStorage on the
 * one device that gets passed around.
 *
 * A round is the same `RoundScore` the digital game produces, which is what lets
 * the scoreboard, the ranking animation, the stats and the commentary work here
 * without knowing a card was never dealt.
 */
export interface KeeperGame {
  players: KeeperPlayer[];
  targetScore: number;
  snark: boolean;
  rounds: Record<string, RoundScore>[];
}

export const MAX_KEEPER_PLAYERS = 8;
/** A Blitz pile is ten cards, and forty is a whole deck in the middle. */
export const MAX_BLITZ_LEFT = 10;
export const MAX_CENTER = 40;

export const emptyGame = (targetScore = 75): KeeperGame =>
  ({ players: [], targetScore, snark: true, rounds: [] });

export const roundScore = (centerCount: number, blitzLeft: number): RoundScore =>
  ({ centerCount, blitzLeft, delta: centerCount - 2 * blitzLeft });

/** Running totals after every round entered so far. Zero for a player with none. */
export function totals(game: KeeperGame): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of game.players) out[p.id] = 0;
  for (const round of game.rounds) {
    for (const [id, s] of Object.entries(round)) {
      if (id in out) out[id] += s.delta;
    }
  }
  return out;
}

/**
 * Who called Blitz, read off the numbers rather than asked for: the player who
 * finished with an empty Blitz pile. If two people are entered with none left,
 * nobody is credited - the round is unreadable rather than a guess.
 */
export function blitzerOf(round: Record<string, RoundScore>): string | null {
  const empty = Object.entries(round).filter(([, s]) => s.blitzLeft === 0);
  return empty.length === 1 ? empty[0][0] : null;
}

/** The winner, once somebody stands alone at or above the target. */
export function winnerOf(game: KeeperGame): string | null {
  const ids = winnerIds(totals(game), game.targetScore);
  return ids.length === 1 ? ids[0] : null;
}

/** The game-long tally, folded from the rounds rather than accumulated live. */
export function statsOf(game: KeeperGame): GameStats | null {
  if (game.rounds.length === 0) return null;
  const running: Record<string, number> = {};
  for (const p of game.players) running[p.id] = 0;
  let stats: GameStats | null = null;
  game.rounds.forEach((round, i) => {
    for (const [id, s] of Object.entries(round)) {
      if (id in running) running[id] += s.delta;
    }
    stats = nextStats(stats, {
      roundNumber: i + 1,
      scores: round,
      duels: null,                 // no races to see across a real table
      blitzedBy: blitzerOf(round),
      durationMs: null,            // nobody is holding a stopwatch
      stuckRounds: 0,
      totals: { ...running },
    });
  });
  return stats;
}
