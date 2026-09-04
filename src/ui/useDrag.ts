import { useEffect, useRef, useState } from 'react';
import type React from 'react'; // React.PointerEvent type only (new-JSX files do not auto-import React)
import type { Card, PlaySource } from '../game/types';

export type DropTarget =
  // `aim` rides along on a square for one reason: the square under the finger is
  // only a choice if the card can GO there, and this hook does not know the rules.
  // See `dropSpace`, which is the half that decides.
  | { space: number; aim?: Throw }
  | { post: number }
  // No particular square. Two independent signals, and the caller tries them in
  // order: `aim` is the line of a throw, present when the card was thrown rather
  // than let go; `loose` says the release point ITSELF means "into the middle",
  // which it does over the board and anywhere above the player's own hand.
  | { nearest: true; aim?: Throw; loose: boolean };
export interface Point { x: number; y: number }

/** What is in the air. Where it is lives in a PointerTrack, not here - see below. */
export interface DragState { card: Card; source: PlaySource }

/**
 * Where the finger is, kept OUT of React state on purpose.
 *
 * The position used to ride in DragState, and every pointermove therefore
 * re-rendered whatever component owned the drag - which is the game screen, and
 * under it the whole board: up to 32 centre cards, the hand and the opponent
 * strip, every one a framer-motion node that re-measures itself on update. At
 * the 60 to 120 pointermoves a second a phone delivers, that was the single
 * most expensive thing the game did, spent on the one gesture it is about:
 * measured at 4.6 ms a move on an eight-player board in headless Chromium, and
 * 29 ms with a 4x CPU throttle, which is more than a whole frame.
 *
 * Only the ghost needs the coordinates, so it subscribes here and moves itself
 * with one style write per event. React is told about a drag exactly twice: when
 * it starts and when it ends.
 */
export interface PointerTrack {
  current: Point;
  subscribe(cb: (p: Point) => void): () => void;
}
interface Track extends PointerTrack { set(p: Point): void }
function createTrack(): Track {
  const listeners = new Set<(p: Point) => void>();
  const track: Track = {
    current: { x: 0, y: 0 },
    subscribe(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    set(p) { track.current = p; for (const cb of listeners) cb(p); },
  };
  return track;
}

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

/**
 * A throw at the board: where it left from, which way it was going, and the
 * ground the finger actually covered getting there.
 *
 * `path` is the sample window, oldest first, ending at `from`. It is what lets a
 * throw claim a space it FLEW OVER rather than one it stopped near, and it is
 * optional so a Throw can still be written out by hand in a test; without it the
 * path is taken to be the single stretch that `dx, dy` describes.
 */
export interface Throw { from: Point; dx: number; dy: number; speed: number; path?: Point[] }

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
 * A half-angle, so 30 is a 60 degree cone in front of the throw.
 *
 * Tightened from 45 once the path rule below was carrying the overshoot case. A
 * wide cone is only needed while direction is the last thing standing between a
 * throw and nothing at all; with the path rule in front of it, the cone is back
 * to being the FALLBACK it reads as, and a narrower one asks the player to
 * actually point at something.
 */
export const FLICK_MAX_AIM_DEG = 30;
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
 *
 * It came down from 45 to 30 when the path rule below arrived. Proximity was
 * carrying the overshoot case on its own and had to be generous about it; the
 * path rule takes that job and takes it exactly, so this can go back to meaning
 * "stopped basically on it" without a big blind circle around the release point.
 */
export const FLICK_NEAR_PX = 30;

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
    if (!best || speed > best.speed) best = { from: last, dx, dy, speed, path: window };
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
 * Four rules, in this order, and only the last one is a guess:
 *
 * 1. **It ended on a space.** That is where they put it; nothing else is weighed.
 * 2. **It ended within `FLICK_NEAR_PX` of one**, measured to the edge, whatever
 *    direction the throw was going. This covers the rest of the circle: a throw
 *    that overshoots a space by a hair leaves it BEHIND the release point, where
 *    the forward cone cannot see it, and it read as that space not being playable.
 * 3. **It was pointing at one**, within `FLICK_MAX_AIM_DEG`. A flick says a
 *    direction and nothing dependable about distance - the same thumb movement
 *    means "over there" whether the space is 100px away or 600 - so the card goes
 *    to the legal space nearest that line.
 * 4. **And last, its path ran over one, or within `FLICK_NEAR_PX` of one.** A
 *    hard flick carries the finger straight over the space it was aimed at and
 *    out the other side, off the top of the board or onto some square the card
 *    cannot go, and the three rules above all judge where the throw ENDED UP, so
 *    all three miss it. The near radius rides along the whole path rather than
 *    sitting only on its end, so a throw that shaved past a space counts as
 *    having gone over it: the forgiveness rule 2 gives the release point, given
 *    to every point the finger passed through.
 *
 *    **It is last on purpose.** A space swept at the START of a flick is the
 *    oldest thing the gesture knows and the flick carried on past it, so anything
 *    the end of the throw has to say - where it stopped, what it stopped near,
 *    where it was pointing - outranks it. Where a path sweeps several spaces the
 *    LAST is taken, for the same reason.
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

  // 3. The line of the throw. A flick says a direction and nothing dependable
  //    about distance, so the card goes to the legal space nearest that line.
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
  if (inCone.length > 0) {
    const bestAngle = Math.min(...inCone.map(c => c.off));
    // Among the ones aimed at equally well - a column of spaces straight ahead is
    // the case - the nearest is the one meant.
    return inCone.filter(c => c.off <= bestAngle + AIM_TIE_DEG)
      .sort((a, b) => a.d - b.d)[0].index;
  }

  // 4. And last, the ground the throw covered. Last one swept wins - and nothing
  //    at all if it swept nothing, which is the wild-flick case and is deliberate.
  const crossed = candidates
    .map(c => ({ c, at: crossedBy(pathOf(t), c, FLICK_NEAR_PX) }))
    .filter((x): x is { c: SpaceBox; at: number } => x.at !== null)
    .sort((a, b) => b.at - a.at)[0];
  return crossed ? crossed.c.index : null;
}

/**
 * The ground a throw covered, oldest point first. `throwOf` records the whole
 * sample window; a Throw written by hand has only the stretch `dx, dy` describes,
 * which is the same line with the wobble taken out.
 */
function pathOf(t: Throw): Point[] {
  return t.path && t.path.length > 1
    ? t.path
    : [{ x: t.from.x - t.dx, y: t.from.y - t.dy }, t.from];
}

/**
 * The part of segment a->b that lies inside the box, as the fraction of the way
 * along it that the segment enters and leaves, or null if it never does.
 * Liang-Barsky: clip against each of the four edges in turn and see what survives.
 */
function insideRun(a: Point, b: Point, c: SpaceBox): [number, number] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  // `p` is how fast this edge is being approached and `q` how much room is left.
  // p === 0 is a segment parallel to the edge: it never crosses, so all that
  // matters is whether it started on the inside of it.
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  const ok = clip(-dx, a.x - (c.cx - c.w / 2)) && clip(dx, (c.cx + c.w / 2) - a.x)
          && clip(-dy, a.y - (c.cy - c.h / 2)) && clip(dy, (c.cy + c.h / 2) - a.y);
  return ok ? [t0, t1] : null;
}

/** How far along a->b the closest point to `p` sits, as a fraction of it. */
function closestOn(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
}

/**
 * Where along a->b it last came within `pad` of the box, as a fraction of it, or
 * null if it never did. `pad` of 0 is the plain question of whether it went over.
 *
 * Two convex shapes that do not touch are nearest each other at a corner of one,
 * so the closest approach is either a box corner against the segment or a segment
 * end against the box. Four corners and two ends is the whole of it.
 */
function nearRun(a: Point, b: Point, c: SpaceBox, pad: number): number | null {
  const through = insideRun(a, b, c);
  if (through) return through[1];
  if (pad <= 0) return null;
  let bestGap = Infinity, bestAt = 0;
  const half = { x: c.w / 2, y: c.h / 2 };
  for (const corner of [{ x: c.cx - half.x, y: c.cy - half.y }, { x: c.cx + half.x, y: c.cy - half.y },
                        { x: c.cx - half.x, y: c.cy + half.y }, { x: c.cx + half.x, y: c.cy + half.y }]) {
    const at = closestOn(a, b, corner);
    const gap = Math.hypot(a.x + (b.x - a.x) * at - corner.x, a.y + (b.y - a.y) * at - corner.y);
    if (gap < bestGap) { bestGap = gap; bestAt = at; }
  }
  for (const end of [{ at: 0, p: a }, { at: 1, p: b }]) {
    const gap = edgeDistance(end.p, c);
    if (gap < bestGap) { bestGap = gap; bestAt = end.at; }
  }
  return bestGap <= pad ? bestAt : null;
}

/**
 * How far along the path the finger was when it last LEFT this space, or null if
 * it never came near it. A distance rather than a flag, so several spaces crossed
 * by one throw can be put in the order they were crossed.
 *
 * `pad` widens the path into a band that far to either side, which is what makes
 * a throw that shaved past a space count as having gone over it.
 */
export function crossedBy(path: Point[], c: SpaceBox, pad = 0): number | null {
  let travelled = 0;
  let last: number | null = null;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const at = nearRun(a, b, c, pad);
    if (at !== null) last = travelled + at * len;
    travelled += len;
  }
  return last;
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

/**
 * Which space a drop actually means, given what this card may legally reach.
 *
 * The rule the reported bug came down to: **a square under the finger wins only
 * if the card can go there.** A flick is short and fast, so the finger leaves the
 * screen barely past where it started - over the player's own end of the board.
 * If the squares there are occupied by cards this one cannot follow, the release
 * point sits on one of them, and taking that square as the player's choice threw
 * away the only signal that said where they were actually aiming.
 *
 * A DELIBERATE drop keeps the old behaviour exactly: with no throw there is
 * nothing to fall back to, so the square they placed it on is still the answer,
 * and it is still refused if it cannot take the card. Only a THROWN card whose
 * square cannot take it re-reads the aim.
 *
 * Pure: `legal` is the boxes of the spaces this card may land in, already
 * measured, so the whole decision can be tested without a DOM.
 */
export function dropSpace(target: DropTarget, legal: SpaceBox[], at: Point): number | null {
  if ('post' in target) return null; // not a square at all; the caller plays it directly
  const byAim = (aim?: Throw) => (aim ? aimedAt(legal, aim) : null);
  if ('space' in target) {
    if (!target.aim || legal.some(b => b.index === target.space)) return target.space;
    // Thrown, and it came down on a square that cannot take it. The release point
    // is over the board by definition here, so the nearest legal square is a fair
    // second answer when the aim itself finds nothing.
    return byAim(target.aim) ?? nearestOf(legal, at.x, at.y);
  }
  return byAim(target.aim) ?? (target.loose ? nearestOf(legal, at.x, at.y) : null);
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
  // One track for the life of the hook: the ghost subscribes to it once per drag.
  // State with a lazy initialiser rather than a ref, so nothing reads a ref during
  // render; it is never set again, so it never causes a render either.
  const [track] = useState(createTrack);

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
    track.set({ x: e.clientX, y: e.clientY });
    setDrag({ card, source });

    // Kept in a ref rather than in state: every pointermove appends one. Trimmed
    // to the window throwOf reads, so a long drag cannot grow it without bound.
    const samples: Sample[] = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    const sample = (x: number, y: number) => {
      const t = performance.now();
      samples.push({ x, y, t });
      while (samples.length > 2 && t - samples[1].t > FLICK_WINDOW_MS) samples.shift();
    };

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      sample(ev.clientX, ev.clientY);
      // Not setState: this is the hot path, and only the ghost is listening.
      track.set({ x: ev.clientX, y: ev.clientY });
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
        // A post under the finger is a placement and nothing else.
        if (target && 'post' in target) { onDrop(source, target, at); return; }
        // A square under the finger is a placement too - but it is only a CHOICE
        // if the card can go there, and this hook does not know that. So the throw
        // travels with it and `dropSpace` decides. Without this, a flick from the
        // bottom corner across a full bottom row died on the square it happened to
        // be released over: that square won unconditionally, the aim was thrown
        // away, and the card came back for no reason the player could see.
        if (target && 'space' in target) {
          onDrop(source, { space: target.space, aim: thrown ?? undefined }, at);
          return;
        }
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

  return { drag, startDrag, pointer: track as PointerTrack };
}
