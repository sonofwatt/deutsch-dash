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
  // The count carries ACROSS the turn-over instead of restarting at it. Reaching
  // the end with one card left turns that card, puts the pile back face down and
  // keeps going until the turn has brought three: a turn deals three cards, never
  // "up to three". This is the physical action - you do not stop mid-turn because
  // the pile ran out - and getting it wrong was not a cosmetic short deal.
  //
  // Restarting the count left the pile permanently in phase with itself. A
  // ten-card pile went 3, 6, 9, 10, and then 3 again for ever: four of its ten
  // cards could be the top, and the other six never could, however long anybody
  // kept tapping. Carrying the count moves the phase on every lap, so when the
  // pile size and the step share no factor the cycle reaches EVERY card. Twenty
  // seven is the size a round deals, which does share one - that is why
  // `sinkWoodTop` exists - but the pile stops being a multiple of three the
  // moment a single card is played out of it.
  return { ...t, woodIndex: ((t.woodIndex + step - 1) % len) + 1 };
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
  if (t.wood.length === 0) return out;
  const seen = new Set<number>();
  let cur: Tableau = t;
  while (!seen.has(cur.woodIndex)) {
    seen.add(cur.woodIndex);
    if (cur.woodIndex > 0) out.push(cur.wood[cur.woodIndex - 1]);
    cur = flipWood(cur, step);
  }
  return out;
}
