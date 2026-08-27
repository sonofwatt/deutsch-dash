import type { CenterSpace, Tableau } from './types';
import { botMoves, rankMove } from './bot';

/**
 * How long a player must touch nothing before the hint appears. Long enough that
 * it never fires while somebody is playing at speed, short enough to be there by
 * the time they have actually got stuck looking.
 */
export const HINT_DELAY_MS = 5000;

/**
 * How long the hint stays on screen once it fires: two pulses, half a second
 * each, and then it is gone. A mark that sat there breathing indefinitely turns
 * into part of the furniture and stops being read at all. Kept in step with the
 * .pile-space.hint keyframes in game.css - the CSS does the pulsing, this decides
 * when the mark exists at all, which is also what makes it behave the same way
 * for somebody who has asked for reduced motion.
 */
export const HINT_SHOW_MS = 1000;

/**
 * And again this often, for as long as the player goes on not playing. A player
 * who is genuinely stuck has nothing on the grid to point at, so nothing shows
 * for them and the red band in the drop band is what speaks instead - but the
 * moment somebody else's card opens a move up, the next tick of this is what
 * says so. Any input at all restarts the whole cycle from HINT_DELAY_MS.
 */
export const HINT_REPEAT_MS = 10000;

/**
 * Which centre space to flash. The hint points at the DESTINATION, never at the
 * card in the player's own tableau: they still have to work out which of their
 * cards fits and drag it there, which is the part of the game worth keeping. It
 * is a nudge towards the board, not the move played for them.
 *
 * Reuses the bot's own move generation and ranking, so "best" means the same
 * thing here as it does to a Hard bot - one definition, not two that can drift.
 * Post-to-post moves have no square on the grid to point at and are skipped; if
 * the only thing available is one of those, nothing flashes.
 */
export function hintSpace(t: Tableau, spaces: CenterSpace[]): number | null {
  let best: { space: number; rank: number } | null = null;
  for (const move of botMoves(t, spaces)) {
    if (move.kind !== 'center') continue;
    const rank = rankMove(t, move);
    // Strictly greater, so equal ranks settle on the first space generated rather
    // than the last. An Ace fits every empty space at the same rank, and the hint
    // must not wander from one to another between renders.
    if (!best || rank > best.rank) best = { space: move.space, rank };
  }
  return best?.space ?? null;
}
