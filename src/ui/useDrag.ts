import { useEffect, useRef, useState } from 'react';
import type React from 'react'; // React.PointerEvent type only (new-JSX files do not auto-import React)
import type { Card, PlaySource } from '../game/types';

export type DropTarget = { space: number } | { post: number } | { nearest: true };
export interface Point { x: number; y: number }

export interface DragState { card: Card; source: PlaySource; x: number; y: number }

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

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      setDrag(d => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d));
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      setDrag(null);
      if (ev.type === 'pointerup') {
        const target = parseDrop(document.elementFromPoint(ev.clientX, ev.clientY));
        if (target) onDrop(source, target, { x: ev.clientX, y: ev.clientY });
      }
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
