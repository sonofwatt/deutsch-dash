import type { PlayerInfo } from '../game/types';

/** What the splash throws at this particular viewer. */
export type SplashVariant = 'glitter' | 'poo' | 'crying';

/**
 * The blitzer gets glitter. Everyone else cries - except, at three or more
 * players, whoever is propping up the scoreboard, who gets something worse.
 *
 * "Worst score" is the running total on screen, not this round's delta: the
 * splash fires the moment blitz is announced, before the host has committed any
 * scores. Ties all get it. If the blitzer is the one holding the worst score
 * then nobody does - they just won the round, and glitter beats poo.
 */
export function splashVariant(
  players: Record<string, PlayerInfo>, blitzedBy: string, uid: string | null,
): SplashVariant {
  if (uid === blitzedBy) return 'glitter';
  const scores = Object.values(players).map(p => p.score);
  if (scores.length <= 2) return 'crying';
  const worst = Math.min(...scores);
  const me = uid ? players[uid] : undefined;
  return me && me.score === worst ? 'poo' : 'crying';
}
