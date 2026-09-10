import { describe, it, expect } from 'vitest';
import { dealTimeline, WOOD_TIMING } from './TableauView';

/**
 * The clock of a wood turn.
 *
 * Written as RELATIONSHIPS off WOOD_TIMING wherever it can be, with the numbers
 * themselves pinned in exactly one test below. The table has retuned these three
 * values twice in a day, and a suite that has to be re-pinned on every tune is one
 * somebody will eventually retune without running.
 */
const { flip, step, collect } = WOOD_TIMING;

describe('dealTimeline', () => {
  it('is tuned to the numbers the table last asked for', () => {
    // The one place the values are written out. 200/200/180 to begin with, then
    // 400/400/180 ("twice as long"), then 300/250/250 with the cards overlapping,
    // now 300/200/250 with 50ms more off the step.
    expect(WOOD_TIMING).toEqual({ flip: 300, step: 200, collect: 250 });
  });

  it('overlaps the cards, which is what a shorter step than flip means', () => {
    // Asked for directly: a card takes 300ms and the next starts at 200ms, so the
    // second is already turning while the first has 100ms left to run.
    expect(step).toBeLessThan(flip);
    const { delays } = dealTimeline(3, 3);
    expect(delays[1]).toBeLessThan(delays[0] + flip);
    expect(delays[2]).toBeLessThan(delays[1] + flip);
  });

  it('deals an ordinary turn at a steady step', () => {
    const { delays } = dealTimeline(3, 3);
    expect(delays).toEqual([0, step, 2 * step]);
  });

  it('deals the cards the pile has left, THEN gathers, then deals the rest', () => {
    const two = dealTimeline(3, 2);
    expect(two.delays.slice(0, 2)).toEqual([0, step]);       // both come off at once
    expect(two.collectAt).toBe(step + flip);                 // once the second LANDS
    expect(two.delays[2]).toBe(two.collectAt + collect);     // the third waits it out
  });

  it('does the same with one card left and two dealt after the gather', () => {
    const one = dealTimeline(3, 1);
    expect(one.delays[0]).toBe(0);
    expect(one.collectAt).toBe(flip);
    expect(one.delays[1]).toBe(flip + collect);
    expect(one.delays[2]).toBe(flip + collect + step);
  });

  it('waits for the card ahead of the gather to LAND, not merely to start', () => {
    // The join that a shorter step broke. An earlier cut had collectAt as
    // `before * step`, which is the landing time only while step and flip are
    // equal - it would now start the gather 50ms before the card came down.
    for (const before of [1, 2]) {
      const { delays, collectAt } = dealTimeline(3, before);
      expect(collectAt).toBe(delays[before - 1] + flip);
      expect(collectAt).toBeGreaterThan(before * step);
    }
  });

  it('lets cards overlap each other but never the gather', () => {
    for (const before of [0, 1, 2]) {
      const { delays, collectAt } = dealTimeline(3, before);
      const ends = collectAt + collect;
      // nothing ahead of the gather is still turning when it starts
      expect(delays.slice(0, before).every(d => d + flip <= collectAt)).toBe(true);
      // and nothing behind it starts before it has finished
      expect(delays.slice(before).every(d => d >= ends)).toBe(true);
    }
  });

  it('collapses to gather-then-deal when there was nothing left to deal', () => {
    // A recycle of a pile already all face up, and every turn-over under the
    // host's single-card rescue, which can only happen at exactly zero face down.
    const none = dealTimeline(3, 0);
    expect(none.collectAt).toBe(0);
    expect(none.delays).toEqual([collect, collect + step, collect + 2 * step]);
  });

  it('has no gather to wait for when the pile had a full turn in it', () => {
    // `before >= count` is an ordinary turn, and nothing reads collectAt then -
    // the outline is not rendered at all. The cards must not be held back by a
    // gather that is not happening.
    const plain = dealTimeline(3, 3);
    expect(plain.delays).toEqual([0, step, 2 * step]);
    expect(plain.total).toBe(2 * step + flip);
    expect(dealTimeline(3, 9).delays).toEqual(plain.delays);
  });

  it('runs long enough to cover the whole move, gather included', () => {
    // The class carrying these delays used to come off after the gather alone,
    // which re-timed the cards still waiting behind it and pulled them forward by
    // its length: the deal never really waited except for its first card.
    for (const before of [0, 1, 2]) {
      const { delays, collectAt, total } = dealTimeline(3, before);
      expect(total).toBeGreaterThanOrEqual(Math.max(...delays) + flip);
      expect(total).toBeGreaterThanOrEqual(collectAt + collect);
    }
  });

  it('never runs a card or the gather before the move starts', () => {
    for (const count of [1, 2, 3]) {
      for (const before of [-1, 0, 1, 2, 3, 9]) {
        const { delays, collectAt, total } = dealTimeline(count, before);
        expect(delays).toHaveLength(count);
        expect(delays.every(d => d >= 0)).toBe(true);
        expect(collectAt).toBeGreaterThanOrEqual(0);
        expect(total).toBeGreaterThan(0);
        // and the deal never goes backwards, whatever it was handed
        expect([...delays].sort((a, b) => a - b)).toEqual(delays);
      }
    }
  });

  it('handles a short turn, which is what a pile smaller than a turn deals', () => {
    expect(dealTimeline(1, 1).delays).toEqual([0]);
    expect(dealTimeline(2, 1).delays).toEqual([0, flip + collect]);
    expect(dealTimeline(0, 0).total).toBeGreaterThan(0);
  });
});
