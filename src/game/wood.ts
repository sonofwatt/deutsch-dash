import type { Tableau } from './types';

export function flipWood(t: Tableau): Tableau {
  const len = t.wood.length;
  if (len === 0) return t;
  const woodIndex = t.woodIndex >= len ? Math.min(3, len) : Math.min(t.woodIndex + 3, len);
  return { ...t, woodIndex };
}

export function rotateWood(t: Tableau): Tableau {
  if (t.wood.length < 2) return t;
  return { ...t, wood: [...t.wood.slice(1), t.wood[0]], woodIndex: 0 };
}
