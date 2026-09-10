import { signed } from '../scoreRanks';
import type { RoundHistory } from '../../game/stats';

/**
 * One player's game so far, opened from their total on a score sheet.
 *
 * The data is `stats.history`, written by the host inside `commitScores` with the
 * rest of the tally. That matters for what this can promise: the tally is the
 * commit's SECOND write and its failure is swallowed on purpose, so that a
 * decoration can never take a round's scoring down with it. A round can therefore
 * be missing from here while its score is perfectly real on the sheet above, and
 * a game that began before this existed has no history at all. Both say so
 * plainly rather than rendering an empty box.
 *
 * A round with a total but no delta is a round this player sat out: their total
 * did not move and there is no arithmetic to show for it.
 */
export function ScoreHistory(
  { history, uid, name }:
  { history: Record<string, RoundHistory>; uid: string; name: string },
) {
  const rounds = Object.keys(history)
    .map(Number)
    .filter(n => Number.isFinite(n) && history[String(n)].total[uid] != null)
    .sort((a, b) => a - b);

  return (
    <div className="score-history" role="region" aria-label={`${name}'s round history`}>
      {rounds.length === 0
        ? <p className="muted">No rounds recorded yet.</p>
        : rounds.map(n => {
            const line = history[String(n)];
            const d = line.delta[uid];
            return (
              <div key={n} className="score-history-row">
                <span className="muted">Round {n}</span>
                <span className={`score-math${d != null && d < 0 ? ' score-neg' : d == null ? ' muted' : ''}`}>
                  {d == null ? 'sat out' : signed(d)}
                </span>
                <span className="score-total-plain">{line.total[uid]}</span>
              </div>
            );
          })}
    </div>
  );
}
