import type { RoundScore } from './types';

export interface PlayerStats {
  dashes: number;
  lastPlaces: number;
  /** Consecutive rounds finishing bottom, reset the moment they are not. */
  lastStreak: number;
  racesWon: number;
  racesLost: number;
}

export interface DashRecord { uid: string; ms: number; round: number }
export interface RoundRecord { uid: string; delta: number; round: number }

/**
 * What the round-by-round scores cannot say on their own: streaks, records, and
 * who has never lost a race. Accumulated by the host inside `commitScores`, in
 * the same idempotent write as the scores, so it can never count a round twice.
 * Cleared on a rematch, because it describes one game.
 */
export interface GameStats {
  rounds: number;
  players: Record<string, PlayerStats>;
  /** Fastest dash of the game so far. */
  fastest: DashRecord | null;
  best: RoundRecord | null;   // biggest single-round gain
  worst: RoundRecord | null;  // biggest single-round loss
  /** Wood rotations forced by everybody being stuck at once, summed over rounds. */
  allStuck: number;
  races: number;
}

export const NO_PLAYER_STATS: PlayerStats =
  { dashes: 0, lastPlaces: 0, lastStreak: 0, racesWon: 0, racesLost: 0 };

export const statsFor = (stats: GameStats | null | undefined, uid: string): PlayerStats =>
  ({ ...NO_PLAYER_STATS, ...stats?.players?.[uid] });

export function normalizeStats(raw: unknown): GameStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<GameStats>;
  return {
    rounds: s.rounds ?? 0,
    players: s.players ?? {},
    fastest: s.fastest ?? null,
    best: s.best ?? null,
    worst: s.worst ?? null,
    allStuck: s.allStuck ?? 0,
    races: s.races ?? 0,
  };
}

export interface RoundOutcome {
  roundNumber: number;
  scores: Record<string, RoundScore>;
  duels: Record<string, Record<string, number>> | null;
  dashedBy: string | null;
  /** How long the round took, or null when it cannot be trusted - see plays.ts. */
  durationMs: number | null;
  stuckRounds: number;
  /** Totals AFTER this round, which is what decides who is bottom. */
  totals: Record<string, number>;
}

/** Pure: previous stats plus one finished round. Never mutates `prev`. */
export function nextStats(prev: GameStats | null, round: RoundOutcome): GameStats {
  const players: Record<string, PlayerStats> = {};
  for (const uid of Object.keys(round.totals)) players[uid] = statsFor(prev, uid);

  if (round.dashedBy && players[round.dashedBy]) players[round.dashedBy].dashes += 1;

  // Bottom of the table. Everybody level on the lowest total wears it, rather than
  // the sort order picking a scapegoat.
  const totals = Object.values(round.totals);
  if (totals.length > 1) {
    const bottom = Math.min(...totals);
    // Nobody is bottom if everybody is: an all-square table (every player -20 in a
    // round nobody scored in) was handing the whole room a last place each, and
    // three rounds of that had everyone on a "3 rounds running" losing streak.
    const level = bottom === Math.max(...totals);
    for (const [uid, p] of Object.entries(players)) {
      if (!level && round.totals[uid] === bottom) { p.lastPlaces += 1; p.lastStreak += 1; }
      else p.lastStreak = 0;
    }
  }

  let races = prev?.races ?? 0;
  for (const [loser, against] of Object.entries(round.duels ?? {})) {
    for (const [winner, n] of Object.entries(against ?? {})) {
      if (typeof n !== 'number' || n <= 0) continue;
      races += n;
      if (players[loser]) players[loser].racesLost += n;
      if (players[winner]) players[winner].racesWon += n;
    }
  }

  let best = prev?.best ?? null;
  let worst = prev?.worst ?? null;
  for (const [uid, s] of Object.entries(round.scores)) {
    if (!players[uid]) continue;
    if (!best || s.delta > best.delta) best = { uid, delta: s.delta, round: round.roundNumber };
    if (!worst || s.delta < worst.delta) worst = { uid, delta: s.delta, round: round.roundNumber };
  }

  let fastest = prev?.fastest ?? null;
  if (round.dashedBy && round.durationMs != null
      && (!fastest || round.durationMs < fastest.ms)) {
    fastest = { uid: round.dashedBy, ms: round.durationMs, round: round.roundNumber };
  }

  return {
    rounds: Math.max(round.roundNumber, prev?.rounds ?? 0),
    players, fastest, best, worst,
    allStuck: (prev?.allStuck ?? 0) + round.stuckRounds,
    races,
  };
}
