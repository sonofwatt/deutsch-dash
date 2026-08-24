import { describe, it, expect } from 'vitest';
import {
  faceGroup, postCountForPlayers, canPlayToCenter, canBuildOnPost,
  refillPosts, sourceTop, takeCard, placeOnPost, hasLegalMove,
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
  it('false when nothing fits anywhere', () => {
    const t = tab({ blitz: [c(9, 'blue')], post: [[c(8, 'blue')], [c(4, 'yellow')], [c(3, 'green')]],
                    wood: [c(10, 'green')], woodIndex: 1 });
    expect(hasLegalMove(t, [space([c(1, 'red')])])).toBe(false);
  });
});
