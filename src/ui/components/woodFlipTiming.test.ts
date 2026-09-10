/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, type Browser } from 'playwright';
import { TableauView, dealTimeline } from './TableauView';
import type { Card, Suit, Tableau } from '../../game/types';

/**
 * That the turn a player WATCHES is the one dealTimeline worked out.
 *
 * The unit test beside this one proves the arithmetic. It cannot prove the
 * numbers reach the cards: the delays ride on the pile as `--d0`/`--d1`/`--d2`
 * and the stylesheet hands them to `.wood-deal > *:nth-child(n)`, and a typo in
 * either half leaves every card on the fallback stagger with nothing failing.
 * That plumbing is the thing this loads a browser for.
 *
 * Gated on LAYOUT=1 like the layout suite, for the same reason: `npm test` stays
 * a couple of seconds and needs no browser binary.
 */
const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });
const noop = () => {};

/** A hand mid-turn: three cards face up, which is what a turn deals. */
const TABLEAU: Tableau = {
  dash: [c(9, 'red')],
  post: [[c(8, 'red')], [c(3, 'blue')], []],
  wood: Array.from({ length: 12 }, (_, i) => c((i % 10) + 1, 'blue')),
  woodIndex: 3,
};

const page = (turnover: { at: number; dealtBefore: number } | null) => {
  const markup = renderToStaticMarkup(createElement(TableauView, {
    t: TABLEAU, badgeId: 'tulip' as const, selection: null, postHighlight: [],
    onSelect: noop, onFlip: noop, onTapPost: noop, startDrag: noop, turnover,
  }));
  return `<!doctype html><html><head><style>
    ${readFileSync('src/theme.css', 'utf8')}
    ${readFileSync('src/ui/game.css', 'utf8')}
    html, body { margin: 0; padding: 0; }
  </style></head><body>
    <div class="game" style="--piles:5;--tgap:10px">${markup}</div>
  </body></html>`;
};

describe.runIf(process.env.LAYOUT === '1')('the wood turn a player watches', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch(); });
  afterAll(async () => { await browser?.close(); });

  /**
   * The delays the browser actually computes. A static render has no effects, so
   * the collecting class is applied here the way the effect would - the point is
   * the stylesheet, not the React state machine, which the unit test covers.
   */
  const timings = async (dealtBefore: number | null) => {
    const p = await browser.newPage({ viewport: { width: 420, height: 900 } });
    await p.setContent(page(null), { waitUntil: 'load' });
    // The numbers come from dealTimeline rather than being written out again here,
    // so this test cannot quietly drift from the thing it is checking. What it is
    // proving is the LAST leg: that those numbers, put where TableauView puts
    // them, come back out of the browser as the delay each card actually runs on.
    const plan = dealtBefore === null ? null : dealTimeline(3, dealtBefore);
    return p.evaluate((t) => {
      const pile = document.querySelector('.wood-deal') as HTMLElement;
      const col = pile.closest('.wood-col') as HTMLElement;
      if (t) {
        // what TableauView renders while a turn-over is playing. Effects do not
        // run in a static render, so the class and the outline are applied here;
        // the variables are the component's own arithmetic.
        pile.classList.add('collecting');
        t.delays.forEach((ms, i) => pile.style.setProperty(`--d${i}`, `${ms}ms`));
        col.style.setProperty('--collect-at', `${t.collectAt}ms`);
        const outline = document.createElement('div');
        outline.className = 'wood-collect';
        pile.parentElement!.prepend(outline);
      }
      const ms = (el: Element, prop: string) =>
        parseFloat(getComputedStyle(el).getPropertyValue(prop)) * 1000;
      const cards = [...pile.children].map(el => ({
        delay: ms(el, 'animation-delay'),
        duration: ms(el, 'animation-duration'),
        name: getComputedStyle(el).animationName,
      }));
      const gather = document.querySelector('.wood-collect');
      return {
        cards,
        gather: gather ? { delay: ms(gather, 'animation-delay'),
                           duration: ms(gather, 'animation-duration') } : null,
      };
    }, plan);
  };

  it('turns each card over twice as slowly as it used to', async () => {
    const { cards } = await timings(null);
    expect(cards).toHaveLength(3);
    expect(cards.every(c2 => c2.name === 'wood-flip')).toBe(true);
    expect(cards.map(c2 => c2.duration)).toEqual([400, 400, 400]); // was 200
  });

  it('staggers an ordinary turn by a whole card each time', async () => {
    const { cards } = await timings(null);
    expect(cards.map(c2 => c2.delay)).toEqual([0, 400, 800]);
  });

  it('deals the two the pile had left, then holds the third for the gather', async () => {
    const { cards, gather } = await timings(2);
    expect(cards.map(c2 => c2.delay)).toEqual([0, 400, 980]);
    // the gather runs once those two have landed, and the third card waits it out
    expect(gather!.delay).toBe(800);
    expect(cards[2].delay).toBe(gather!.delay + gather!.duration);
  });

  it('holds two cards back when the pile had only one left', async () => {
    const { cards, gather } = await timings(1);
    expect(cards.map(c2 => c2.delay)).toEqual([0, 580, 980]);
    expect(gather!.delay).toBe(400);
    expect(cards[1].delay).toBe(gather!.delay + gather!.duration);
  });

  it('reads as deal, then gather, then deal - in that order, every time', async () => {
    // The shape of the whole request, in one assertion: nothing after the gather
    // starts before it finishes, and nothing before it waits on it.
    for (const before of [0, 1, 2]) {
      const { cards, gather } = await timings(before);
      const ends = gather!.delay + gather!.duration;
      expect(cards.slice(0, before).every(c2 => c2.delay < gather!.delay)).toBe(true);
      expect(cards.slice(before).every(c2 => c2.delay >= ends)).toBe(true);
    }
  });
});
