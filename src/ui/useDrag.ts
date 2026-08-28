import { useEffect, useRef, useState } from 'react';
import type React from 'react'; // React.PointerEvent type only (new-JSX files do not auto-import React)
import type { Card, PlaySource } from '../game/types';

export type DropTarget = { space: number } | { post: number } | { nearest: true };
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

/**
 * A flick is a throw at the board, and it is judged on the LAST fraction of the
 * gesture rather than on the whole of it: picking a card up, hesitating, and then
 * throwing it is still a throw, and averaging the hesitation in would lose it.
 */
export const FLICK_WINDOW_MS = 120;
/** px per ms. About 450px/s - well above a deliberate drag, well under a real throw. */
export const FLICK_MIN_SPEED = 0.45;
/** Guards against a fast tap with a jittery finger reading as a throw. */
export const FLICK_MIN_TRAVEL = 24;
/**
 * How far ahead of the release point the card is taken to be going. Long enough
 * that a flick from the bottom of the screen reaches the board and picks the
 * space it was aimed at, short enough that it does not sail past everything into
 * the far corner.
 */
export const FLICK_PROJECT_MS = 90;

/**
 * Where a flick was AIMED, or null if the gesture was not one.
 *
 * This is what makes the gesture independent of where the finger happened to
 * come off the glass. A throw at the board is over long before the pointer is
 * released, and on a fast one the release lands wherever it lands - past the top
 * of the board, on the opponent strip, or nowhere the page owns at all. Reading
 * the intent out of the movement means the card goes where it was thrown rather
 * than where the finger stopped.
 *
 * Pure, and takes its own samples, so the whole rule is testable without a DOM.
 */
export function flickOf(samples: Sample[]): Point | null {
  const last = samples[samples.length - 1];
  if (!last || samples.length < 2) return null;
  // The oldest sample still inside the window, so the velocity is the throw and
  // not the approach to it.
  const first = samples.find(s => last.t - s.t <= FLICK_WINDOW_MS) ?? samples[0];
  const dt = last.t - first.t;
  if (dt <= 0) return null;
  const dx = last.x - first.x, dy = last.y - first.y;
  const travel = Math.hypot(dx, dy);
  if (travel < FLICK_MIN_TRAVEL) return null;
  if (travel / dt < FLICK_MIN_SPEED) return null;
  // Upward only. The board is above the hand on every screen, and a flick down or
  // sideways is a player moving a card between their own piles or thinking better
  // of it - neither should throw the card into the middle.
  if (dy >= 0) return null;
  return { x: last.x + (dx / dt) * FLICK_PROJECT_MS, y: last.y + (dy / dt) * FLICK_PROJECT_MS };
}

export function parseDrop(el: Element | null): DropTarget | null {
  const host = el?.closest('[data-drop]');
  const v = host?.getAttribute('data-drop');
  if (!v) return null;
  const [kind, n] = v.split(':');
  if (kind === 'space') return { space: Number(n) };
  if (kind === 'post') return { post: Number(n) };
  if (kind === 'nearest') return { nearest: true };
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

/** Which of these centre spaces is nearest the point, by where they are on screen. */
export function nearestSpace(indices: number[], x: number, y: number): number | null {
  const candidates = indices.flatMap(index => {
    const el = document.querySelector(`[data-drop="space:${index}"]`);
    if (!el) return [];
    const r = el.getBoundingClientRect();
    return [{ index, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }];
  });
  return nearestOf(candidates, x, y);
}

export function useDrag(onDrop: (source: PlaySource, target: DropTarget, at: Point) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // remove window listeners if we unmount mid-drag
  useEffect(() => () => { cleanupRef.current?.(); }, []);

  function startDrag(e: React.PointerEvent, card: Card, source: PlaySource) {
    e.preventDefault();
    cleanupRef.current?.(); // a second pointer starting a drag tears down the first
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pointerId = e.pointerId;
    setDrag({ card, source, x: e.clientX, y: e.clientY });

    // Kept in a ref rather than in state: every pointermove appends one, and the
    // ghost's own re-render is already paying for the position. Trimmed to the
    // window flickOf reads, so a long drag cannot grow it without bound.
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
      const flick = flickOf(samples);
      if (ev.type === 'pointerup') {
        const target = parseDrop(document.elementFromPoint(ev.clientX, ev.clientY));
        const at = { x: ev.clientX, y: ev.clientY };
        // An explicit pile under the finger wins: that is somebody placing a card
        // on a square they chose, and it must not be overruled by how fast they
        // happened to get there.
        if (target && !('nearest' in target)) { onDrop(source, target, at); return; }
        // Then the throw, aimed where it was going rather than where it stopped.
        if (flick) { onDrop(source, { nearest: true }, flick); return; }
        if (target) { onDrop(source, target, at); return; }
        return;
      }
      // pointercancel: the OS took the gesture off us mid-throw - an iOS home
      // swipe, an Android back swipe, a second finger landing. The throw itself
      // already happened and was already unambiguous, so it still counts. This is
      // the half of the fix that matters: before it, the one gesture most likely
      // to be stolen was also the one that silently did nothing.
      if (flick) onDrop(source, { nearest: true }, flick);
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
