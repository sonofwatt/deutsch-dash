import type { PlayerInfo, RoundScore } from '../game/types';

export type Move = 'up' | 'down' | null;

/** "+6" / "-4" / "0" - a signed zero in the middle of arithmetic reads as a typo. */
export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * Where every player sat before this round and where they sit now.
 *
 * The previous standing is derived, not remembered: `player.score` already
 * includes this round, so subtracting `RoundScore.delta` - the exact number
 * `commitScores` added - gives the total the sheet would have shown last time.
 * That keeps the animation honest without storing a scoreboard history in RTDB.
 *
 * Both orders use the same tie-break (insertion order, which for a room straight
 * out of RTDB is key order), so players level on points never trade places for
 * no reason.
 */
export function rankRows(
  players: Record<string, PlayerInfo>, scores?: Record<string, RoundScore> | null,
): { previous: string[]; current: string[]; move: Record<string, Move> } {
  const ids = Object.keys(players);
  const before = (id: string) => players[id].score - (scores?.[id]?.delta ?? 0);
  const current = [...ids].sort((a, b) => players[b].score - players[a].score);
  const previous = [...ids].sort((a, b) => before(b) - before(a));
  const move: Record<string, Move> = {};
  for (const id of ids) {
    const was = previous.indexOf(id);
    const now = current.indexOf(id);
    move[id] = was === now ? null : was > now ? 'up' : 'down';
  }
  return { previous, current, move };
}
