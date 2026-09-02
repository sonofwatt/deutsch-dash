/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, type Browser } from 'playwright';
import { TableauView } from './TableauView';
import type { Card, Suit, Tableau } from '../../game/types';

/**
 * The one thing this repo cannot check without a layout engine: where the stuck
 * band actually LANDS.
 *
 * `render.test.ts` proves the note is in the markup and in the right order. It
 * cannot prove the note is not sitting on top of the wood pile, because
 * `renderToStaticMarkup` produces a string and a string has no geometry. That gap
 * cost two reports at once - the note visibly colliding with the wood pile, and
 * the same band invisible (it is a drop target with nothing to say) swallowing
 * the click that flips the wood. Both were the note being positioned against
 * `.tableau-zone`, which is as wide as the SCREEN, rather than `.tableau-row`,
 * which is as wide as the PILES. On a phone the two are the same width and
 * everything looked right; on a desktop the band ran 60px over the wood column.
 *
 * So this renders the real component with the real stylesheets into a real
 * browser and measures. The page is deliberately minimal - a `.game` wrapper
 * carrying the two variables Game.tsx sets, and nothing else - because the bug
 * only needs the zone to be wider than the piles, and the widths below are what
 * make that true.
 *
 * Gated on LAYOUT=1 like the emulator suites, for the same reason: `npm test`
 * stays a couple of seconds and needs no browser binary. CI runs
 * `npm run test:layout`, and `tableauLayoutCoverage.test.ts` fails if it ever
 * stops doing so.
 */
const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });
const noop = () => {};
const TABLEAU: Tableau = {
  dash: [c(9, 'red'), c(4, 'blue')],
  post: [[c(8, 'red'), c(7, 'green')], [c(3, 'blue')], []],
  wood: Array.from({ length: 12 }, (_, i) => c((i % 10) + 1, 'blue')),
  woodIndex: 3,
};

/** The longest string the band ever holds, which is the one that has to fit. */
const NOTE = 'No moves left - Send top wood card to bottom';

const page = (woodSide: 'left' | 'right', stuck: boolean) => {
  const markup = renderToStaticMarkup(createElement(TableauView, {
    t: TABLEAU, badgeId: 'tulip' as const, selection: null, postHighlight: [],
    onSelect: noop, onFlip: noop, onTapPost: noop, startDrag: noop, woodSide,
    stuck, onSinkWood: stuck ? noop : undefined,
  }));
  // Three posts means five piles across, which is what Game.tsx would set here.
  return `<!doctype html><html><head><style>
    ${readFileSync('src/theme.css', 'utf8')}
    ${readFileSync('src/ui/game.css', 'utf8')}
    html, body { margin: 0; padding: 0; }
  </style></head><body>
    <div class="game" style="--piles:5;--tgap:10px">${markup}</div>
  </body></html>`;
};

/** Every box the band must not be sitting on: the cards and the empty slots. */
const CARDS = '.tableau-row .card, .tableau-row .pile-space, .tableau-row .pile-layer';

describe.runIf(process.env.LAYOUT === '1')('tableau layout', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch(); });
  afterAll(async () => { await browser?.close(); });

  /** Load one board at one size and report what the band is touching. */
  const measure = async (width: number, height: number,
                         woodSide: 'left' | 'right', stuck: boolean) => {
    const p = await browser.newPage({ viewport: { width, height } });
    await p.setContent(page(woodSide, stuck), { waitUntil: 'load' });
    const out = await p.evaluate((sel) => {
      const band = document.querySelector('.wood-note')!;
      const b = band.getBoundingClientRect();
      const hit = (r: DOMRect) => r.left < b.right - 0.5 && r.right > b.left + 0.5
                               && r.top < b.bottom - 0.5 && r.bottom > b.top + 0.5;
      const overlapped = [...document.querySelectorAll(sel)]
        .filter(el => hit(el.getBoundingClientRect())).length;
      // The face-down wood is the card the click has to reach. Whatever is on top
      // of its centre is what a tap actually gets.
      const back = document.querySelector('.tableau-row .card-back')!.getBoundingClientRect();
      const onTop = document.elementFromPoint(back.left + back.width / 2,
                                              back.top + back.height / 2);
      return {
        overlapped,
        clickReachesWood: !onTop?.closest('.wood-note'),
        width: Math.round(b.width),
        spills: band.scrollWidth > band.clientWidth + 1
             || band.scrollHeight > band.clientHeight + 1,
      };
    }, CARDS);
    await p.close();
    return out;
  };

  // 360 and 393 are phones, where the piles fill the width and the bug hid. 1280
  // and 1600 are the windows it showed up in. Both thumbs, because the band is
  // inset from whichever end the wood is on and only one of those was ever
  // measured by hand.
  const SIZES = [[360, 740], [393, 851], [1280, 800], [1600, 900]] as const;
  const SIDES = ['left', 'right'] as const;

  for (const [w, h] of SIZES) {
    for (const side of SIDES) {
      it(`keeps the note clear of every pile at ${w}px, wood ${side}`, async () => {
        const m = await measure(w, h, side, true);
        expect(m.overlapped).toBe(0);
        expect(m.width).toBeGreaterThan(0);
      });

      it(`leaves the wood pile clickable at ${w}px, wood ${side}`, async () => {
        // The band with nothing to say is invisible and still there, which is the
        // half of this that made a desktop unplayable rather than just untidy.
        const quiet = await measure(w, h, side, false);
        expect(quiet.overlapped).toBe(0);
        expect(quiet.clickReachesWood).toBe(true);
        // ...and it has to hold when the note IS showing, too.
        expect((await measure(w, h, side, true)).clickReachesWood).toBe(true);
      });
    }
  }

  it('fits the longest message it can hold, at every size', async () => {
    for (const [w, h] of SIZES) {
      const m = await measure(w, h, 'right', true);
      expect({ w, spills: m.spills }).toEqual({ w, spills: false });
    }
  });

  it('is the message this is checking the fit of', () => {
    // If the string changes, the fit above is measuring something that is no
    // longer on screen. Read off the component rather than trusted.
    const html = renderToStaticMarkup(createElement(TableauView, {
      t: TABLEAU, badgeId: 'tulip' as const, selection: null, postHighlight: [],
      onSelect: noop, onFlip: noop, onTapPost: noop, startDrag: noop,
      woodSide: 'right' as const, stuck: true, onSinkWood: noop,
    }));
    expect(html).toContain(NOTE);
  });
});
