import { Fragment, useEffect, useState } from 'react';
import { ScoreRow } from './ScoreRow';
import { ScoreHistory } from './ScoreHistory';
import { rankRows } from '../scoreRanks';
import type { RoundHistory } from '../../game/stats';
import type { PlayerInfo, RoundScore } from '../../game/types';

/**
 * The scoreboard, which shows the round's effect on the standings by acting it
 * out: rows mount in last round's order and then reorder into this one, sliding
 * past each other (framer-motion `layout`), tinted green on the way up and red on
 * the way down.
 *
 * The delay before the swap is what makes it readable - land in the old order,
 * let the eye settle, then move. Rendered statically (tests, any SSR) no effect
 * runs, so the sheet is simply the previous order with no tint, which is the
 * correct still frame of this animation rather than a broken one.
 */
export function ScoreList(
  { players, scores, dashedBy, showReady, history }:
  { players: Record<string, PlayerInfo>; scores?: Record<string, RoundScore> | null;
    dashedBy?: string | null; showReady?: boolean;
    /** The game so far. Absent means no total is a button. */
    history?: Record<string, RoundHistory> | null },
) {
  const { previous, current, move } = rankRows(players, scores);
  // Whose history is open, and only ever one: two of them open at once turns the
  // sheet into a wall of numbers, and the question being asked is about one
  // player. Tapping the same total again closes it.
  const [open, setOpen] = useState<string | null>(null);
  // Reduced motion starts settled: the final order at once, still tinted, no slide.
  // The guard matters - there is no DOM in the test environment, and an unguarded
  // matchMedia would throw the moment this module is imported there.
  const [settled, setSettled] = useState(() =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (settled) return;
    const t = setTimeout(() => setSettled(true), 400);
    return () => clearTimeout(t);
  }, [settled]);

  const order = settled ? current : previous;
  return (
    <>
      {order.map(id => (
        <Fragment key={id}>
          <ScoreRow player={players[id]} score={scores?.[id] ?? undefined}
            move={settled ? move[id] : null} dashed={id === dashedBy} showReady={showReady}
            open={open === id}
            onPick={history ? () => setOpen(o => (o === id ? null : id)) : undefined} />
          {/* Under the row it belongs to, so it stays attached to its player while
              the rows above are still sliding into their new order. */}
          {history && open === id &&
            <ScoreHistory history={history} uid={id} name={players[id].name} />}
        </Fragment>
      ))}
    </>
  );
}
