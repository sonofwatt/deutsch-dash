import type { SoundbiteId } from '../../game/soundbites';

/** A grid button's box, in viewport coordinates. */
export interface SoundbiteBox {
  id: SoundbiteId;
  rect: { left: number; right: number; top: number; bottom: number };
}

/**
 * Where a point falls across the soundbite grid, for the board's press-and-hold.
 *
 * Pure and rect-based rather than `document.elementFromPoint`, for two reasons
 * that both bite: the menu sits under a full-screen dismiss backdrop, so a hit
 * test would find the backdrop rather than a button; and the gesture holds a
 * pointer CAPTURE on the launch button, so the buttons never see the events on
 * their own. Taking the rects and comparing is the only thing that works through
 * both.
 *
 * **The gaps between buttons return null, deliberately.** Lifting a thumb
 * between two of them plays nothing. Snapping to the nearest would fire a
 * soundbite the player had just slid off, which is the one outcome a slide-to-
 * choose gesture must never have.
 *
 * Its own file rather than sitting beside the components it serves, so that
 * `SoundbiteTray.tsx` exports components and nothing else - a mixed module
 * breaks fast refresh for everything in it.
 */
export function hitSoundbite(boxes: SoundbiteBox[], x: number, y: number): SoundbiteId | null {
  for (const { id, rect } of boxes) {
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return id;
  }
  return null;
}
