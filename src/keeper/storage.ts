import { emptyGame, type KeeperGame, type KeeperRound } from './model';
import type { RoundScore } from '../game/types';

const KEY = 'bz.keeper';

/**
 * The scorepad's whole persistence layer. A game of Dutch Blitz outlasts a
 * screen lock, a stray back-swipe and a browser deciding to reload the tab, and
 * losing forty minutes of scores to any of those would be the end of using this.
 *
 * Every read and write is guarded twice over: `typeof localStorage` because the
 * test environment has no DOM at all, and try/catch because Safari in private
 * mode throws on write rather than failing quietly.
 */
export function loadGame(): KeeperGame | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<KeeperGame>;
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.rounds)) return null;
    return {
      ...emptyGame(),
      ...parsed,
      players: parsed.players,
      rounds: parsed.rounds.map(asRound),
    };
  } catch {
    return null;   // corrupt or unreadable: start clean rather than crash on launch
  }
}

/** Rounds were a bare map of scores before they could be timed. */
function asRound(raw: unknown): KeeperRound {
  const r = (raw ?? {}) as Partial<KeeperRound>;
  if (r.scores && typeof r.scores === 'object') {
    return { scores: asScores(r.scores), ms: typeof r.ms === 'number' ? r.ms : null };
  }
  return { scores: asScores(raw as Record<string, RoundScore>), ms: null };
}

/**
 * The pile was called `blitzLeft` in the code until the field names were made to
 * match what the screen has always said, and a game saved on somebody's phone
 * before that still spells it the old way. Read it, write `dashLeft`, and the
 * next save drops the old key. Without this the penalty column reads NaN and
 * nobody is credited with the dash - a game in progress becomes unreadable,
 * which is the one thing this whole module exists to prevent.
 */
function asScores(raw: Record<string, RoundScore> | undefined): Record<string, RoundScore> {
  const out: Record<string, RoundScore> = {};
  for (const [id, s] of Object.entries(raw ?? {})) {
    const left = s.dashLeft ?? (s as RoundScore & { blitzLeft?: number }).blitzLeft ?? 0;
    out[id] = { centerCount: s.centerCount, dashLeft: left, delta: s.delta };
  }
  return out;
}

export function saveGame(game: KeeperGame | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (game) localStorage.setItem(KEY, JSON.stringify(game));
    else localStorage.removeItem(KEY);
  } catch {
    // Out of quota or a private window: the game keeps working, it just will not
    // survive a reload. Nothing here is worth interrupting a round for.
  }
}
