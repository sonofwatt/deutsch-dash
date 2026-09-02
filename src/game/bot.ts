import type { CenterSpace, PlaySource, Tableau } from './types';
import { canBuildOnPost, canPlayToSpace, sourceTop } from './rules';

export type BotLevel = 'easy' | 'medium' | 'hard' | 'genius';

export const BOT_LEVELS: BotLevel[] = ['easy', 'medium', 'hard', 'genius'];
export const BOT_LABELS: Record<BotLevel, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard', genius: 'Genius',
};

export interface BotProfile {
  /** milliseconds between actions - a bot's real difficulty is mostly its hands */
  minDelay: number; maxDelay: number;
  /** chance of taking a random legal move instead of the best one */
  sloppiness: number;
  /** chance of fumbling a turn entirely and doing nothing */
  dither: number;
  /** when being sloppy, chance of turning wood over instead of playing at all */
  distracted: number;
}

/**
 * Tuned down TWICE, and the second time by moving the whole ladder rather than
 * by nudging numbers. Easy was still beating a casual human after the first pass
 * (2026-08-25) and again after a real game (2026-08-29), so every level now
 * inherits the settings of the level below it: medium is the old easy, hard is
 * the old medium, and a genuinely feeble easy was written underneath them all.
 *
 * A bot punches above its settings because it never makes an ILLEGAL move and
 * never loses track of the board, so the only honest handicaps are speed and
 * attention - which is why the knobs here are all rate and distraction and none
 * of them is "plays worse cards".
 *
 * What matters is the effective rate, delay / (1 - dither):
 *   easy ~9.2s per action, medium ~4.9s, hard ~2.3s, genius ~0.5s.
 * Genius is deliberately about twice the old hard (~1.1s) and takes the best
 * move it can see nearly every time - it is meant to be unpleasant.
 */
export const BOT_PROFILES: Record<BotLevel, BotProfile> = {
  easy:   { minDelay: 4200, maxDelay: 7200, sloppiness: 0.97, dither: 0.38, distracted: 0.6 },
  medium: { minDelay: 2600, maxDelay: 4800, sloppiness: 0.9,  dither: 0.25, distracted: 0.45 },
  hard:   { minDelay: 1400, maxDelay: 2600, sloppiness: 0.5,  dither: 0.12, distracted: 0.25 },
  genius: { minDelay: 320,  maxDelay: 700,  sloppiness: 0.02, dither: 0,    distracted: 0 },
};

export type BotAction =
  | { kind: 'center'; source: PlaySource; space: number }
  | { kind: 'post'; source: PlaySource; post: number }
  | { kind: 'flip' };

export type Rng = () => number;

/** Every play the tableau can legally make right now, centre plays and post builds. */
export function botMoves(t: Tableau, spaces: CenterSpace[]): BotAction[] {
  const sources: PlaySource[] = [
    { kind: 'dash' }, { kind: 'wood' },
    ...t.post.map((_, index) => ({ kind: 'post' as const, index })),
  ];
  const out: BotAction[] = [];
  for (const source of sources) {
    const card = sourceTop(t, source);
    if (!card) continue;
    spaces.forEach((sp, space) => {
      if (canPlayToSpace(card, sp)) out.push({ kind: 'center', source, space });
    });
    t.post.forEach((stack, post) => {
      if (source.kind === 'post' && source.index === post) return;
      if (canBuildOnPost(card, stack)) out.push({ kind: 'post', source, post });
    });
  }
  return out;
}

/**
 * How good a move is, in Dutch Blitz terms: the only way to win a round is to
 * empty the Dash pile, so anything that takes a card off it - or empties a post
 * so the Dash pile refills it - beats an otherwise identical wood play.
 */
export function rankMove(t: Tableau, a: BotAction): number {
  if (a.kind === 'flip') return 0;
  const fromDash = a.source.kind === 'dash';
  // emptying a post pulls the next Dash card down into it (see refillPosts)
  const frees = a.source.kind === 'post' && t.post[a.source.index].length === 1 && t.dash.length > 0;
  const toCenter = a.kind === 'center';
  if (fromDash) return toCenter ? 100 : 90;
  if (frees) return toCenter ? 80 : 45;
  if (a.source.kind === 'wood') return toCenter ? 70 : 40;
  return toCenter ? 60 : 20;
}

/**
 * Pick this tick's action. Difficulty is speed first (BOT_PROFILES) and judgement
 * second: a sloppy bot still only makes legal moves, it just often takes a worse
 * one, which is what a distracted human looks like from across the table.
 */
export function chooseBotAction(
  t: Tableau, spaces: CenterSpace[], level: BotLevel, rng: Rng = Math.random,
): BotAction | null {
  const p = BOT_PROFILES[level];
  if (rng() < p.dither) return null;
  const moves = botMoves(t, spaces);
  if (moves.length === 0) {
    // nothing playable: turn over the next three, which also recycles a spent pile
    return t.wood.length > 0 ? { kind: 'flip' } : null;
  }
  if (rng() < p.sloppiness) {
    // a distracted bot turns wood over instead of spotting the move in front of it
    if (t.wood.length > t.woodIndex && rng() < p.distracted) return { kind: 'flip' };
    return moves[Math.floor(rng() * moves.length)];
  }
  let best = moves[0];
  let bestScore = rankMove(t, best);
  for (const m of moves.slice(1)) {
    const s = rankMove(t, m);
    if (s > bestScore) { best = m; bestScore = s; }
  }
  return best;
}

export function botDelay(level: BotLevel, rng: Rng = Math.random): number {
  const p = BOT_PROFILES[level];
  return Math.round(p.minDelay + rng() * (p.maxDelay - p.minDelay));
}

/** Deterministic, readable, and collision-free because badges are unique in a room. */
export function botId(badgeId: string): string { return `bot_${badgeId}`; }
export function isBotId(uid: string): boolean { return uid.startsWith('bot_'); }
