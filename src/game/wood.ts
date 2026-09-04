import type { Card, Tableau } from './types';

/**
 * How many cards a wood turn brings over. Three is the game; one is the host's
 * way out of a table where nobody can move (RoomMeta.singleFlip), because a
 * three-at-a-time cycle only ever exposes every third card and a deadlock is
 * usually one of the two it never shows.
 */
export const WOOD_STEP = 3;

export function flipWood(t: Tableau, step: number = WOOD_STEP): Tableau {
  const len = t.wood.length;
  if (len === 0) return t;
  const faceDown = len - t.woodIndex;
  // The ordinary turn: three more off the top of the face-down pile.
  if (faceDown >= step) return { ...t, woodIndex: t.woodIndex + step };

  // The pile ran out part-way through a turn. A turn brings three cards, so the
  // rest of it comes from the pile being turned over, and this is that move:
  //
  //   turn the last one or two face up, put every card that was ALREADY face up
  //   back under them face down, and finish the turn off the top of those.
  //
  // Rotating the array left by the old index is exactly that. The cards still
  // face down keep their order at the front, the older ones follow them round,
  // and the three cards of this turn end up as the new face-up prefix - which is
  // what makes them all three visible on the pile, and what a hand of real cards
  // does. `woodIndex` counts the face-up prefix, so it lands on the step itself.
  //
  // It reorders the pile, so a caller that persists the index ALONE would leave
  // the stored hand describing different cards. See `flip` in `state/store.ts`.
  const wood = [...t.wood.slice(t.woodIndex), ...t.wood.slice(0, t.woodIndex)];
  return { ...t, wood, woodIndex: Math.min(step, len) };
}

/**
 * Take the face-up top card out of the pile and put it at the very bottom.
 *
 * The way out of a hand that cannot move. Turning three at a time exposes only
 * every third card WHEN THE PILE IS A MULTIPLE OF THREE - which is exactly how a
 * round is dealt, at 27 - so a player can be genuinely stuck holding a pile full
 * of playable cards (see woodCycleTops). Sinking ONE card shifts every subsequent
 * turn by one, which moves the set the cycle reaches. It is a deliberate action
 * rather than something the game does for them: it costs a card out of the
 * running order, and the player should be the one spending it.
 *
 * It matters less than it used to, and deliberately so: since a turn carries its
 * count across the turn-over, any pile whose length is not a multiple of three
 * reaches every card on its own, and the pile stops being one the moment a card
 * is played out of it.
 *
 * Not rotateWood, which is the table-wide standstill rotation - that moves the
 * BOTTOM card of the pile and resets the index for everybody at once.
 */
export function sinkWoodTop(t: Tableau): Tableau {
  if (t.woodIndex < 1 || t.wood.length < 2) return t;
  const i = t.woodIndex - 1;
  const card = t.wood[i];
  // The index steps back with it: the cards behind it have not moved, so what was
  // under the sunk card is the top now, and the next turn deals on from there.
  return { ...t, wood: [...t.wood.slice(0, i), ...t.wood.slice(i + 1), card], woodIndex: i };
}

export function rotateWood(t: Tableau): Tableau {
  if (t.wood.length < 2) return t;
  return { ...t, wood: [...t.wood.slice(1), t.wood[0]], woodIndex: 0 };
}

/**
 * Every card that can be brought to the top of the wood by turning the pile over
 * from where it stands, without anything else changing.
 *
 * This is not always "every card in the wood", which is the whole reason it walks
 * rather than returning the pile. A turn of three reaches every card when the
 * pile length shares no factor with three, and only every third one when it does
 * - and a round is dealt at 27, which does. So a player can be holding a pile
 * full of playable cards and be unable to reach a single one of them. That is the
 * difference between "no move right now" and genuinely stuck, and until this
 * existed the game could not tell them apart.
 *
 * Walks the cycle until the index repeats, so it terminates on any step size.
 */
export function woodCycleTops(t: Tableau, step: number = WOOD_STEP): Card[] {
  const out: Card[] = [];
  const len = t.wood.length;
  if (len === 0) return out;
  // Stopped on a repeated TOP CARD, not on a repeated index. `flipWood` rotates
  // the pile when it runs out, so the index comes back to the same number every
  // lap with different cards under it, and the array itself can take two laps to
  // return to where it started while the cards have already come round once. The
  // card on top is the thing being asked about, so it is the thing to watch.
  const seen = new Set<Card>();
  let cur: Tableau = t;
  // One turn per card is the most that can be needed; the bound is belt and
  // braces so a future change to the turn cannot spin this for ever.
  for (let n = 0; n <= len; n++) {
    if (cur.woodIndex > 0) {
      const top = cur.wood[cur.woodIndex - 1];
      if (seen.has(top)) break;
      seen.add(top);
      out.push(top);
    }
    cur = flipWood(cur, step);
  }
  return out;
}
