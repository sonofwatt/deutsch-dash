import { motion } from 'framer-motion';
import { BADGES, EMOJI } from '../../game/badges';
import { signed, type Move } from '../scoreRanks';
import type { PlayerInfo, RoundScore } from '../../game/types';

/**
 * One player's line on the round-end and game-over sheets: the round's arithmetic
 * spelled out (`-4 +6 = +2`) followed by the running total.
 *
 * The sum is `RoundScore.delta` verbatim — the exact number `commitScores` added to
 * `player.score` — never recomputed here, so the displayed sum and total cannot
 * disagree. `score` is absent only defensively (game over with no round snapshot),
 * where the row degrades to a name and a total.
 *
 * `layout` is what slides a row past its neighbours when ScoreList reorders them;
 * `move` tints it for the trip. Both are inert until something actually reorders.
 */
export function ScoreRow(
  // `blitzed` is optional like everything else here: render.test.ts builds these
  // props as complete literals and tsc -b typechecks it, so a REQUIRED prop
  // breaks the build rather than just the tests.
  { player, score, move, blitzed }:
  { player: PlayerInfo; score?: RoundScore; move?: Move; blitzed?: boolean },
) {
  const badge = BADGES[player.badgeId];
  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className={`score-row${move ? ` moved-${move}` : ''}`}>
      <span className="chip" style={{ ['--badge' as string]: badge.color }}>{badge.glyph}</span>
      <span className="score-name">{player.name}</span>
      {/* A zero is quiet in both columns: red is for an actual penalty, and a
          blitzer's "0" in danger red reads as a loss rather than a clean sweep. */}
      <span className={`score-math ${score?.blitzLeft ? 'score-neg' : 'muted'}`}>
        {score ? signed(-2 * score.blitzLeft) : ''}
      </span>
      <span className={`score-math ${score?.centerCount ? '' : 'muted'}`}>
        {score ? signed(score.centerCount) : ''}
      </span>
      <span className="score-math muted">{score ? '=' : ''}</span>
      <span className="score-math score-delta">{score ? signed(score.delta) : ''}</span>
      <span className="score-total">{player.score}</span>
      {/* Who emptied their Blitz pile, said once, on the row it belongs to. The
          column is always there so the totals stay in line down the sheet. */}
      <span className="score-blitz" aria-label={blitzed ? 'Blitzed this round' : undefined}>
        {blitzed ? '\u26a1' + EMOJI : ''}
      </span>
    </motion.div>
  );
}
