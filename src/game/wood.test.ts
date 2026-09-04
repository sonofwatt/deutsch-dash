import { describe, it, expect } from 'vitest';
import { flipWood, rotateWood, sinkWoodTop, woodCycleTops } from './wood';
import type { Card, Suit, Tableau } from './types';

const c = (v: number, suit: Suit): Card => ({ v, suit, owner: 'me' });
const woodTab = (wood: Card[], woodIndex = 0): Tableau =>
  ({ dash: [], post: [[], [], []], wood, woodIndex });
const cards = (n: number) => Array.from({ length: n }, (_, i) => c(i + 1, 'red'));
/** The cards showing on the flipped pile: what a turn just brought over. */
const showing = (t: Tableau) => t.wood.slice(Math.max(0, t.woodIndex - 3), t.woodIndex).map(x => x.v);

describe('flipWood', () => {
  it('brings three cards every turn, and all three stay on the flipped pile', () => {
    // Reported from a table: the pile counted out a short group of 1 or 2 at the
    // end and the NEXT tap started again at the top. A turn deals three. With one
    // card left, that card is turned, every card ALREADY face up goes back under
    // it, and two more come off the top of those to finish the turn - and all
    // three of them are on the flipped pile afterwards, which is the half a player
    // can actually see.
    const t = woodTab(cards(7));
    const f1 = flipWood(t);
    expect(showing(f1)).toEqual([1, 2, 3]);
    const f2 = flipWood(f1);
    expect(showing(f2)).toEqual([4, 5, 6]);
    const f3 = flipWood(f2);
    expect(showing(f3)).toEqual([7, 1, 2]); // the last one, then the pile over, then two
    expect(f3.wood.map(x => x.v)).toEqual([7, 1, 2, 3, 4, 5, 6]); // the pile turned with it
    expect(f3.woodIndex).toBe(3);           // three face up, the rest face down under them
  });

  it('never deals a short group, and never shows the same tops twice round', () => {
    // The ten-card case from the report, tapped all the way round. Ten and three
    // share no factor, so every card gets a turn on top and the cycle is ten taps
    // long. It used to be four: the 3rd, 6th, 9th and 10th, for ever.
    let t = woodTab(cards(10));
    const tops: number[] = [];
    for (let n = 0; n < 10; n++) {
      t = flipWood(t);
      expect(showing(t)).toHaveLength(3);    // every turn, including the ones that wrap
      tops.push(t.wood[t.woodIndex - 1].v);
    }
    expect([...tops].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // The turn that takes the pile over shows the last card and the two that
    // followed it, which is the whole point of the change.
    expect(tops.slice(0, 4)).toEqual([3, 6, 9, 2]);
  });
  it('turns the pile over after full traversal and starts again', () => {
    const t = woodTab(cards(7), 7);
    expect(flipWood(t).woodIndex).toBe(3);
  });
  it('handles piles smaller than 3 and empty piles', () => {
    // A pile shorter than a turn cannot deal three: both cards go face up and
    // there is nothing underneath to finish with, so it settles there. Degenerate
    // and deliberate - `sinkWoodTop` is the way out of a pile this small.
    expect(flipWood(woodTab(cards(2))).woodIndex).toBe(2);
    expect(flipWood(woodTab(cards(2), 2)).woodIndex).toBe(2);
    expect(flipWood(woodTab(cards(1))).woodIndex).toBe(1);
    expect(flipWood(woodTab([]))).toEqual(woodTab([]));
  });
  it('never mutates card order', () => {
    const t = woodTab(cards(7));
    expect(flipWood(t).wood).toEqual(t.wood);
  });
});

describe('rotateWood', () => {
  it('moves the first card to the bottom and resets the flip cycle', () => {
    const t = woodTab([c(1, 'red'), c(2, 'blue'), c(3, 'green')], 3);
    const out = rotateWood(t);
    expect(out.wood).toEqual([c(2, 'blue'), c(3, 'green'), c(1, 'red')]);
    expect(out.woodIndex).toBe(0);
  });
  it('is a no-op for 0 or 1 cards', () => {
    const t = woodTab([c(1, 'red')], 1);
    expect(rotateWood(t)).toEqual(t);
    expect(rotateWood(woodTab([]))).toEqual(woodTab([]));
  });
});

describe('woodCycleTops', () => {
  it('reaches only every third card at three a turn - which is the whole problem', () => {
    // Nine cards, turned three at a time: 3, 6, 9, then back to 3. Six of the
    // nine are never the top card at any point in the cycle, however long a
    // player keeps turning, and that is what "no moves" used to be blind to.
    const t = woodTab(cards(9));
    const tops = woodCycleTops(t).map(x => x.v);
    expect(tops).toEqual([3, 6, 9]);
  });

  it('reaches every card at one a turn, which is what the rescue buys', () => {
    const t = woodTab(cards(9));
    expect(woodCycleTops(t, 1).map(x => x.v)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('starts from where the pile actually stands, not from the top', () => {
    // Mid-cycle the reachable set is the same three, just found in another order.
    expect(woodCycleTops(woodTab(cards(9), 6)).map(x => x.v)).toEqual([6, 9, 3]);
  });

  it('reaches every card when the pile length shares no factor with three', () => {
    // Seven cards, three a turn: the phase moves on every lap, so the cycle runs
    // seven turns and every card takes a turn on top. This is the case the old
    // capped flip could not produce - it reached 3, 6, 7 and stopped there.
    expect(woodCycleTops(woodTab(cards(7))).map(x => x.v)).toEqual([3, 6, 2, 5, 1, 4, 7]);
  });

  it('terminates on an empty or single-card pile', () => {
    expect(woodCycleTops(woodTab([]))).toEqual([]);
    expect(woodCycleTops(woodTab(cards(1))).map(x => x.v)).toEqual([1]);
  });
});

describe('sinkWoodTop', () => {
  it('moves the face-up top card to the very bottom and steps the index back', () => {
    const t = woodTab(cards(6), 3);            // 1,2,3 turned over; 3 on top
    const n = sinkWoodTop(t);
    expect(n.wood.map(x => x.v)).toEqual([1, 2, 4, 5, 6, 3]);
    expect(n.woodIndex).toBe(2);               // 2 is the top now
  });

  it('changes which cards the cycle can ever reach - the whole point of it', () => {
    // Nine cards at three a turn reach 3, 6, 9 and nothing else. Sink one and the
    // reachable set moves, which is what un-sticks a hand that had no move in it.
    const t = woodTab(cards(9));
    expect(woodCycleTops(t).map(x => x.v)).toEqual([3, 6, 9]);
    const after = sinkWoodTop(flipWood(t));    // turn over 1,2,3 then sink the 3
    // A different three, not the same three. Nine divides by three, so no amount
    // of turning moves the phase: the cycle closes after one lap wherever it
    // starts. Sinking a card is the only thing that moves which lap it is on, and
    // that is the whole of what the rescue buys on a pile this shape. At the 27 a
    // round deals it moves nine cards rather than one.
    expect(woodCycleTops(after).map(x => x.v)).toEqual([2, 6, 9]);
  });

  it('does nothing with nothing turned over, or a pile of one', () => {
    expect(sinkWoodTop(woodTab(cards(6), 0))).toEqual(woodTab(cards(6), 0));
    expect(sinkWoodTop(woodTab(cards(1), 1))).toEqual(woodTab(cards(1), 1));
  });
});
