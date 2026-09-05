import { describe, it, expect } from 'vitest';
import {
  normalizeSpace, normalizeSpaces, normalizeTableau, centerPlayTxn, orderlySpaces, reconcileTableau,
} from './center';
import type { Card, Suit, CenterSpace } from './types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });

describe('normalize', () => {
  it('fills missing space fields', () => {
    expect(normalizeSpace(null)).toEqual({ stack: [], history: [] });
    expect(normalizeSpace({ stack: [c(1, 'red')] })).toEqual({ stack: [c(1, 'red')], history: [] });
  });
  it('returns exactly the number of spaces asked for', () => {
    expect(normalizeSpaces(null, 16)).toHaveLength(16);
    expect(normalizeSpaces(null, 8)).toHaveLength(8); // a two-player board
    const arr = normalizeSpaces({ 3: { stack: [c(1, 'red')] } }, 16);
    expect(arr[3].stack).toEqual([c(1, 'red')]);
    expect(arr[0]).toEqual({ stack: [], history: [] });
  });
  it('never puts an undefined suit on an ordinary space', () => {
    // centerPlayTxn spreads this object straight back into RTDB, and an undefined
    // value is rejected outright - so the key has to be ABSENT, not empty.
    expect('suit' in normalizeSpace(null)).toBe(false);
    expect('suit' in normalizeSpace({ stack: [c(1, 'red')] })).toBe(false);
    expect(normalizeSpace({ suit: 'blue' }).suit).toBe('blue'); // and kept when it is there
  });
  it('fills in the orderly suits a client has not been sent yet', () => {
    // startRound writes them, which is what makes them enforceable server-side.
    // Filling them in here too means a client is never briefly playing looser
    // rules than the ones the transaction will hold it to.
    const arr = normalizeSpaces(null, 16, true);
    expect(arr.map(sp => sp.suit).slice(0, 4)).toEqual(['red', 'blue', 'green', 'yellow']);
    expect(normalizeSpaces(null, 16).every(sp => sp.suit === undefined)).toBe(true);
  });
  it('seeds an orderly round with every space already spoken for', () => {
    const seeded = orderlySpaces(24);
    expect(seeded).toHaveLength(24);
    expect(seeded[0]).toEqual({ stack: [], history: [], suit: 'red' });
    expect(new Set(seeded.map(sp => sp.suit)).size).toBe(4);
  });
  it('restores tableau shape with fixed post count', () => {
    const t = normalizeTableau({ dash: [c(2, 'red')], woodIndex: 0 }, 3);
    expect(t).toEqual({ dash: [c(2, 'red')], post: [[], [], []], wood: [], woodIndex: 0 });
    const t5 = normalizeTableau({ post: { 1: [c(4, 'blue')] } }, 5);
    expect(t5.post).toEqual([[], [c(4, 'blue')], [], [], []]);
  });
});

describe('centerPlayTxn', () => {
  it('starts a pile with a 1 on an empty/null space', () => {
    expect(centerPlayTxn(c(1, 'red'))(null)).toEqual({ stack: [c(1, 'red')], history: [] });
  });
  it('appends a legal next card', () => {
    const space: CenterSpace = { stack: [c(1, 'red')], history: [] };
    expect(centerPlayTxn(c(2, 'red', 'other'))(space)!.stack).toHaveLength(2);
  });
  it('aborts (undefined) on an illegal play - the lost-race case', () => {
    const space: CenterSpace = { stack: [c(1, 'red'), c(2, 'red')], history: [] };
    expect(centerPlayTxn(c(2, 'red'))(space)).toBeUndefined();
    expect(centerPlayTxn(c(1, 'blue'))(space)).toBeUndefined();
  });
  it('refuses the wrong colour on an orderly space - the server-side half of it', () => {
    // The client will not offer the move, but the client is not what is trusted:
    // this is the transaction that actually decides, running against the server's
    // own copy of the space, suit and all.
    const red: CenterSpace = { stack: [], history: [], suit: 'red' };
    expect(centerPlayTxn(c(1, 'blue'))(red)).toBeUndefined();
    expect(centerPlayTxn(c(1, 'red'))(red)!.stack).toEqual([c(1, 'red')]);
    // and the constraint survives the write, rather than being spread away
    expect(centerPlayTxn(c(1, 'red'))(red)!.suit).toBe('red');
  });
  it('keeps an orderly space spoken for after its pile completes', () => {
    // The archive branch used to rebuild the space from scratch, which dropped the
    // suit - so an orderly board came apart one finished pile at a time.
    const nine = Array.from({ length: 9 }, (_, i) => c(i + 1, 'red'));
    const done = centerPlayTxn(c(10, 'red'))({ stack: nine, history: [], suit: 'red' })!;
    expect(done.stack).toEqual([]);
    expect(done.history).toHaveLength(1);
    expect(done.suit).toBe('red');
    expect(centerPlayTxn(c(1, 'blue'))(done)).toBeUndefined();
  });
  it('archives a completed 1..10 stack atomically, freeing the space', () => {
    const stack = Array.from({ length: 9 }, (_, i) => c(i + 1, 'green'));
    const out = centerPlayTxn(c(10, 'green'))({ stack, history: [] })!;
    expect(out.stack).toEqual([]);
    expect(out.history).toHaveLength(1);
    expect(out.history[0]).toHaveLength(10);
  });
  it('lets a new Ace reuse a cleared space, keeping the archive', () => {
    const cleared: CenterSpace = {
      stack: [], history: [Array.from({ length: 10 }, (_, i) => c(i + 1, 'green'))],
    };
    const out = centerPlayTxn(c(1, 'red'))(cleared)!;
    expect(out.stack).toEqual([c(1, 'red')]);
    expect(out.history).toHaveLength(1); // the finished pile is still counted on the rail
    expect(centerPlayTxn(c(2, 'red'))(cleared)).toBeUndefined();
  });
});

describe('reconcileTableau', () => {
  it('drops my cards that already made it to the center', () => {
    const dupe = c(3, 'red', 'me');
    const t = { dash: [dupe, c(9, 'blue', 'me')], post: [[c(3, 'red', 'other')]],
                wood: [c(5, 'green', 'me')], woodIndex: 0 };
    const spaces = normalizeSpaces({ 0: { stack: [c(3, 'red', 'me')] } }, 16);
    const out = reconcileTableau(t, spaces);
    expect(out.dash).toEqual([c(9, 'blue', 'me')]);
    expect(out.post).toEqual([[c(3, 'red', 'other')]]); // other players' ids never match mine
    expect(out.wood).toEqual([c(5, 'green', 'me')]);
  });
  it('repositions the wood pointer when a flipped card was reclaimed by the center', () => {
    const t = {
      dash: [], post: [[]],
      wood: [c(1, 'red'), c(2, 'red'), c(3, 'red'), c(4, 'blue'), c(5, 'blue')],
      woodIndex: 3, // flipped top is red 3
    };
    const spaces = normalizeSpaces({ 0: { stack: [c(3, 'red')] } }, 16); // red 3 already in center
    const out = reconcileTableau(t, spaces);
    expect(out.wood).toEqual([c(1, 'red'), c(2, 'red'), c(4, 'blue'), c(5, 'blue')]);
    expect(out.woodIndex).toBe(2); // top is now red 2, same as a normal play would leave it
  });
});

describe('a pile is read defensively', () => {
  // The centre spaces are writable by any authed client, so a stack is whatever
  // was put there. A null in it used to reach cardId() in reconcileTableau and
  // throw on every client in the room.
  it('keeps only the entries that are cards', () => {
    const junk = [c(1, 'red'), null, 7, 'card', { v: 2 }, { v: '3', suit: 'red', owner: 'me' }, c(2, 'red')];
    expect(normalizeSpace({ stack: junk }).stack).toEqual([c(1, 'red'), c(2, 'red')]);
    expect(normalizeTableau({ dash: junk, post: { 0: junk }, wood: junk }, 3).dash).toEqual([c(1, 'red'), c(2, 'red')]);
    // A history entry with no cards in it is dropped outright: the rails read
    // run[0].suit off every one.
    expect(normalizeSpace({ history: [junk, 'nope', 5, []] }).history).toEqual([[c(1, 'red'), c(2, 'red')]]);
  });
  it('ignores a suit that is not a suit', () => {
    expect('suit' in normalizeSpace({ suit: 'plaid' })).toBe(false);
    expect('suit' in normalizeSpace({ suit: 7 })).toBe(false);
  });
  it('holds the wood index inside the pile', () => {
    const wood = [c(1, 'red'), c(2, 'red')];
    expect(normalizeTableau({ wood, woodIndex: 99 }, 3).woodIndex).toBe(2);
    expect(normalizeTableau({ wood, woodIndex: -4 }, 3).woodIndex).toBe(0);
    expect(normalizeTableau({ wood, woodIndex: 'two' }, 3).woodIndex).toBe(0);
    expect(normalizeTableau({ wood, woodIndex: 1 }, 3).woodIndex).toBe(1);
  });
  it('reads a pile that is not an object as empty', () => {
    expect(normalizeTableau('nope', 3)).toEqual({ dash: [], post: [[], [], []], wood: [], woodIndex: 0 });
  });

  it('takes the owner from the pile it is in, for a card stored without one', () => {
    // `owner` is on its way out of what a tableau stores: inside round/tableaus/$uid
    // it is the path key repeated on every card, which is about half the size of an
    // eight-player deal. Reading it back has to work either way for as long as any
    // room still holds cards written the old way.
    const stored = { dash: [{ v: 4, suit: 'red' }], wood: [{ v: 9, suit: 'blue', owner: 'me' }] };
    const t = normalizeTableau(stored, 3, 'me');
    expect(t.dash).toEqual([{ v: 4, suit: 'red', owner: 'me' }]);   // filled in
    expect(t.wood).toEqual([{ v: 9, suit: 'blue', owner: 'me' }]);  // and left alone when present
  });

  it('drops a card with no owner when no pile owner is given, which is a centre space', () => {
    // A centre space keeps its owners: the card has left the hand that dealt it,
    // and the badge on it, the race flashes and the rivalry tallies all read it.
    expect(normalizeTableau({ dash: [{ v: 4, suit: 'red' }] }, 3).dash).toEqual([]);
    expect(normalizeSpace({ stack: [{ v: 4, suit: 'red' }] }).stack).toEqual([]);
    expect(normalizeSpace('nope')).toEqual({ stack: [], history: [] });
  });
});
