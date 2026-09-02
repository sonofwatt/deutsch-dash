import { nextStats, type GameStats } from '../game/stats';
import { winnerIds } from '../game/scoring';
import type { BadgeId } from '../game/badges';
import type { RoundScore } from '../game/types';

export interface KeeperPlayer { id: string; name: string; badgeId: BadgeId }

/**
 * A game played with real cards at a real table, where the phone is only the
 * scorepad. No room, no network, no accounts - it lives in localStorage on the
 * one device that gets passed around.
 *
 * A round is the same `RoundScore` the digital game produces, which is what lets
 * the scoreboard, the ranking animation, the stats and the commentary work here
 * without knowing a card was never dealt.
 */
export interface KeeperRound {
  scores: Record<string, RoundScore>;
  /** How long the round took, when it was timed and the number is believable. */
  ms: number | null;
}

export interface KeeperGame {
  players: KeeperPlayer[];
  targetScore: number;
  snark: boolean;
  rounds: KeeperRound[];
  /** Epoch ms the round in progress was started at, or null if nothing is running. */
  runningSince: number | null;
  /** A finished round's length, held between stopping the clock and entering the scores. */
  pendingMs: number | null;
}

export const MAX_KEEPER_PLAYERS = 8;
/** A Dash pile is ten cards, and forty is a whole deck in the middle. */
export const MAX_DASH_LEFT = 10;
export const MAX_CENTER = 40;

export const emptyGame = (targetScore = 75): KeeperGame =>
  ({ players: [], targetScore, snark: true, rounds: [], runningSince: null, pendingMs: null });

/**
 * A timed round only counts if the number is believable. Ten seconds is faster
 * than a deal, and an hour means somebody started the clock and went to lunch -
 * either way it would put nonsense in the commentary, so it is thrown away
 * rather than recorded.
 */
export const TIMED_MIN_MS = 10_000;
export const TIMED_MAX_MS = 60 * 60_000;
export const believableMs = (ms: number): number | null =>
  (ms >= TIMED_MIN_MS && ms <= TIMED_MAX_MS ? ms : null);

export const roundScore = (centerCount: number, dashLeft: number): RoundScore =>
  ({ centerCount, dashLeft, delta: centerCount - 2 * dashLeft });

/** Running totals after every round entered so far. Zero for a player with none. */
export function totals(game: KeeperGame): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of game.players) out[p.id] = 0;
  for (const round of game.rounds) {
    for (const [id, s] of Object.entries(round.scores)) {
      if (id in out) out[id] += s.delta;
    }
  }
  return out;
}

/**
 * Who called Dash, read off the numbers rather than asked for: the player who
 * finished with an empty Dash pile. If two people are entered with none left,
 * nobody is credited - the round is unreadable rather than a guess.
 */
export function dasherOf(round: Record<string, RoundScore>): string | null {
  const empty = Object.entries(round).filter(([, s]) => s.dashLeft === 0);
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
    for (const [id, s] of Object.entries(round.scores)) {
      if (id in running) running[id] += s.delta;
    }
    stats = nextStats(stats, {
      roundNumber: i + 1,
      scores: round.scores,
      duels: null,                 // no races to see across a real table
      dashedBy: dasherOf(round.scores),
      durationMs: round.ms,
      stuckRounds: 0,
      totals: { ...running },
    });
  });
  return stats;
}
