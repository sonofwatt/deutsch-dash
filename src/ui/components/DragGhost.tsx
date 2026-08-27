import { useLayoutEffect, useRef, useState } from 'react';
import { CardView } from './CardView';
import { GHOST_ANCHOR, ghostFix, type DragState, type Point } from '../useDrag';
import type { BadgeId } from '../../game/badges';

/**
 * The card that follows the finger during a drag.
 *
 * It corrects itself. On the frame it mounts it measures where it actually
 * rendered against where the pointer actually was, and translates by the
 * difference - see `ghostFix` for what goes wrong on iOS and why measuring beats
 * guessing. The measure runs in a LAYOUT effect, so the corrected position is the
 * first one painted rather than a visible jump on the second frame.
 *
 * It re-measures on `visualViewport` changes because that is the thing most
 * likely to move underneath a drag in progress - an address bar finishing its
 * collapse mid-gesture is exactly the case that produced the original report.
 */
export function DragGhost({ drag, badgeId }: { drag: DragState; badgeId: BadgeId }) {
  const el = useRef<HTMLDivElement | null>(null);
  const at = useRef<Point>({ x: drag.x, y: drag.y });
  const [fix, setFix] = useState<Point>({ x: 0, y: 0 });
  const fixRef = useRef<Point>(fix);

  // Refs, not deps: the measure below must read the CURRENT pointer position and
  // the correction already applied, without re-running (and re-listening) on
  // every one of the many pointermoves a drag is made of.
  useLayoutEffect(() => { at.current = { x: drag.x, y: drag.y }; fixRef.current = fix; });

  useLayoutEffect(() => {
    const measure = () => {
      const node = el.current;
      if (!node) return;
      const next = ghostFix(node.getBoundingClientRect(), at.current, fixRef.current);
      // Sub-pixel differences are rounding, not a browser being wrong, and acting
      // on them would set state on every viewport event for no visible gain.
      if (Math.abs(next.x - fixRef.current.x) < 0.5 && Math.abs(next.y - fixRef.current.y) < 0.5) return;
      fixRef.current = next;
      setFix(next);
    };
    measure();
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, []);

  const anchor = `translate(${-GHOST_ANCHOR.x * 100}%, ${-GHOST_ANCHOR.y * 100}%)`;
  return (
    <div ref={el} className="drag-ghost"
      style={{ transform: `translate(${drag.x + fix.x}px, ${drag.y + fix.y}px) ${anchor}` }}>
      <CardView card={drag.card} badgeId={badgeId} />
    </div>
  );
}
