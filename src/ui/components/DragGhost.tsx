import { useLayoutEffect, useRef } from 'react';
import { CardView } from './CardView';
import { GHOST_ANCHOR, ghostFix, type DragState, type Point, type PointerTrack } from '../useDrag';
import type { BadgeId } from '../../game/badges';

const ANCHOR = `translate(${-GHOST_ANCHOR.x * 100}%, ${-GHOST_ANCHOR.y * 100}%)`;
const place = (at: Point, fix: Point) => `translate(${at.x + fix.x}px, ${at.y + fix.y}px) ${ANCHOR}`;

/**
 * The card that follows the finger during a drag.
 *
 * It positions itself. The pointer lives in a PointerTrack (useDrag.ts) rather
 * than in React state, so a pointermove never reaches React at all: this
 * subscribes once, on mount, and writes one transform per event straight onto
 * its own element. Before that change every move re-rendered the whole board.
 * No `style` prop is set in the markup on purpose, so a re-render of the game
 * screen mid-drag (a snapshot landing) cannot put the ghost back where React
 * last knew it was: the transform is owned by the effect below and nothing else.
 *
 * It also corrects itself. On the frame it mounts it measures where it actually
 * rendered against where the pointer actually was, and translates by the
 * difference - see `ghostFix` for what goes wrong on iOS and why measuring beats
 * guessing. The measure runs in a LAYOUT effect, so the corrected position is the
 * first one painted rather than a visible jump on the second frame.
 *
 * It re-measures on `visualViewport` changes because that is the thing most
 * likely to move underneath a drag in progress - an address bar finishing its
 * collapse mid-gesture is exactly the case that produced the original report.
 */
export function DragGhost({ drag, pointer, badgeId }: { drag: DragState; pointer: PointerTrack; badgeId: BadgeId }) {
  const el = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    let fix: Point = { x: 0, y: 0 };
    const move = (at: Point) => {
      const node = el.current;
      if (node) node.style.transform = place(at, fix);
    };
    const measure = () => {
      const node = el.current;
      if (!node) return;
      const next = ghostFix(node.getBoundingClientRect(), pointer.current, fix);
      // Sub-pixel differences are rounding, not a browser being wrong, and acting
      // on them would rewrite the transform on every viewport event for no gain.
      if (Math.abs(next.x - fix.x) < 0.5 && Math.abs(next.y - fix.y) < 0.5) return;
      fix = next;
      move(pointer.current);
    };
    move(pointer.current);
    measure();
    const off = pointer.subscribe(move);
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      off();
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, [pointer]);

  return (
    <div ref={el} className="drag-ghost">
      <CardView card={drag.card} badgeId={badgeId} />
    </div>
  );
}
