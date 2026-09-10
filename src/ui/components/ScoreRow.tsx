import { motion } from 'framer-motion';
import { badgeFor, EMOJI } from '../../game/badges';
import { signed, type Move } from '../scoreRanks';
import type { PlayerInfo, RoundScore } from '../../game/types';

/**
 * One player's line on the round-end and game-over sheets: the round's arithmetic
 * spelled out (`-4 +6 = +2`) followed by the running total.
 *
 * The sum is `RoundScore.delta` verbatim - the exact number `commitScores` added to
 * `player.score` - never recomputed here, so the displayed sum and total cannot
 * disagree. `score` is absent only defensively (game over with no round snapshot),
 * where the row degrades to a name and a total.
 *
 * `layout` is what slides a row past its neighbours when ScoreList reorders them;
 * `move` tints it for the trip. Both are inert until something actually reorders.
 */
export function ScoreRow(
  // `dashed` is optional like everything else here: render.test.ts builds these
  // props as complete literals and tsc -b typechecks it, so a REQUIRED prop
  // breaks the build rather than just the tests.
  { player, score, move, dashed, showReady, onPick, open }:
  { player: PlayerInfo; score?: RoundScore; move?: Move; dashed?: boolean;
    // The round-end sheet is a gate, so it says who the table is waiting on.
    // Game over is not, and passes nothing.
    showReady?: boolean;
    /** Given only when there is a history to open. Absent leaves a plain total. */
    onPick?: () => void; open?: boolean },
) {
  const badge = badgeFor(player.badgeId);
  // The state the table is waiting on, in the lobby's own three colours, drawn
  // AROUND THE NAME rather than as a dot beside it. An 8px dot in a 10px column
  // carried four meanings and was too small to read at a glance on a phone; the
  // name is already the thing an eye lands on, so the name is what says it.
  //
  // A bot has nothing to say here, and neither sheet says anything at all when it
  // is not a gate - the game-over sheet passes no `showReady`.
  const state = !showReady || player.isBot ? null
    : player.sittingOut ? { cls: 'out', label: 'Sitting out' }
    // Away outranks ready on purpose: a player who readied and then put their
    // phone down is not somebody the table should stop waiting for, and the
    // ready gate agrees (see tableReady).
    : player.awayAt != null ? { cls: 'away', label: 'Away' }
    : player.ready ? { cls: 'on', label: 'Ready' }
    : { cls: '', label: 'Not ready' };
  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className={`score-row${move ? ` moved-${move}` : ''}`}>
      <span className="chip" style={{ ['--badge' as string]: badge.color }}>{badge.glyph}</span>
      <span className={`score-name${state ? ` name-state ${state.cls}` : ''}`}
        title={state ? state.label : undefined} aria-label={state ? `${player.name}: ${state.label}` : undefined}>
        {player.name}
      </span>
      {/* A zero is quiet in both columns: red is for an actual penalty, and a
          dasher's "0" in danger red reads as a loss rather than a clean sweep. */}
      <span className={`score-math ${score?.dashLeft ? 'score-neg' : 'muted'}`}>
        {score ? signed(-2 * score.dashLeft) : ''}
      </span>
      <span className={`score-math ${score?.centerCount ? '' : 'muted'}`}>
        {score ? signed(score.centerCount) : ''}
      </span>
      <span className="score-math muted">{score ? '=' : ''}</span>
      <span className="score-math score-delta">{score ? signed(score.delta) : ''}</span>
      {/* The total is the handle for this player's history, because it is the
          number somebody is already looking at when they wonder how it got
          there. A sheet with no history to show leaves it as plain text rather
          than as a button that opens an empty box. */}
      <span className="score-total">
        {onPick
          ? <button className={`score-total-btn${open ? ' open' : ''}`} onClick={onPick}
              aria-expanded={open === true}
              aria-label={`${player.name}, ${player.score} points. Show round history.`}>
              {player.score}
            </button>
          : player.score}
      </span>
      {/* Who emptied their Dash pile, said once, on the row it belongs to. The
          column is always there so the totals stay in line down the sheet. */}
      <span className="score-dash" aria-label={dashed ? 'Dashed this round' : undefined}>
        {dashed ? '\u26a1' + EMOJI : ''}
      </span>
    </motion.div>
  );
}
