/**
 * Which of the three screens a room URL should be showing.
 *
 * Pure and tested by worked example, because the interesting part is a case that
 * a static render cannot reach: `useGameStore` is a zustand store, and zustand
 * hands server rendering the INITIAL state, so `renderToStaticMarkup` of
 * `RoomScreen` shows the store as it was at import no matter what a test sets.
 *
 * `joinPhase` and `room` used to be tested together, in one condition, which is
 * why this exists as its own function with its own name. They answer different
 * questions. `joinPhase` becomes `in-room` synchronously when `watch()` is
 * called; `room` stays null until the listener's first snapshot lands, one round
 * trip later. Read together, that gap rendered the live join form to somebody who
 * had already joined, and a second tap on its button re-ran `enterRoom` and
 * churned the presence writer through the stale-attempt branch.
 */
export type RoomView = 'form' | 'rejoining' | 'room';

export function roomView(joinPhase: 'idle' | 'joining' | 'in-room', hasRoom: boolean): RoomView {
  if (joinPhase !== 'in-room') return 'form'; // not in yet, including mid-join
  return hasRoom ? 'room' : 'rejoining';      // in, but the first snapshot may not have landed
}
