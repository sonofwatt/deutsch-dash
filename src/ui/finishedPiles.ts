import type { Card, CenterSpace } from '../game/types';

/**
 * Which centre piles have just been completed, so the board can show the finish
 * before the space empties.
 *
 * A pile of 1..10 is archived into `space.history` and its stack cleared BY THE
 * TRANSACTION (`centerPlayTxn`), server-side, the instant the 10 lands. That is
 * deliberate and must stay that way - it is what stops a stale client reviving a
 * finished pile - but it means the most satisfying moment in the game happens
 * entirely off screen: the tenth card lands and the space is simply empty a frame
 * later, with a chip appearing on the rail.
 *
 * So the finish is drawn from the ARCHIVE rather than from the stack. A run
 * appearing in `history` is the event, and the last card of it is the 10 that
 * completed the pile - which carries its `owner`, and that is how the board knows
 * whose badge to put on the back of it.
 *
 * Pure and in its own file for the reason `hitTest.ts` and `soundFalls.ts` give:
 * there is no DOM in this repo's test suite (`environment: 'node'`), so logic
 * left inside a component cannot be tested at all.
 */
export interface Finish {
  /** Which space it happened in. */
  space: number;
  /** The card that completed the pile, whose `owner` is who gets the credit. */
  card: Card;
  /** Strictly increasing, so the same space finishing twice remounts and replays. */
  seq: number;
}

/** How many runs each space has archived. The thing a finish is a change in. */
export function historyCounts(spaces: CenterSpace[]): number[] {
  return spaces.map(s => s.history.length);
}

/**
 * The piles that finished between `prev` and now.
 *
 * **A space whose count did not GROW is not a finish**, which covers the two ways
 * this could otherwise fire wrongly: a board that shrank or grew (a player
 * joining mid-game re-sizes nothing now, but a round boundary deals a new one),
 * and a first render, where `prev` is seeded from the board as it stands so that
 * arriving at a game in progress does not replay every pile already finished.
 * Same "arriving somewhere is not an event" rule the store's `saidAt` map and the
 * emoji rain both follow.
 *
 * `seq` is threaded through rather than generated here so the module stays pure.
 */
export function finishesSince(
  prev: number[], spaces: CenterSpace[], nextSeq: number,
): { counts: number[]; finished: Finish[]; seq: number } {
  const counts = historyCounts(spaces);
  const finished: Finish[] = [];
  let seq = nextSeq;
  for (let i = 0; i < spaces.length; i++) {
    // `?? 0` and not `?? counts[i]`: a space that did not exist a moment ago has
    // finished nothing, but a board that arrives already holding history is
    // seeded by the caller, not here.
    if (counts[i] <= (prev[i] ?? 0)) continue;
    const run = spaces[i].history[spaces[i].history.length - 1];
    const card = run?.[run.length - 1];
    if (!card) continue; // a run that filtered down to nothing was never a run
    finished.push({ space: i, card, seq: seq++ });
  }
  return { counts, finished, seq };
}
