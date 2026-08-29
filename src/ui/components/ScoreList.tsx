import { useEffect, useState } from 'react';
import { ScoreRow } from './ScoreRow';
import { rankRows } from '../scoreRanks';
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
  { players, scores, blitzedBy }:
  { players: Record<string, PlayerInfo>; scores?: Record<string, RoundScore> | null;
    blitzedBy?: string | null },
) {
  const { previous, current, move } = rankRows(players, scores);
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
        <ScoreRow key={id} player={players[id]} score={scores?.[id] ?? undefined}
          move={settled ? move[id] : null} blitzed={id === blitzedBy} />
      ))}
    </>
  );
}
