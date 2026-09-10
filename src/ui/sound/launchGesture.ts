import type { SoundbiteId } from '../../game/soundbites';

/**
 * What a press on the soundbite launcher should DO, as a pure decision.
 *
 * Its own file for the reason `hitTest.ts` gives: this is the whole of the
 * gesture's behaviour, it is the part that gets asked to change, and there is no
 * DOM anywhere in this repo's test suite (`vite.config.ts` sets
 * `environment: 'node'`), so logic left inside the component cannot be tested at
 * all. `soundLauncherLayout.test.ts` measures where the menu lands; this decides
 * what the menu does.
 *
 * The three rules, which came from the table on 2026-09-10:
 *
 *  - Lifting over a soundbite plays it and CLOSES. That is the press-and-hold
 *    gesture completing, and closing is what makes it one movement: play, and
 *    you are back on the board.
 *  - A tap on the launcher TOGGLES, and does nothing else. Opens a shut menu,
 *    shuts an open one.
 *  - Anything else - a hold that wandered off and ended over nothing - closes.
 *
 * And the rule that is not here, because it is an absence: **pressing a soundbite
 * IN the menu does not close it.** That path never reaches this function. The
 * menu stays up until the launcher is tapped again or something outside it is
 * pressed, so a table can lean on one button and keep playing it.
 */
export interface Press {
  /** The soundbite the pointer was over when it lifted, if any. */
  over: SoundbiteId | null;
  /** Quick, and never moved: a tap on the launcher rather than a hold. */
  tapped: boolean;
  /** Whether the menu was already open when this press STARTED. */
  wasOpen: boolean;
}

export interface Outcome {
  /** The soundbite to play, if this press played one. */
  say: SoundbiteId | null;
  /** Whether the menu should be open afterwards. */
  open: boolean;
}

export function pressOutcome({ over, tapped, wasOpen }: Press): Outcome {
  // The hold, completing. Checked first: a press can be quick AND end over a
  // soundbite (a fast flick down onto one), and that is a hold by intent - the
  // launcher itself is never under the menu, so being over a soundbite at all
  // means the pointer travelled.
  if (over) return { say: over, open: false };
  // A tap toggles. `wasOpen` and not the live state, because the press itself
  // always opens the menu - a hold needs something to slide onto - so by the time
  // the pointer lifts, "is it open" is true either way and says nothing.
  if (tapped) return { say: null, open: !wasOpen };
  return { say: null, open: false };
}
