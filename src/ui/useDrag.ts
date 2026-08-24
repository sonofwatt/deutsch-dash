import { useRef, useState } from 'react';
import type React from 'react'; // React.PointerEvent type only (new-JSX files do not auto-import React)
import type { Card, PlaySource } from '../game/types';

export type DropTarget = { space: number } | { post: number };

export interface DragState { card: Card; source: PlaySource; x: number; y: number }

export function parseDrop(el: Element | null): DropTarget | null {
  const host = el?.closest('[data-drop]');
  const v = host?.getAttribute('data-drop');
  if (!v) return null;
  const [kind, n] = v.split(':');
  if (kind === 'space') return { space: Number(n) };
  if (kind === 'post') return { post: Number(n) };
  return null;
}

export function useDrag(onDrop: (source: PlaySource, target: DropTarget) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const active = useRef<{ pointerId: number } | null>(null);

  function startDrag(e: React.PointerEvent, card: Card, source: PlaySource) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    active.current = { pointerId: e.pointerId };
    setDrag({ card, source, x: e.clientX, y: e.clientY });

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== active.current?.pointerId) return;
      setDrag(d => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d));
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== active.current?.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      active.current = null;
      setDrag(null);
      if (ev.type === 'pointerup') {
        const target = parseDrop(document.elementFromPoint(ev.clientX, ev.clientY));
        if (target) onDrop(source, target);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  return { drag, startDrag };
}
