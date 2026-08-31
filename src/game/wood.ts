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
  const woodIndex = t.woodIndex >= len ? Math.min(step, len) : Math.min(t.woodIndex + step, len);
  return { ...t, woodIndex };
}

/**
 * Take the face-up top card out of the pile and put it at the very bottom.
 *
 * The way out of a hand that cannot move. Turning three at a time only ever
 * exposes every third card, so a player can be genuinely stuck with a pile full
 * of playable cards (see woodCycleTops) - and sinking ONE card shifts every
 * subsequent turn by one, which changes the whole set the cycle reaches. It is a
 * deliberate action rather than something the game does for them: it costs a card
 * out of the running order, and the player should be the one spending it.
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
 * This is not "every card in the wood". Turning three at a time only ever exposes
 * every third one, and which third depends on where the index happens to be - so
 * a player can be holding a pile full of playable cards and be unable to reach a
 * single one of them. That is the difference between "no move right now" and
 * genuinely stuck, and until this existed the game could not tell them apart.
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
