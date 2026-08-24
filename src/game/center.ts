import type { Card, CenterSpace, Tableau } from './types';
import { cardId } from './types';
import { canPlayToCenter } from './rules';

function asCards(raw: unknown): Card[] {
  return Array.isArray(raw) ? (raw as Card[]) : raw ? (Object.values(raw) as Card[]) : [];
}

export function normalizeSpace(raw: unknown): CenterSpace {
  const r = (raw ?? {}) as { stack?: unknown; history?: unknown };
  const history = r.history
    ? (Array.isArray(r.history) ? r.history : Object.values(r.history)).map(asCards)
    : [];
  return { stack: asCards(r.stack), history };
}

export function normalizeSpaces(raw: unknown): CenterSpace[] {
  const r = (raw ?? {}) as Record<number, unknown>;
  return Array.from({ length: 16 }, (_, i) => normalizeSpace(r[i]));
}

export function normalizeTableau(raw: unknown, postCount: number): Tableau {
  const r = (raw ?? {}) as { blitz?: unknown; post?: unknown; wood?: unknown; woodIndex?: number };
  const rawPost = (r.post ?? {}) as Record<number, unknown>;
  return {
    blitz: asCards(r.blitz),
    post: Array.from({ length: postCount }, (_, i) => asCards(rawPost[i])),
    wood: asCards(r.wood),
    woodIndex: r.woodIndex ?? 0,
  };
}

export function centerPlayTxn(card: Card) {
  return (raw: unknown): CenterSpace | undefined => {
    const space = normalizeSpace(raw);
    if (!canPlayToCenter(card, space.stack)) return undefined;
    const stack = [...space.stack, card];
    if (stack.length === 10) return { stack: [], history: [...space.history, stack] };
    return { ...space, stack };
  };
}

export function reconcileTableau(t: Tableau, spaces: CenterSpace[]): Tableau {
  const centerIds = new Set(
    spaces.flatMap(s => [...s.stack, ...s.history.flat()]).map(cardId),
  );
  if (centerIds.size === 0) return t;
  const keep = (c: Card) => !centerIds.has(cardId(c));
  const removedFlipped = t.wood.slice(0, t.woodIndex).filter(c => !keep(c)).length;
  return {
    ...t,
    blitz: t.blitz.filter(keep),
    post: t.post.map(s => s.filter(keep)),
    wood: t.wood.filter(keep),
    woodIndex: t.woodIndex - removedFlipped,
  };
}
