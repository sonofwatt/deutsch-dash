import { useCallback, useRef, useState } from 'react';
import type { SoundbiteId } from '../../game/soundbites';
import { SoundbiteGrid } from './SoundbiteTray';
import { hitSoundbite } from '../sound/hitTest';

/**
 * The soundbite button over the Dash pile, and the menu it opens.
 *
 * Two gestures on one button, which is the whole design:
 *
 * - **Tap** it and the menu opens and STAYS open, so a table can fire off three
 *   in a row without reopening it each time. It closes when you press anywhere
 *   outside its borders.
 * - **Press and hold** it and the menu opens under your thumb; slide onto a
 *   soundbite and lift, and that one plays once and the menu closes with it.
 *   One gesture, no second tap, which is what you want mid-round with a hand of
 *   cards to get back to.
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
  const hold = useRef<{ at: number; x: number; y: number; moved: boolean } | null>(null);

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
    hold.current = { at: Date.now(), x: e.clientX, y: e.clientY, moved: false };
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
    const over = hitSoundbite(rects(), e.clientX, e.clientY);
    setArmed(null);
    if (over) { onSay(over); setOpen(false); return; }
    // A quick press that never moved is a tap: leave the menu up to be used.
    const tapped = h != null && !h.moved && Date.now() - h.at < TAP_MS;
    if (!tapped) setOpen(false);
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
          <SoundbiteGrid armed={armed} onSay={id => { onSay(id); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}
