import type { CenterSpace, PlaySource, Tableau } from './types';
import { canBuildOnPost, canPlayToSpace, sourceTop } from './rules';

export type BotLevel = 'easy' | 'medium' | 'hard';

export const BOT_LEVELS: BotLevel[] = ['easy', 'medium', 'hard'];
export const BOT_LABELS: Record<BotLevel, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard',
};

export interface BotProfile {
  /** milliseconds between actions - a bot's real difficulty is mostly its hands */
  minDelay: number; maxDelay: number;
  /** chance of taking a random legal move instead of the best one */
  sloppiness: number;
  /** chance of fumbling a turn entirely and doing nothing */
  dither: number;
}

export const BOT_PROFILES: Record<BotLevel, BotProfile> = {
  easy:   { minDelay: 1700, maxDelay: 3200, sloppiness: 0.8, dither: 0.25 },
  medium: { minDelay: 750,  maxDelay: 1600, sloppiness: 0.3, dither: 0.07 },
  hard:   { minDelay: 300,  maxDelay: 750,  sloppiness: 0.04, dither: 0 },
};

export type BotAction =
  | { kind: 'center'; source: PlaySource; space: number }
  | { kind: 'post'; source: PlaySource; post: number }
  | { kind: 'flip' };

export type Rng = () => number;

/** Every play the tableau can legally make right now, centre plays and post builds. */
export function botMoves(t: Tableau, spaces: CenterSpace[]): BotAction[] {
  const sources: PlaySource[] = [
    { kind: 'blitz' }, { kind: 'wood' },
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
 * empty the Blitz pile, so anything that takes a card off it - or empties a post
 * so the Blitz pile refills it - beats an otherwise identical wood play.
 */
export function rankMove(t: Tableau, a: BotAction): number {
  if (a.kind === 'flip') return 0;
  const fromBlitz = a.source.kind === 'blitz';
  // emptying a post pulls the next Blitz card down into it (see refillPosts)
  const frees = a.source.kind === 'post' && t.post[a.source.index].length === 1 && t.blitz.length > 0;
  const toCenter = a.kind === 'center';
  if (fromBlitz) return toCenter ? 100 : 90;
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
    // a sloppy bot sometimes turns wood over instead of spotting the move in front of it
    if (t.wood.length > t.woodIndex && rng() < 0.25) return { kind: 'flip' };
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
