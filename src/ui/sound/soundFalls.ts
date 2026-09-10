import type { SoundbiteId } from '../../game/soundbites';

/**
 * The emoji falls currently on screen, as a pure state machine.
 *
 * Extracted for the same reason as `launchGesture.ts`: there is no DOM in this
 * repo's test suite, so an effect inside `SoundRain` is untestable, and both of
 * the things this holds were reported bugs rather than decoration.
 */
export interface Fall { id: SoundbiteId; seq: number }
export interface Falls {
  /**
   * The nonce already accounted for. Seeded from whatever the store holds at
   * MOUNT, which is the fix for the second bug below.
   */
  seen: number | null;
  /** On screen now, oldest first. */
  falls: Fall[];
}

/**
 * How many falls may be on screen at once.
 *
 * A cap and not a queue: pressing repeatedly is meant to pile them up, and the
 * pile is the feedback. This only stops a leant-on button from mounting an
 * unbounded number of layers, and the OLDEST goes rather than the newest being
 * refused, so the screen always shows the most recent presses.
 */
export const MAX_FALLS = 6;

/**
 * A fresh layer that has already accounted for whatever was last played.
 *
 * **This is the fix for emoji falling at the start of a round.** `lastSound` is a
 * nonce that is never cleared, so it outlives the screen it was played on, and
 * `SoundRain` mounts once on the lobby and again on the board. Seeded with null,
 * a walk from a lobby where somebody had pressed a soundbite into the first round
 * replayed it over a board nobody had touched - which is exactly how it was
 * reported. Arriving somewhere is not an event.
 *
 * The same "adopt silently the first time" rule the store's `saidAt` map follows.
 */
export function seedFalls(seq: number | null): Falls {
  return { seen: seq, falls: [] };
}

/**
 * A soundbite reached this device. Returns the SAME object when there is nothing
 * to do, so a component holding this in state re-renders only on a real change.
 *
 * Falls stack rather than replacing each other. A single layer keyed on the nonce
 * meant a second press restarted the first mid-fall, which looks identical to one
 * that was never interrupted - so pressing twice looked like pressing once. The
 * table asked for repeated presses to stack, and the stack is what says the
 * second press registered.
 */
export function noteFall(state: Falls, id: SoundbiteId, seq: number | null,
                         max = MAX_FALLS): Falls {
  if (seq == null || seq === state.seen) return state;
  return { seen: seq, falls: [...state.falls, { id, seq }].slice(-max) };
}

/** One fall has finished falling. Same-object rule as above. */
export function expireFall(state: Falls, seq: number): Falls {
  if (!state.falls.some(f => f.seq === seq)) return state;
  return { ...state, falls: state.falls.filter(f => f.seq !== seq) };
}
