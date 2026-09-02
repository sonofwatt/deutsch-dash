import { useState } from 'react';
import { canPlayToSpace, sourceTop } from '../game/rules';
import { cardId, type CenterSpace, type Suit, type Tableau } from '../game/types';

/** A space that just moved under somebody else's card, and that you can use. */
export interface Opening { suit: Suit; at: number }

/**
 * The cards a player could actually play right now: the top of the Dash pile,
 * the turned-over wood card, and the top of each post. Everything face up, which
 * is the same set the player can see - a glow for a card buried in the wood pile
 * would be pointing at something they cannot reach.
 */
function visibleTops(t: Tableau) {
  return [
    sourceTop(t, { kind: 'dash' }),
    sourceTop(t, { kind: 'wood' }),
    ...t.post.map((_, i) => sourceTop(t, { kind: 'post', index: i })),
  ].filter(c => c != null);
}

/**
 * Which spaces became playable for me because somebody else just played there.
 *
 * Only shown when the host has turned Helper hints on (see `useOpenings`). It is
 * a smaller advantage than the five-second hint - it points at a change rather
 * than at your best move - but it is the same KIND of advantage, and the bots
 * were tuned against a human playing without one. One switch, one answer for the
 * whole room.
 *
 * The board is up to 32 slots on a phone. A card landing on one of them is
 * genuinely easy to miss, and the case that matters is the one where that card
 * is the one you were waiting for. This says "that space just moved, and you can
 * use it", in the colour of the card now sitting on it.
 *
 * Deliberately NOT a standing highlight of every playable space - that would be
 * the game played for you. Three things all have to be true, and they are all
 * about the change rather than about the board:
 *
 * - the top card actually changed (an unchanged space is not news),
 * - somebody else put it there (my own play is not news to me),
 * - and I hold a visible card that fits it.
 *
 * `at` is a nonce for the view exactly as in raceFlash: it keys the element so a
 * second opening on the same space remounts and replays. Nothing compares it to
 * the clock.
 */
export function openingsAfter(
  prev: CenterSpace[], next: CenterSpace[], hand: Tableau, uid: string, at: number,
): Record<number, Opening> {
  const out: Record<number, Opening> = {};
  const mine = visibleTops(hand);
  if (mine.length === 0) return out;
  for (let i = 0; i < next.length; i++) {
    const space = next[i];
    const top = space.stack[space.stack.length - 1];
    // A space that was just CLEARED (a finished 1..10 pile) has no card to take a
    // colour from, and is open to every Ace on the table rather than to me.
    if (!top || top.owner === uid) continue;
    const before = prev[i]?.stack[prev[i].stack.length - 1];
    if (before && cardId(before) === cardId(top)) continue;
    if (!mine.some(card => canPlayToSpace(card, space))) continue;
    out[i] = { suit: top.suit, at };
  }
  return out;
}

/**
 * The openings this player has been shown so far this round.
 *
 * Derived DURING RENDER off the identity of `spaces`, using React's documented
 * "adjust state when a prop changes" pattern: a snapshot is already causing a
 * render, so doing this in an effect would only be a second one. Setting state
 * here makes React discard this pass and re-run immediately, and the re-run sees
 * `from === spaces` and stops - so it cannot loop, and it is idempotent under
 * StrictMode's double render.
 *
 * Entries accumulate and are never cleaned up, exactly like the race flashes:
 * each is keyed by its own nonce, so a newer opening on the same space remounts
 * the element, and a spent one is an element sitting at opacity 0.
 */
interface Seen { from: CenterSpace[] | null; seq: number; shown: Record<number, Opening> }

export function useOpenings(
  spaces: CenterSpace[], hand: Tableau | null, uid: string, enabled: boolean,
): Record<number, Opening> {
  const [seen, setSeen] = useState<Seen>(() => ({ from: null, seq: 0, shown: {} }));
  if (seen.from !== spaces) {
    // No previous board means this is the first snapshot of the round: there is
    // nothing to have changed against, so it only records where we came in.
    //
    // `enabled` skips the COMPARISON but not the record of where we are, so a
    // host turning hints on mid-round gets openings from the next play onward
    // rather than a burst of everything that happened while they were off.
    const found = seen.from && hand && enabled
      ? openingsAfter(seen.from, spaces, hand, uid, seen.seq + 1)
      : {};
    const any = Object.keys(found).length > 0;
    setSeen({
      from: spaces,
      seq: any ? seen.seq + 1 : seen.seq,
      shown: any ? { ...seen.shown, ...found } : seen.shown,
    });
  }
  return seen.shown;
}
