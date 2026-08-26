import { BADGES } from '../../game/badges';
import type { PlayerInfo, RoundScore } from '../../game/types';

/** "+6" / "-4" / "0" — a signed zero in the middle of the arithmetic reads as a typo.
    Kept module-private: exporting a non-component from a component file costs an
    oxlint react(only-export-components) warning, and the baseline is zero new ones. */
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * One player's line on the round-end and game-over sheets: the round's arithmetic
 * spelled out (`-4 +6 = +2`) followed by the running total.
 *
 * The sum is `RoundScore.delta` verbatim — the exact number `commitScores` added to
 * `player.score` — never recomputed here, so the displayed sum and total cannot
 * disagree. `score` is absent only defensively (game over with no round snapshot),
 * where the row degrades to a name and a total.
 */
export function ScoreRow({ player, score }: { player: PlayerInfo; score?: RoundScore }) {
  const badge = BADGES[player.badgeId];
  return (
    <div className="score-row">
      <span className="chip" style={{ ['--badge' as string]: badge.color }}>{badge.glyph}</span>
      <span className="score-name">{player.name}</span>
      {/* Red is for an actual penalty: a blitzer's "0" in red reads as a loss. */}
      <span className={`score-math ${score?.blitzLeft ? 'score-neg' : 'muted'}`}>
        {score ? signed(-2 * score.blitzLeft) : ''}
      </span>
      <span className="score-math">{score ? signed(score.centerCount) : ''}</span>
      <span className="score-math muted">{score ? '=' : ''}</span>
      <span className="score-math score-delta">{score ? signed(score.delta) : ''}</span>
      <span className="score-total">{player.score}</span>
    </div>
  );
}
