import { describe, it, expect } from 'vitest';
import { dealTimeline } from './TableauView';

/**
 * The clock of a wood turn. Asked for on 2026-09-10 in two parts: the flipping to
 * take twice as long, and the turn that takes the pile over to deal out the one or
 * two cards the draw pile has LEFT before gathering the rest up, rather than
 * gathering first and then dealing all three.
 *
 * Pinned as relationships rather than as a table of numbers wherever it can be, so
 * the next tuning pass moves the numbers without having to re-pin the shape.
 */
describe('dealTimeline', () => {
  it('deals an ordinary turn straight through, one card after another', () => {
    // `before` at the full count is a turn with no gather in it at all.
    const { delays, total } = dealTimeline(3, 3);
    expect(delays).toEqual([0, 400, 800]);
    expect(total).toBeGreaterThan(delays[2]);
  });

  it('takes twice as long as it used to, at the same shape', () => {
    // It was 200ms a card, 200ms apart. Doubling both keeps every card clear of
    // the next, which is what made the first cut watchable.
    const { delays } = dealTimeline(3, 3);
    const gaps = delays.slice(1).map((d, i) => d - delays[i]);
    expect(gaps).toEqual([400, 400]);
    expect(gaps.every(g => g === 2 * 200)).toBe(true);
  });

  it('deals the cards the pile has left, THEN gathers, then deals the rest', () => {
    // Two left: both come off the pile immediately, the gather runs once they have
    // landed, and the third card waits for it.
    const two = dealTimeline(3, 2);
    expect(two.delays[0]).toBe(0);
    expect(two.delays[1]).toBe(400);
    expect(two.collectAt).toBe(800);          // after the second card lands
    expect(two.delays[2]).toBe(800 + 180);    // the third waits for the gather
    expect(two.delays[2]).toBeGreaterThan(two.collectAt);
  });

  it('does the same with only one card left, and two dealt after the gather', () => {
    const one = dealTimeline(3, 1);
    expect(one.delays[0]).toBe(0);
    expect(one.collectAt).toBe(400);
    expect(one.delays[1]).toBe(400 + 180);
    expect(one.delays[2]).toBe(800 + 180);
    // every card after the gather is behind it, and the one before it is not
    expect(one.delays[0]).toBeLessThan(one.collectAt);
    expect(one.delays.slice(1).every(d => d > one.collectAt)).toBe(true);
  });

  it('collapses to the old gather-then-deal when there was nothing left to deal', () => {
    // A recycle of a pile already all face up, and every turn-over under the
    // host's single-card rescue, which can only happen at exactly zero face down.
    const none = dealTimeline(3, 0);
    expect(none.collectAt).toBe(0);
    expect(none.delays).toEqual([180, 580, 980]);
  });

  it('runs long enough to cover the whole move, gather included', () => {
    // The class carrying these delays used to come off after the gather alone,
    // which re-timed the cards still waiting behind it and pulled them forward by
    // its length: the deal never really waited except for its first card.
    //
    // 0, 1 and 2 are every case a real turn-over can produce: `flipWood` only
    // takes the pile over when fewer cards are face down than a turn deals.
    for (const before of [0, 1, 2]) {
      const { delays, collectAt, total } = dealTimeline(3, before);
      expect(total).toBeGreaterThanOrEqual(Math.max(...delays) + 400); // last card lands
      expect(total).toBeGreaterThan(collectAt + 180);                  // gather finishes
    }
  });

  it('has no gather to wait for when the pile had a full turn in it', () => {
    // `before >= count` is an ordinary turn, and nothing reads collectAt then -
    // the outline is not rendered at all. The cards must not be held back by a
    // gather that is not happening.
    const plain = dealTimeline(3, 3);
    expect(plain.delays).toEqual([0, 400, 800]);
    expect(plain.total).toBe(800 + 400);
    expect(dealTimeline(3, 9).delays).toEqual(plain.delays);
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
    expect(dealTimeline(2, 1).delays).toEqual([0, 580]);
    expect(dealTimeline(0, 0).total).toBeGreaterThan(0);
  });
});
