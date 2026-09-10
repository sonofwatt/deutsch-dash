import { useCallback, useRef, useState } from 'react';
import type { SoundbiteId } from '../../game/soundbites';
import { SoundbiteGrid } from './SoundbiteTray';
import { hitSoundbite } from '../sound/hitTest';
import { pressOutcome } from '../sound/launchGesture';

/**
 * The soundbite button over the Dash pile, and the menu it opens.
 *
 * Two gestures on one button, which is the whole design:
 *
 * - **Tap** it and the menu opens and STAYS open - through soundbite after
 *   soundbite, however many the table wants. **Only three things close it:** the
 *   launch button tapped again, a press anywhere outside the menu, or the hold
 *   gesture below. Pressing a soundbite does NOT, which is the point: a table
 *   firing off three in a row should not reopen the menu twice, and pressing one
 *   button repeatedly should just keep playing it.
 * - **Press and hold** it and the menu opens under your thumb; slide onto a
 *   soundbite and lift, and that one plays once and the menu closes with it.
 *   One gesture, no second tap, which is what you want mid-round with a hand of
 *   cards to get back to.
 *
 * **The auto-close belongs to the HOLD and to nothing else.** That is the whole
 * difference between the two gestures now: a hold is one soundbite and then you
 * are back on the board, a tap is a menu that stays until you put it away. Asked
 * for in those terms after the first table played with it - the menu closing
 * under a tapping thumb was the complaint.
 *
 * Telling them apart is a clock and a distance, not a mode: a pointer that goes
 * up quickly AND never left the button was a tap. Anything else was a hold, and
 * a hold that ended over nothing simply closes. Both thresholds are generous,
 * because the cost of guessing wrong is one extra tap and never a lost card.
 */
/** Under this, and without moving, a press was a tap and the menu stays open. */
const TAP_MS = 260;
/** Movement past this makes it a hold however quick it was. Thumbs wobble. */
const SLOP_PX = 12;

export function SoundLauncher({ onSay }: { onSay(id: SoundbiteId): void }) {
  const [open, setOpen] = useState(false);
  // Which soundbite the sliding thumb is currently over, for the highlight. Null
  // whenever it is over nothing, which is also a legitimate place to lift.
  const [armed, setArmed] = useState<SoundbiteId | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // `wasOpen` is what makes the launch button a TOGGLE. The press itself always
  // opens the menu (a hold has to have something to slide onto), so whether a tap
  // should close it again can only be answered from the state the press started
  // in - by the time the pointer comes up, `open` is true either way.
  const hold = useRef<{ at: number; x: number; y: number; moved: boolean; wasOpen: boolean } | null>(null);

  /** The grid's buttons as rects, read fresh: the menu moves with the board. */
  const rects = useCallback(() => {
    const root = menuRef.current;
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>('[data-sb]')].map(el => ({
      id: el.dataset.sb as SoundbiteId,
      rect: el.getBoundingClientRect(),
    }));
  }, []);

  const down = (e: React.PointerEvent<HTMLButtonElement>) => {
    hold.current = { at: Date.now(), x: e.clientX, y: e.clientY, moved: false, wasOpen: open };
    setArmed(null);
    setOpen(true);
    // Capture, so the slide keeps reporting after the thumb has left the button.
    // It also means the grid's own buttons never see these events, which is why
    // the hit test below is rects and not elementFromPoint.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const h = hold.current;
    if (!h) return;
    if (Math.abs(e.clientX - h.x) > SLOP_PX || Math.abs(e.clientY - h.y) > SLOP_PX) h.moved = true;
    setArmed(hitSoundbite(rects(), e.clientX, e.clientY));
  };

  const up = (e: React.PointerEvent<HTMLButtonElement>) => {
    const h = hold.current;
    hold.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setArmed(null);
    // Every rule about what a press does lives in pressOutcome, which is pure and
    // tested. This half only measures the press.
    const { say, open: next } = pressOutcome({
      over: hitSoundbite(rects(), e.clientX, e.clientY),
      tapped: h != null && !h.moved && Date.now() - h.at < TAP_MS,
      wasOpen: h?.wasOpen ?? false,
    });
    if (say) onSay(say);
    setOpen(next);
  };

  /** A cancelled pointer (a call arriving, the OS taking the gesture) is not a play. */
  const cancel = () => { hold.current = null; setArmed(null); setOpen(false); };

  return (
    <div className="sb-launch-wrap">
      {open && (
        // Full screen, under the menu and over everything else, so a press
        // anywhere outside the menu's borders closes it and does NOT also play a
        // card underneath. onPointerDown rather than onClick: the board is played
        // with pointer events, and a click would land a whole gesture later.
        <div className="sb-backdrop" onPointerDown={() => setOpen(false)} aria-hidden="true" />
      )}
      <button className={`sb-launch${open ? ' open' : ''}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
        // The board is one big drop target and this sits inside it. Without this,
        // a press here is also a card being let go into the middle.
        onClick={e => e.stopPropagation()}
        aria-haspopup="menu" aria-expanded={open} aria-label="Soundbites">
        <span aria-hidden="true">♪</span>
      </button>
      {open && (
        <div className="sb-menu" ref={menuRef} role="menu">
          {/* Plays and leaves the menu exactly where it is. Pressing the same
              button again plays it again, which is what the engine now does with
              a repeat rather than queueing it behind itself. */}
          <SoundbiteGrid armed={armed} onSay={onSay} />
        </div>
      )}
    </div>
  );
}
