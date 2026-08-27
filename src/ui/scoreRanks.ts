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
 * **Movement is counted as overtakes, not as a change of row.** `places[id]` is
 * how many players this one was strictly behind and is now strictly ahead of,
 * minus how many went the other way; `move` is just its sign. Both comparisons
 * are strict, so *being level with somebody and then beating them is not a
 * place gained* - and that is the whole point. Before round one every player is
 * on zero, so ranking them by row would have the first round's standings read as
 * everyone leaping over everyone else, purely along the order they joined the
 * room in. A playtest duly reported "dropped 2 places" after round one. Nobody
 * moved: they were level, and the round decided an order for the first time.
 *
 * `previous` is ordered the same way for the same reason. Players tied before the
 * round are listed in the order they ended it in, so a tie the round happens to
 * break slides nothing across the sheet - the rows land where they belong and
 * only a genuine overtake is acted out.
 */
export function rankRows(
  players: Record<string, PlayerInfo>, scores?: Record<string, RoundScore> | null,
): { previous: string[]; current: string[]; move: Record<string, Move>; places: Record<string, number> } {
  const ids = Object.keys(players);
  const before = (id: string) => players[id].score - (scores?.[id]?.delta ?? 0);
  const after = (id: string) => players[id].score;
  const current = [...ids].sort((a, b) => after(b) - after(a));
  const rankNow = new Map(current.map((id, i) => [id, i]));
  const previous = [...ids].sort((a, b) => before(b) - before(a) || rankNow.get(a)! - rankNow.get(b)!);

  const places: Record<string, number> = {};
  const move: Record<string, Move> = {};
  for (const id of ids) {
    let net = 0;
    for (const other of ids) {
      if (other === id) continue;
      if (before(other) > before(id) && after(id) > after(other)) net += 1;
      else if (before(id) > before(other) && after(other) > after(id)) net -= 1;
    }
    places[id] = net;
    move[id] = net > 0 ? 'up' : net < 0 ? 'down' : null;
  }
  return { previous, current, move, places };
}
