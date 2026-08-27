import type { Card, CenterSpace, Suit, Tableau } from './types';
import { cardId } from './types';
import { canPlayToSpace, suitForSpace } from './rules';

function asCards(raw: unknown): Card[] {
  return Array.isArray(raw) ? (raw as Card[]) : raw ? (Object.values(raw) as Card[]) : [];
}

export function normalizeSpace(raw: unknown): CenterSpace {
  const r = (raw ?? {}) as { stack?: unknown; history?: unknown; suit?: Suit };
  const history = r.history
    ? (Array.isArray(r.history) ? r.history : Object.values(r.history)).map(asCards)
    : [];
  const space: CenterSpace = { stack: asCards(r.stack), history };
  // Set only when it exists, never as `suit: undefined`: centerPlayTxn spreads
  // this object straight back into RTDB, which rejects an undefined value.
  if (r.suit) space.suit = r.suit;
  return space;
}

export function normalizeSpaces(raw: unknown, count: number, orderly = false): CenterSpace[] {
  const r = (raw ?? {}) as Record<number, unknown>;
  return Array.from({ length: count }, (_, i) => {
    const space = normalizeSpace(r[i]);
    // startRound writes the suits, which is what makes them enforceable in the
    // transaction. Filling them in here as well means a client is never briefly
    // playing by looser rules than the ones the server will hold it to.
    return orderly && !space.suit ? { ...space, suit: suitForSpace(i, count) } : space;
  });
}

/** The board an orderly round starts from: empty, and already spoken for. */
export function orderlySpaces(count: number): CenterSpace[] {
  return Array.from({ length: count }, (_, i) => ({ stack: [], history: [], suit: suitForSpace(i, count) }));
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

/**
 * Whose card is on top of this space - which is to say, who won any race for it.
 *
 * The stack is normally the answer, but a 10 completes the pile and the
 * transaction below archives the run and clears the stack on the spot, so the
 * most contested card in a pile is exactly the one that leaves nothing on top.
 * Fall back to the last card of the run that just finished.
 */
export function spaceOwner(space: CenterSpace | null | undefined): string | null {
  if (!space) return null;
  if (space.stack?.length) return space.stack[space.stack.length - 1].owner;
  const done = space.history?.[space.history.length - 1];
  return done?.[done.length - 1]?.owner ?? null;
}

export function centerPlayTxn(card: Card) {
  return (raw: unknown): CenterSpace | undefined => {
    const space = normalizeSpace(raw);
    if (!canPlayToSpace(card, space)) return undefined;
    const stack = [...space.stack, card];
    // Completed: archive the run and clear the stack, which frees the space for
    // a new Ace. history is what the finished-pile rails count and colour.
    // Spread the space, don't rebuild it: an orderly space keeps its suit when its
    // pile completes, or the board quietly stops being orderly one pile at a time.
    if (stack.length === 10) return { ...space, stack: [], history: [...space.history, stack] };
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
