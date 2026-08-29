import { describe, it, expect } from 'vitest';
import {
  faceGroup, postCountForPlayers, canPlayToCenter, canBuildOnPost,
  refillPosts, sourceTop, takeCard, placeOnPost, hasLegalMove,
  canPlayToSpace, spaceCountForPlayers, isStuck, MAX_SPACES,
  orderlyColumns, suitForSpace, hasReachableMove,
} from './rules';
import type { Card, Suit, Tableau, CenterSpace } from './types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });
const space = (stack: Card[] = []): CenterSpace => ({ stack, history: [] });
const tab = (p: Partial<Tableau> = {}): Tableau =>
  ({ blitz: [], post: [[], [], []], wood: [], woodIndex: 0, ...p });

describe('faceGroup', () => {
  it('red+blue are boy, yellow+green are girl', () => {
    expect(faceGroup('red')).toBe('boy');
    expect(faceGroup('blue')).toBe('boy');
    expect(faceGroup('yellow')).toBe('girl');
    expect(faceGroup('green')).toBe('girl');
  });
});

describe('postCountForPlayers', () => {
  it('5 posts for 2 players, 3 otherwise', () => {
    expect(postCountForPlayers(2)).toBe(5);
    expect(postCountForPlayers(3)).toBe(3);
    expect(postCountForPlayers(8)).toBe(3);
  });
});

describe('spaceCountForPlayers', () => {
  it('is one space per Ace in the game, up to the cap', () => {
    expect(spaceCountForPlayers(2)).toBe(8);
    expect(spaceCountForPlayers(3)).toBe(12);
    expect(spaceCountForPlayers(4)).toBe(16);
    expect(spaceCountForPlayers(5)).toBe(20);
  });
  it('keeps one space per Ace all the way to eight players', () => {
    // The ratio is the whole point: if every space is occupied then every Ace is
    // already down, so nobody can be holding one with nowhere to put it. The old
    // cap of 24 broke that at seven and eight - fatally so on an orderly board,
    // which cannot lend one suit's space to another.
    expect(spaceCountForPlayers(6)).toBe(24);
    expect(spaceCountForPlayers(7)).toBe(28);
    expect(spaceCountForPlayers(8)).toBe(32);
    expect(MAX_SPACES).toBe(32); // = 4 x MAX_PLAYERS: a backstop, no longer a cap
  });
  it('never returns zero for a degenerate room', () => {
    expect(spaceCountForPlayers(0)).toBe(4);
  });
  it('rounds an orderly board up to a whole number of rows', () => {
    // 20 is 8 x 2.5 and 28 is 8 x 3.5: both leave holes in the bottom row.
    expect(spaceCountForPlayers(5, true)).toBe(24);
    expect(spaceCountForPlayers(7, true)).toBe(32);
    for (const n of [2, 3, 4, 6, 8]) {
      expect(spaceCountForPlayers(n, true)).toBe(spaceCountForPlayers(n)); // already divide
    }
    // and rounding is stable: the size it lands on maps to itself, so nothing
    // downstream can disagree about how big the board is.
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const once = spaceCountForPlayers(n, true);
      expect(Math.ceil(once / orderlyColumns(once)) * orderlyColumns(once)).toBe(once);
    }
  });
});

describe('the orderly grid', () => {
  it('is four columns while it fits, eight above that, and never more than 4 deep', () => {
    expect(orderlyColumns(8)).toBe(4);
    expect(orderlyColumns(16)).toBe(4);
    expect(orderlyColumns(24)).toBe(8);
    for (const players of [2, 3, 4, 5, 6, 7, 8]) {
      const count = spaceCountForPlayers(players, true);
      expect(count % orderlyColumns(count)).toBe(0);            // no holes
      expect(count / orderlyColumns(count)).toBeLessThanOrEqual(4); // and no fifth row
    }
  });

  it('gives each suit whole adjacent columns, not a stripe pattern', () => {
    // Four columns: one each, left to right.
    expect([0, 1, 2, 3].map(i => suitForSpace(i, 16))).toEqual(['red', 'blue', 'green', 'yellow']);
    expect(suitForSpace(4, 16)).toBe('red');  // second row, back to the first column
    // Eight columns: a PAIR each, so the board reads as four bands of colour.
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(i => suitForSpace(i, 24)))
      .toEqual(['red', 'red', 'blue', 'blue', 'green', 'green', 'yellow', 'yellow']);
  });

  it('gives every suit exactly as many spaces as there are Aces of it, up to the cap', () => {
    // If all of red's spaces are busy, every red Ace in the game is already down,
    // so nobody can be holding one with nowhere to put it.
    // Now true at EVERY player count, which is what raising MAX_SPACES to 32 was
    // for: an orderly board splits its spaces between four suits and cannot lend
    // one suit's space to another, so a shortfall lands on a single colour.
    for (const players of [2, 3, 4, 5, 6, 7, 8]) {
      const count = spaceCountForPlayers(players, true);
      const reds = Array.from({ length: count }, (_, i) => suitForSpace(i, count))
        .filter(su => su === 'red').length;
      expect(reds).toBeGreaterThanOrEqual(players);
    }
  });
});

describe('isStuck', () => {
  const blocked = [space([c(5, 'red')])]; // only a red 6 could land
  it('is false while a legal move exists, however much wood is left', () => {
    expect(isStuck(tab({ blitz: [c(6, 'red')], wood: [c(9, 'blue')] }), blocked, 99)).toBe(false);
  });
  it('is false with wood still unturned - flip first, that is not stuck', () => {
    // 9 wood cards is three flips to see the pile; one flip proves nothing
    const t = tab({ blitz: [c(9, 'blue')], wood: Array.from({ length: 9 }, () => c(9, 'blue')) });
    expect(isStuck(t, blocked, 1)).toBe(false);
    expect(isStuck(t, blocked, 3)).toBe(true); // been all the way round
  });
  it('is true immediately with no wood at all - nothing left to turn over', () => {
    expect(isStuck(tab({ blitz: [c(9, 'blue')], wood: [] }), blocked, 0)).toBe(true);
  });
});

describe('canPlayToCenter', () => {
  it('only a 1 starts an empty space', () => {
    expect(canPlayToCenter(c(1, 'red'), [])).toBe(true);
    expect(canPlayToCenter(c(2, 'red'), [])).toBe(false);
  });
  it('requires same suit and exactly +1', () => {
    const stack = [c(1, 'red'), c(2, 'red')];
    expect(canPlayToCenter(c(3, 'red', 'other'), stack)).toBe(true);
    expect(canPlayToCenter(c(3, 'blue'), stack)).toBe(false);
    expect(canPlayToCenter(c(4, 'red'), stack)).toBe(false);
  });
});

describe('canPlayToSpace', () => {
  const cleared = (stack: Card[] = []): CenterSpace =>
    ({ stack, history: [Array.from({ length: 10 }, (_, i) => c(i + 1, 'green'))] });

  it('matches canPlayToCenter on an empty space', () => {
    expect(canPlayToSpace(c(1, 'red'), space())).toBe(true);
    expect(canPlayToSpace(c(2, 'red'), space())).toBe(false);
    expect(canPlayToSpace(c(2, 'red'), space([c(1, 'red')]))).toBe(true);
  });
  it('lets a new Ace start on a space whose last pile was cleared away', () => {
    expect(canPlayToSpace(c(1, 'red'), cleared())).toBe(true);
    expect(canPlayToSpace(c(2, 'red'), cleared())).toBe(false); // still needs an Ace
  });
  it('turns away the wrong colour on an orderly space, empty or not', () => {
    // One definition, shared by highlighting, hasLegalMove, isStuck, the bots, the
    // hint and centerPlayTxn - so none of them can offer a move another refuses.
    const red = (stack: Card[] = []): CenterSpace => ({ stack, history: [], suit: 'red' });
    expect(canPlayToSpace(c(1, 'red'), red())).toBe(true);
    expect(canPlayToSpace(c(1, 'blue'), red())).toBe(false);
    expect(canPlayToSpace(c(2, 'red'), red([c(1, 'red')]))).toBe(true);
  });
  it('leaves an ordinary space open to any suit', () => {
    expect(canPlayToSpace(c(1, 'blue'), space())).toBe(true);
  });
});

describe('canBuildOnPost', () => {
  it('requires descending by 1 with alternating face group', () => {
    expect(canBuildOnPost(c(7, 'yellow'), [c(8, 'red')])).toBe(true);   // girl on boy
    expect(canBuildOnPost(c(7, 'green'), [c(8, 'blue')])).toBe(true);
    expect(canBuildOnPost(c(7, 'blue'), [c(8, 'red')])).toBe(false);    // boy on boy
    expect(canBuildOnPost(c(6, 'yellow'), [c(8, 'red')])).toBe(false);  // gap of 2
    expect(canBuildOnPost(c(9, 'yellow'), [c(8, 'red')])).toBe(false);  // ascending
  });
  it('checks the TOP of a stack, and rejects empty stacks', () => {
    expect(canBuildOnPost(c(6, 'red'), [c(8, 'red'), c(7, 'green')])).toBe(true);
    expect(canBuildOnPost(c(7, 'yellow'), [])).toBe(false); // empty slots refill from blitz only
  });
});

describe('refillPosts', () => {
  it('moves blitz top into each empty post slot', () => {
    const t = tab({ blitz: [c(4, 'red'), c(9, 'blue')], post: [[], [c(5, 'green')], []] });
    const out = refillPosts(t);
    expect(out.post[0]).toEqual([c(9, 'blue')]); // blitz TOP (last element) fills first
    expect(out.post[1]).toEqual([c(5, 'green')]);
    expect(out.post[2]).toEqual([c(4, 'red')]);
    expect(out.blitz).toEqual([]);
  });
  it('leaves slots empty when blitz is exhausted, and is a no-op otherwise', () => {
    const t = tab({ blitz: [], post: [[], [c(5, 'green')], []] });
    expect(refillPosts(t)).toEqual(t);
  });
  it('fills slots in order until blitz runs out, leaving the rest empty', () => {
    const t = tab({ blitz: [c(9, 'blue')], post: [[], [c(5, 'green')], []] });
    const out = refillPosts(t);
    expect(out.post[0]).toEqual([c(9, 'blue')]);
    expect(out.post[1]).toEqual([c(5, 'green')]);
    expect(out.post[2]).toEqual([]);
    expect(out.blitz).toEqual([]);
  });
});

describe('sourceTop / takeCard', () => {
  const t = tab({
    blitz: [c(4, 'red'), c(9, 'blue')],
    post: [[c(8, 'red'), c(7, 'green')], [c(2, 'blue')], [c(3, 'green')]],
    wood: [c(1, 'red'), c(2, 'red'), c(3, 'red'), c(4, 'blue')],
    woodIndex: 3,
  });
  it('reads tops without mutating', () => {
    expect(sourceTop(t, { kind: 'blitz' })).toEqual(c(9, 'blue'));
    expect(sourceTop(t, { kind: 'post', index: 0 })).toEqual(c(7, 'green'));
    expect(sourceTop(t, { kind: 'wood' })).toEqual(c(3, 'red')); // wood[woodIndex-1]
    expect(sourceTop(tab(), { kind: 'blitz' })).toBeNull();
    expect(sourceTop(tab({ wood: [c(1, 'red')] }), { kind: 'wood' })).toBeNull(); // nothing flipped
  });
  it('takeCard removes blitz top and refills empty posts from new blitz top', () => {
    const r = takeCard({ ...t, post: [[], [c(2, 'blue')], [c(3, 'green')]] }, { kind: 'blitz' })!;
    expect(r.card).toEqual(c(9, 'blue'));
    expect(r.next.post[0]).toEqual([c(4, 'red')]); // refilled from remaining blitz
    expect(r.next.blitz).toEqual([]);
  });
  it('takeCard from wood decrements woodIndex', () => {
    const r = takeCard(t, { kind: 'wood' })!;
    expect(r.card).toEqual(c(3, 'red'));
    expect(r.next.wood).toEqual([c(1, 'red'), c(2, 'red'), c(4, 'blue')]);
    expect(r.next.woodIndex).toBe(2);
  });
  it('takeCard from a post refills the emptied slot from blitz', () => {
    const r = takeCard(t, { kind: 'post', index: 1 })!;
    expect(r.card).toEqual(c(2, 'blue'));
    expect(r.next.post[1]).toEqual([c(9, 'blue')]);
    expect(r.next.blitz).toEqual([c(4, 'red')]);
  });
  it('returns null for empty sources', () => {
    expect(takeCard(tab(), { kind: 'blitz' })).toBeNull();
    expect(takeCard(tab(), { kind: 'post', index: 0 })).toBeNull();
    expect(takeCard(tab(), { kind: 'wood' })).toBeNull();
  });
});

describe('placeOnPost', () => {
  const t = tab({
    blitz: [c(9, 'blue')],
    post: [[c(8, 'red')], [c(2, 'blue')], [c(5, 'yellow')]],
    wood: [c(7, 'green'), c(4, 'blue')],
    woodIndex: 1,
  });
  it('moves a legal wood card onto a post stack', () => {
    const out = placeOnPost(t, { kind: 'wood' }, 0)!; // green 7 on red 8
    expect(out.post[0]).toEqual([c(8, 'red'), c(7, 'green')]);
    expect(out.wood).toEqual([c(4, 'blue')]);
    expect(out.woodIndex).toBe(0);
  });
  it('moves post top to another post; source slot refills from blitz', () => {
    const t2 = tab({ blitz: [c(9, 'blue')], post: [[c(8, 'red')], [c(7, 'green')], [c(2, 'blue')]] });
    const out = placeOnPost(t2, { kind: 'post', index: 1 }, 0)!;
    expect(out.post[0]).toEqual([c(8, 'red'), c(7, 'green')]);
    expect(out.post[1]).toEqual([c(9, 'blue')]);
    expect(out.blitz).toEqual([]);
  });
  it('rejects illegal builds, empty targets, and self-moves', () => {
    expect(placeOnPost(t, { kind: 'wood' }, 1)).toBeNull();          // 7 on 2
    expect(placeOnPost(t, { kind: 'post', index: 0 }, 0)).toBeNull(); // self
    expect(placeOnPost(tab({ blitz: [c(7, 'green')], post: [[c(8, 'red')], []] }), { kind: 'blitz' }, 1)).toBeNull(); // empty target
  });
});

describe('hasLegalMove', () => {
  it('true when a source can reach the center', () => {
    const t = tab({ blitz: [c(1, 'red')] });
    expect(hasLegalMove(t, [space()])).toBe(true);
  });
  it('true when only a post build exists', () => {
    const t = tab({ blitz: [c(9, 'blue')], post: [[c(8, 'red')], [c(7, 'green')], [c(3, 'blue')]] });
    // post[1] green 7 fits on post[0] red 8; nothing fits center (no 1s, center empty needs 1)
    expect(hasLegalMove(t, [space()])).toBe(true);
  });
  it('counts a cleared space as somewhere to play again', () => {
    const t = tab({ blitz: [c(1, 'red')] });
    const cleared: CenterSpace = { stack: [], history: [Array.from({ length: 10 }, (_, i) => c(i + 1, 'blue'))] };
    expect(hasLegalMove(t, [cleared])).toBe(true);  // the finished pile moved to the rail
    expect(hasLegalMove(t, [space([c(5, 'red')])])).toBe(false); // an occupied one does not
  });
  it('false when nothing fits anywhere', () => {
    const t = tab({ blitz: [c(9, 'blue')], post: [[c(8, 'blue')], [c(4, 'yellow')], [c(3, 'green')]],
                    wood: [c(10, 'green')], woodIndex: 1 });
    expect(hasLegalMove(t, [space([c(1, 'red')])])).toBe(false);
  });
});

describe('hasReachableMove and being stuck', () => {
  const card = (v: number, suit: Suit = 'red'): Card => ({ v, suit, owner: 'me' });
  const empty = (n: number): CenterSpace[] => Array.from({ length: n }, () => ({ stack: [], history: [] }));
  // Nothing face up can go anywhere: no Ace on top of anything, and the posts are
  // empty so nothing can be built on them either.
  const hand = (wood: Card[]): Tableau =>
    ({ blitz: [card(7)], post: [[], [], []], wood, woodIndex: 0 });

  it('sees a move that is only reachable by turning the wood over', () => {
    // The Ace is first in the pile, so at three a turn it is NEVER the top card:
    // the cycle shows 3, 6, 9 and this sits at 1. The player is not stuck - they
    // simply cannot get to it - and telling them they have no moves is wrong.
    const wood = [card(1), card(5), card(6), card(8), card(9), card(4)];
    const t = hand(wood);
    expect(hasLegalMove(t, empty(8))).toBe(false);
    expect(hasReachableMove(t, empty(8), 3)).toBe(false);
    expect(hasReachableMove(t, empty(8), 1)).toBe(true);
  });

  it('is not stuck when the cycle itself reaches a move', () => {
    // Same hand with the Ace at position 3, which the three-a-turn cycle DOES
    // land on. hasLegalMove still says no - it is not face up yet.
    const t = hand([card(5), card(6), card(1), card(8), card(9), card(4)]);
    expect(hasLegalMove(t, empty(8))).toBe(false);
    expect(hasReachableMove(t, empty(8))).toBe(true);
    // ...and being unable to play RIGHT NOW is therefore not being stuck, however
    // many times they have already been round the pile.
    expect(isStuck(t, empty(8), 99)).toBe(false);
  });

  it('still calls a genuinely dead hand stuck once the pile has been round', () => {
    const t = hand([card(5), card(6), card(7), card(8), card(9), card(4)]);
    expect(hasReachableMove(t, empty(8))).toBe(false);
    expect(isStuck(t, empty(8), 0)).toBe(false);   // give them the cycle first
    expect(isStuck(t, empty(8), 2)).toBe(true);
  });

  it('counts the cycle in single-card turns while the rescue is on', () => {
    // Six cards is two turns at three and six at one, so the bar for "been all
    // the way round without progress" has to move with the step size.
    const t = hand([card(5), card(6), card(7), card(8), card(9), card(4)]);
    expect(isStuck(t, empty(8), 3, 1)).toBe(false);
    expect(isStuck(t, empty(8), 6, 1)).toBe(true);
  });
});
