import type { Card, CenterSpace, FaceGroup, PlaySource, Suit, Tableau } from './types';
import { SUITS } from './deck';
import { WOOD_STEP, woodCycleTops } from './wood';

export function faceGroup(suit: Suit): FaceGroup {
  return suit === 'red' || suit === 'blue' ? 'boy' : 'girl';
}

export function postCountForPlayers(playerCount: number): number {
  return playerCount === 2 ? 5 : 3;
}

/**
 * Never more than this many centre spaces. It is 4 x MAX_PLAYERS, so at the real
 * player ceiling the cap does not bind at all any more - it is a backstop against
 * a nonsense player count, not a design choice. It used to be 24, which DID bind
 * at seven and eight players; see spaceCountForPlayers for why that had to go.
 */
export const MAX_SPACES = 32;

/**
 * Centre spaces for a game. 4 x players, and that ratio is load-bearing rather
 * than cosmetic: only an Ace opens a space, and each player holds exactly one Ace
 * per suit, so 4 x players is one space per Ace in the game. Never going BELOW it
 * is what guarantees an Ace always has somewhere to go - if every space is
 * occupied, every Ace is already down and nobody can be holding one. Going above
 * it is free, which is what lets two players have a square board.
 *
 * The old cap of 24 broke that at seven and eight players, where 28 and 32 Aces
 * competed for 24 spaces. On an ordinary board that is survivable (a full board is
 * transient - the next pile to finish frees a space, and genuine deadlock is what
 * the stuck detection is for), but an orderly board divides the spaces between
 * four suits and cannot lend one suit's space to another, so the shortfall lands
 * on a single colour and starves it. Eight players now get 32 spaces and the
 * slots shrink to fit; see --slot in game.css, which sizes on the container.
 *
 * Two players get 8 (not the old fixed 16), which is why cards are bigger there.
 */
export function spaceCountForPlayers(playerCount: number, orderly = false): number {
  // Two players are the one size 4 x players lays out badly: eight spaces is
  // 3 + 3 + 2 at three columns and a wide strip at four, and neither reads as a
  // board. A ninth makes it a 3 x 3 square. It costs nothing, because the ratio
  // below is a FLOOR and not an equality - the guarantee is that no Ace can be
  // left homeless, and nine spaces for eight Aces keeps it with one to spare.
  const natural = playerCount === 2 ? 9 : Math.min(MAX_SPACES, 4 * Math.max(1, playerCount));
  if (!orderly) return natural;
  // One colour per column means the columns come in fours, so an orderly board
  // has to be a whole number of rows deep: 20 is 8 x 2.5 and 28 is 8 x 3.5, both
  // of which leave holes in the bottom row. Round up to fill it. Stable under its
  // own output - 20 -> 24 and 28 -> 32 both land on a size that maps to itself.
  const cols = orderlyColumns(natural);
  return Math.ceil(natural / cols) * cols;
}

/**
 * Columns on an orderly board: four (a column per suit) while the board is small
 * enough, eight (a pair per suit) above that. Height is the scarce axis on a
 * phone - four columns at 24 spaces would be six rows deep, which does not fit
 * under the opponent strip with a tableau below it.
 */
export function orderlyColumns(count: number): number {
  return count > 16 ? 8 : 4;
}

/**
 * Which suit owns a space. Adjacent columns are grouped per suit rather than
 * interleaved, so eight columns read as four wide bands of colour instead of a
 * stripe pattern nobody can parse at a glance.
 */
export function suitForSpace(index: number, count: number): Suit {
  const cols = orderlyColumns(count);
  return SUITS[Math.floor((index % cols) / (cols / 4))];
}

export function canPlayToCenter(card: Card, stack: Card[]): boolean {
  if (stack.length === 0) return card.v === 1;
  const top = stack[stack.length - 1];
  return card.suit === top.suit && card.v === top.v + 1;
}

/**
 * Space-level legality. A completed pile is archived into space.history and its
 * stack cleared, freeing the space for a new Ace, so this is just the stack test
 * - it stays a named function because every caller (highlighting, the bot, the
 * centre transaction) must agree on one definition of "can this land here".
 */
export function canPlayToSpace(card: Card, space: CenterSpace): boolean {
  // The orderly-grid constraint is enforced HERE, in the one definition every
  // caller shares, so highlighting, hasLegalMove, isStuck, the bots, the hint and
  // the centre transaction cannot disagree about it. Getting this wrong would let
  // a player be declared stuck with a move they can see.
  if (space.suit && card.suit !== space.suit) return false;
  return canPlayToCenter(card, space.stack);
}

export function canBuildOnPost(card: Card, stack: Card[]): boolean {
  if (stack.length === 0) return false;
  const top = stack[stack.length - 1];
  return card.v === top.v - 1 && faceGroup(card.suit) !== faceGroup(top.suit);
}

export function refillPosts(t: Tableau): Tableau {
  if (!t.post.some(s => s.length === 0) || t.blitz.length === 0) return t;
  const blitz = [...t.blitz];
  const post = t.post.map(s => {
    if (s.length > 0 || blitz.length === 0) return s;
    return [blitz.pop() as Card];
  });
  return { ...t, blitz, post };
}

export function sourceTop(t: Tableau, source: PlaySource): Card | null {
  if (source.kind === 'blitz') return t.blitz[t.blitz.length - 1] ?? null;
  if (source.kind === 'wood') return t.woodIndex > 0 ? t.wood[t.woodIndex - 1] ?? null : null;
  const stack = t.post[source.index];
  return stack ? stack[stack.length - 1] ?? null : null;
}

export function takeCard(t: Tableau, source: PlaySource): { next: Tableau; card: Card } | null {
  const card = sourceTop(t, source);
  if (!card) return null;
  let next: Tableau;
  if (source.kind === 'blitz') {
    next = { ...t, blitz: t.blitz.slice(0, -1) };
  } else if (source.kind === 'wood') {
    const wood = [...t.wood];
    wood.splice(t.woodIndex - 1, 1);
    next = { ...t, wood, woodIndex: t.woodIndex - 1 };
  } else {
    next = { ...t, post: t.post.map((s, i) => (i === source.index ? s.slice(0, -1) : s)) };
  }
  return { next: refillPosts(next), card };
}

export function placeOnPost(t: Tableau, source: PlaySource, postIndex: number): Tableau | null {
  if (source.kind === 'post' && source.index === postIndex) return null;
  const card = sourceTop(t, source);
  const target = t.post[postIndex];
  if (!card || !target || !canBuildOnPost(card, target)) return null;
  const taken = takeCard(t, source);
  if (!taken) return null;
  // note: takeCard already refilled slots; now add the card to the target stack
  const post = taken.next.post.map((s, i) => (i === postIndex ? [...s, card] : s));
  return refillPosts({ ...taken.next, post });
}

/**
 * Is this player genuinely stuck, as opposed to merely out of moves this instant?
 *
 * "No legal move" alone is not enough: with wood left they can turn the next
 * three over and try again, which is exactly what the old "I'm stuck" button got
 * wrong - it let you claim stuck with 25 unflipped wood cards. Two cases are
 * conclusive:
 *
 *  - No wood at all. flipWood is a no-op at zero cards and a player's own tops
 *    cannot change without a play, so nothing they do alone will help. Only
 *    another player's centre play can free them.
 *  - They have turned over the whole pile since their last successful play
 *    (a flip advances 3, so ceil(wood/3) flips is one full traversal) and still
 *    have nothing. Only a rotation, which changes which third of the pile is
 *    reachable, can help.
 */
export function isStuck(
  t: Tableau, spaces: CenterSpace[], flipsSinceProgress: number, step: number = WOOD_STEP,
): boolean {
  // Reachable, not merely playable. A card three turns down the wood is a move
  // this player has, and telling them they have none while they can still turn
  // the pile over to it is simply wrong - which is what the table reported.
  if (hasReachableMove(t, spaces, step)) return false;
  if (t.wood.length === 0) return true;
  return flipsSinceProgress >= Math.ceil(t.wood.length / step);
}

/**
 * Can this player move AT ALL, counting what turning the wood over would bring
 * them? `hasLegalMove` answers "right now, with what is face up"; this answers
 * "at any point in the cycle, without anybody else doing anything".
 *
 * The gap between the two is the whole point: at three cards a turn only every
 * third card is ever exposed, so a hand can be full of moves none of which can be
 * reached. That gap is also what the host's single-card rescue closes.
 */
export function hasReachableMove(
  t: Tableau, spaces: CenterSpace[], step: number = WOOD_STEP,
): boolean {
  if (hasLegalMove(t, spaces)) return true;
  for (const card of woodCycleTops(t, step)) {
    if (spaces.some(sp => canPlayToSpace(card, sp))) return true;
    if (t.post.some(stack => canBuildOnPost(card, stack))) return true;
  }
  return false;
}

export function hasLegalMove(t: Tableau, spaces: CenterSpace[]): boolean {
  const sources: PlaySource[] = [
    { kind: 'blitz' }, { kind: 'wood' },
    ...t.post.map((_, index) => ({ kind: 'post' as const, index })),
  ];
  for (const source of sources) {
    const card = sourceTop(t, source);
    if (!card) continue;
    if (spaces.some(sp => canPlayToSpace(card, sp))) return true;
    for (let j = 0; j < t.post.length; j++) {
      if (source.kind === 'post' && source.index === j) continue;
      if (canBuildOnPost(card, t.post[j])) return true;
    }
  }
  return false;
}
