import type { Card, CenterSpace, Suit, Tableau } from './types';
import { cardId } from './types';
import { canPlayToSpace, suitForSpace } from './rules';
import { SUITS } from './deck';

/**
 * Everything under a room is written by some client, and the centre spaces by
 * ANY authed client, so a pile is whatever was put there. A stack entry that is
 * not a card - a null, a number, an object missing its owner - used to reach
 * cardId() in reconcileTableau and the snapshot handler and throw there, on
 * every client in the room. Anything that is not a card is simply not in the pile.
 */
export function isCard(x: unknown): x is Card {
  if (!x || typeof x !== 'object') return false;
  const c = x as Partial<Card>;
  return typeof c.v === 'number' && Number.isFinite(c.v)
    && typeof c.suit === 'string' && typeof c.owner === 'string';
}

/**
 * A card as a tableau pile STORES one. `owner` is optional there and only there:
 * inside `round/tableaus/$uid` it is the path key repeated on every card, and the
 * rules validate it against that key rather than trusting it, so storing it buys
 * nothing and costs 28 characters a card - about half an eight-player deal.
 *
 * A centre space is different and keeps its owners: a card on the board has left
 * the hand that dealt it, and the badge on it, the race flashes and the rivalry
 * tallies all read it. `isCard` above stays strict for exactly that.
 */
function isCardBody(x: unknown): x is { v: number; suit: string; owner?: unknown } {
  if (!x || typeof x !== 'object') return false;
  const c = x as { v?: unknown; suit?: unknown };
  return typeof c.v === 'number' && Number.isFinite(c.v) && typeof c.suit === 'string';
}

/**
 * `owner` given: a pile inside somebody's tableau, and any card missing an owner
 * takes theirs. Omitted: read strictly, which is what a centre space wants.
 */
function asCards(raw: unknown, owner?: string): Card[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
  if (owner === undefined) return list.filter(isCard);
  return list.filter(isCardBody)
    .map(c => (typeof c.owner === 'string' ? c : { ...c, owner }) as Card);
}

export function normalizeSpace(raw: unknown): CenterSpace {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { stack?: unknown; history?: unknown; suit?: unknown };
  // A run that filtered down to nothing was never a run: the finished-pile rails
  // read the first card of each for its colour.
  const history = r.history && typeof r.history === 'object'
    ? (Array.isArray(r.history) ? r.history : Object.values(r.history)).map(run => asCards(run)).filter(run => run.length > 0)  // no owner: a centre run is read strictly
    : [];
  const space: CenterSpace = { stack: asCards(r.stack), history };
  // Set only when it exists, never as `suit: undefined`: centerPlayTxn spreads
  // this object straight back into RTDB, which rejects an undefined value. And
  // only when it is a suit: anything else would lock the space to a colour that
  // no card has.
  if (typeof r.suit === 'string' && (SUITS as string[]).includes(r.suit)) space.suit = r.suit as Suit;
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

export function normalizeTableau(raw: unknown, postCount: number, owner?: string): Tableau {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { dash?: unknown; post?: unknown; wood?: unknown; woodIndex?: unknown };
  const rawPost = (r.post && typeof r.post === 'object' ? r.post : {}) as Record<number, unknown>;
  const wood = asCards(r.wood, owner);
  // Held inside the pile: an index past the end reads a card that is not there.
  const woodIndex = typeof r.woodIndex === 'number' && Number.isInteger(r.woodIndex)
    ? Math.min(Math.max(r.woodIndex, 0), wood.length) : 0;
  return {
    dash: asCards(r.dash, owner),
    post: Array.from({ length: postCount }, (_, i) => asCards(rawPost[i], owner)),
    wood,
    woodIndex,
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
    dash: t.dash.filter(keep),
    post: t.post.map(s => s.filter(keep)),
    wood: t.wood.filter(keep),
    woodIndex: t.woodIndex - removedFlipped,
  };
}
