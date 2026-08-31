import { useEffect, useRef, useState } from 'react';
import type React from 'react'; // React.PointerEvent type only (new-JSX files do not auto-import React)
import type { Card, PlaySource } from '../game/types';

export type DropTarget =
  | { space: number }
  | { post: number }
  // No particular square. Two independent signals, and the caller tries them in
  // order: `aim` is the line of a throw, present when the card was thrown rather
  // than let go; `loose` says the release point ITSELF means "into the middle",
  // which it does over the board and anywhere above the player's own hand.
  | { nearest: true; aim?: Throw; loose: boolean };
export interface Point { x: number; y: number }

export interface DragState { card: Card; source: PlaySource; x: number; y: number }

/**
 * Where the pointer sits on the dragged card, as a fraction of the card's own
 * box: halfway across, and a whisker above the middle so the card is not quite
 * buried under the fingertip. Shared by the transform that positions the ghost
 * and by `ghostFix` below, which has to know the same thing to check it landed.
 */
export const GHOST_ANCHOR = { x: 0.5, y: 0.55 };

/**
 * The ghost is `position: fixed` and driven by `clientX/clientY`, which by spec
 * are the same coordinate space - so on a correct browser it lands exactly under
 * the finger and this returns the fix unchanged.
 *
 * iOS Safari is not reliably a correct browser here: it resolves fixed elements
 * against the VISUAL viewport while pointer coordinates and
 * `getBoundingClientRect()` stay in the LAYOUT viewport, and the two part company
 * whenever the address bar is mid-collapse or the page is pinched. The gap is a
 * constant offset, and a playtest found it on two of three iPhones - the card
 * floating well above the finger holding it - while a third phone and every
 * desktop browser were fine.
 *
 * Rather than guess at the cause, measure the miss: `rect` is where the ghost
 * actually rendered, `at` is where the pointer actually was, and the difference
 * is whatever this browser did wrong. Returns the correction to translate by,
 * accumulated onto the one already `applied` so it can be re-measured mid-drag.
 */
export function ghostFix(
  rect: { left: number; top: number; width: number; height: number }, at: Point, applied: Point,
): Point {
  return {
    x: applied.x + (at.x - rect.width * GHOST_ANCHOR.x - rect.left),
    y: applied.y + (at.y - rect.height * GHOST_ANCHOR.y - rect.top),
  };
}

/** One pointer position and when it was there. `t` is milliseconds, any origin. */
export interface Sample extends Point { t: number }

/** A throw at the board: where it left from, and which way it was going. */
export interface Throw { from: Point; dx: number; dy: number; speed: number }

/**
 * The tail of a real flick is its SLOWEST part - a thumb decelerates before it
 * leaves the glass - so the throw is read as the fastest stretch inside this
 * window rather than as the average across it. Judging the last fraction alone
 * is what made a short flick fail while a long drag succeeded.
 */
export const FLICK_WINDOW_MS = 160;
/** The shortest stretch worth measuring a speed over; below this it is jitter. */
const MIN_SEGMENT_MS = 20;
/** And the shortest worth taking a DIRECTION from. */
const MIN_SEGMENT_PX = 10;
/**
 * px per ms. 300px/s sits in the gap between the two gestures: a careful drag
 * runs at 100-400px/s and a thumb flick at 1000px/s and up, so this is nearer a
 * drag than a flick on purpose - the direction test below is what rejects a wild
 * throw, and this only has to separate a throw from a reposition.
 */
export const FLICK_MIN_SPEED = 0.3;
/** Guards against a fast tap with an unsteady finger reading as a throw. */
export const FLICK_MIN_TRAVEL = 18;
/**
 * How far off the line of the throw a space may sit and still count as aimed at.
 * A half-angle, so 45 is a 90 degree cone in front of the throw.
 */
export const FLICK_MAX_AIM_DEG = 45;
/** Two spaces this close in bearing are both "aimed at"; the nearer one wins. */
const AIM_TIE_DEG = 8;
/**
 * How close to a space the throw can END and have it count, whatever direction it
 * was going. Measured to the space's EDGE rather than its centre, so a throw that
 * stops just past a border is a few pixels away rather than half a card away, and
 * zero means the throw landed on the space itself.
 *
 * This is what covers the rest of the circle. The cone above only looks FORWARD,
 * so a throw that overshoots a space by a hair leaves it behind the release point
 * and out of the cone entirely - which read as the space not being playable at
 * all. Proximity does not care which way the throw was pointing.
 */
export const FLICK_NEAR_PX = 50;

/**
 * The throw a gesture was, or null if it was not one.
 *
 * This is what makes the flick independent of where the finger came off the
 * glass. A throw at the board is over long before the pointer is released, and
 * on a fast one the release lands wherever it lands - short of the board, past
 * the top of it, or nowhere the page owns at all. Reading the throw out of the
 * movement means the card goes where it was aimed rather than where the finger
 * stopped, and it means a SHORT flick in the right direction is as good as a
 * long one, which is the whole point of a flick.
 *
 * Pure, and takes its own samples, so the rule is testable without a DOM.
 */
export function throwOf(samples: Sample[]): Throw | null {
  const last = samples[samples.length - 1];
  if (!last || samples.length < 2) return null;
  const window = samples.filter(s => last.t - s.t <= FLICK_WINDOW_MS);
  // How far the gesture went, across the whole window. This is the tap guard, and
  // it belongs HERE and not on each stretch below: applied per stretch it threw
  // away the short fast ones at the end - the throw itself - and left only the
  // long slow ones that reach back into the wind-up.
  if (Math.hypot(last.x - window[0].x, last.y - window[0].y) < FLICK_MIN_TRAVEL) return null;
  // Every stretch ending at the release, and the fastest of them is the throw.
  // Averaging the whole window instead takes in the deceleration a thumb makes
  // before it leaves the glass; the last pair alone reads noise.
  let best: Throw | null = null;
  for (const s of window) {
    const dt = last.t - s.t;
    if (dt < MIN_SEGMENT_MS) continue;
    const dx = last.x - s.x, dy = last.y - s.y;
    const travel = Math.hypot(dx, dy);
    if (travel < MIN_SEGMENT_PX) continue;   // too small to carry a direction
    const speed = travel / dt;
    if (!best || speed > best.speed) best = { from: last, dx, dy, speed };
  }
  if (!best || best.speed < FLICK_MIN_SPEED) return null;
  // Upward only. The board is above the hand on every screen, so a throw down or
  // flat is a player moving a card between their own piles or thinking better of
  // it, and neither should send it into the middle.
  if (best.dy >= 0) return null;
  return best;
}

/**
 * Which of these candidates the throw was aimed at, or null if none of them was.
 *
 * Three rules, in this order, and the first two are the forgiving ones:
 *
 * 1. **It ended on a space.** That is where they put it; nothing else is weighed.
 * 2. **It ended within `FLICK_NEAR_PX` of one**, measured to the edge, whatever
 *    direction the throw was going. This covers the rest of the circle: a throw
 *    that overshoots a space by a hair leaves it BEHIND the release point, where
 *    the forward cone cannot see it, and it read as that space not being playable.
 * 3. **Otherwise the line of the throw.** A flick says a direction and nothing
 *    dependable about distance - the same thumb movement means "over there"
 *    whether the space is 100px away or 600 - so the card goes to the legal space
 *    nearest that line.
 *
 * Candidates are already filtered to LEGAL spaces by the caller, which is what
 * makes all three forgiving in the way they need to be: aim at a space that is
 * full, or at a pile the card cannot follow, and it lands on a playable one rather
 * than coming back.
 *
 * Returning null is the wild-flick case, and it is deliberate. A throw at nothing
 * in particular, ending nowhere near anything, should do nothing - or the gesture
 * becomes "shake the phone to play a card".
 */
export function aimedAt(candidates: SpaceBox[], t: Throw): number | null {
  // 1. It ended ON a space. Nothing else to weigh up: that is where they put it.
  //    2. Or a hair outside one - a throw that overshoots a border by a few pixels
  //    meant that space, and the cone below cannot see it because it is now
  //    BEHIND the release point. Nearest edge wins.
  const near = candidates
    .map(c => ({ c, d: edgeDistance(t.from, c) }))
    .filter(x => x.d <= FLICK_NEAR_PX)
    .sort((a, b) => a.d - b.d)[0];
  if (near) return near.c.index;

  // 3. Otherwise the line of the throw. A flick says a direction and nothing
  //    dependable about distance, so the card goes to the legal space nearest that
  //    line - and to nothing at all if none is near it, which is the wild-flick
  //    case and is deliberate.
  const aim = Math.atan2(t.dy, t.dx);
  const scored = candidates.flatMap(c => {
    const dx = c.cx - t.from.x, dy = c.cy - t.from.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return [];
    // Signed difference folded into 0..180, so a bearing either side of the throw
    // is off by the same amount.
    let off = Math.abs(Math.atan2(dy, dx) - aim) * 180 / Math.PI;
    if (off > 180) off = 360 - off;
    return [{ index: c.index, off, d }];
  });
  const inCone = scored.filter(c => c.off <= FLICK_MAX_AIM_DEG);
  if (inCone.length === 0) return null;
  const bestAngle = Math.min(...inCone.map(c => c.off));
  // Among the ones aimed at equally well - a column of spaces straight ahead is
  // the case - the nearest is the one meant.
  return inCone.filter(c => c.off <= bestAngle + AIM_TIE_DEG)
    .sort((a, b) => a.d - b.d)[0].index;
}

export function parseDrop(el: Element | null): DropTarget | null {
  const host = el?.closest('[data-drop]');
  const v = host?.getAttribute('data-drop');
  if (!v) return null;
  const [kind, n] = v.split(':');
  if (kind === 'space') return { space: Number(n) };
  if (kind === 'post') return { post: Number(n) };
  // The zone element only says WHERE, never how it was thrown - useDrag fills
  // the rest in from the gesture.
  if (kind === 'nearest') return { nearest: true, loose: true };
  return null;
}

/** Closest candidate to (x, y) by centre distance. Pure, so it can be tested. */
export function nearestOf(
  candidates: { index: number; cx: number; cy: number }[], x: number, y: number,
): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const cand of candidates) {
    const d = (x - cand.cx) ** 2 + (y - cand.cy) ** 2;
    if (d < bestDistance) { bestDistance = d; best = cand.index; }
  }
  return best;
}

/** A space's box on screen: where its centre is and how big it is. */
export interface SpaceBox { index: number; cx: number; cy: number; w: number; h: number }

/** Where these centre spaces are on screen right now. */
export function spaceCentres(indices: number[]): SpaceBox[] {
  return indices.flatMap(index => {
    const el = document.querySelector(`[data-drop="space:${index}"]`);
    if (!el) return [];
    const r = el.getBoundingClientRect();
    return [{ index, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }];
  });
}

/**
 * How far a point is from a space's edge: zero anywhere inside it, and otherwise
 * the straight-line gap to the nearest point on its border. A centre-to-centre
 * measure would call a throw that stopped just inside a big slot "half a card
 * away", which is the opposite of what it is.
 */
export function edgeDistance(p: Point, c: SpaceBox): number {
  const dx = Math.max(Math.abs(p.x - c.cx) - c.w / 2, 0);
  const dy = Math.max(Math.abs(p.y - c.cy) - c.h / 2, 0);
  return Math.hypot(dx, dy);
}

/** Which of these centre spaces is nearest the point, by where they are on screen. */
export function nearestSpace(indices: number[], x: number, y: number): number | null {
  return nearestOf(spaceCentres(indices), x, y);
}

/**
 * The top of the player's own hand. Everything above it is board - the grid, the
 * gaps around it, the opponent strip, the head - and letting go anywhere up there
 * means "into the middle", which is what it looks like to the player holding the
 * card. Below it they are over their own piles, where a release means a post play
 * or a change of mind.
 */
function handTop(): number {
  const el = document.querySelector('[data-hand]');
  return el ? el.getBoundingClientRect().top : Infinity;
}

/**
 * `fling` is the host's room option (RoomMeta.flingOn). Off, a card has to be
 * carried into the drop area and let go there, which is what the gesture was
 * before throwing existed and still works exactly as it did. The throw is read
 * either way - it costs nothing - and simply not acted on.
 */
export function useDrag(
  onDrop: (source: PlaySource, target: DropTarget, at: Point) => void, fling = true,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // remove window listeners if we unmount mid-drag
  useEffect(() => () => { cleanupRef.current?.(); }, []);

  function startDrag(e: React.PointerEvent, card: Card, source: PlaySource) {
    e.preventDefault();
    cleanupRef.current?.(); // a second pointer starting a drag tears down the first
    // Best effort. Safari throws NotFoundError here if the pointer is no longer
    // active by the time this runs, and losing capture costs us nothing that the
    // window listeners below do not already cover.
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* no capture */ }
    const pointerId = e.pointerId;
    setDrag({ card, source, x: e.clientX, y: e.clientY });

    // Kept in a ref rather than in state: every pointermove appends one, and the
    // ghost's own re-render is already paying for the position. Trimmed to the
    // window throwOf reads, so a long drag cannot grow it without bound.
    const samples: Sample[] = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    const sample = (x: number, y: number) => {
      const t = performance.now();
      samples.push({ x, y, t });
      while (samples.length > 2 && t - samples[1].t > FLICK_WINDOW_MS) samples.shift();
    };

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      sample(ev.clientX, ev.clientY);
      setDrag(d => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d));
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      setDrag(null);
      if (ev.type === 'pointerup') sample(ev.clientX, ev.clientY);
      const thrown = fling ? throwOf(samples) : null;
      if (ev.type === 'pointerup') {
        const target = parseDrop(document.elementFromPoint(ev.clientX, ev.clientY));
        const at = { x: ev.clientX, y: ev.clientY };
        // An explicit pile under the finger wins: that is somebody placing a card
        // on a square they chose, and it must not be overruled by how fast they
        // happened to get there.
        if (target && !('nearest' in target)) { onDrop(source, target, at); return; }
        // Did they let go somewhere that means "the middle"? The drop zone element
        // covers the board; the rest is everything above their own hand - the gaps
        // beside the grid, the opponent strip, the head - which is all board as far
        // as somebody holding a card is concerned.
        const loose = target != null || at.y < handTop();
        if (thrown || loose) onDrop(source, { nearest: true, aim: thrown ?? undefined, loose }, at);
        return;
      }
      // pointercancel: the OS took the gesture off us mid-throw - an iOS home
      // swipe, an Android back swipe, a second finger landing. The throw itself
      // already happened and was already unambiguous, so it still counts. This is
      // the half of the fix that matters: before it, the one gesture most likely
      // to be stolen was also the one that silently did nothing.
      // No release to trust, so the throw is the only signal there is.
      if (thrown) onDrop(source, { nearest: true, aim: thrown, loose: false }, thrown.from);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  return { drag, startDrag };
}
