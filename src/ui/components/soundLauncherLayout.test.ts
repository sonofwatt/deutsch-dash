/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';

/**
 * The soundbite launcher sits in the band above the DASH column, and the menu it
 * opens has to be reachable from either thumb. Three things can only be answered
 * by a layout engine, and each of them is a real way this goes wrong:
 *
 * - **The launcher must not cover a card.** It lives inside `.tableau-row`, one
 *   card wide, in the strip the wood column's two-card height leaves empty. A
 *   button overlapping the Dash pile would eat the most-played pile on the board.
 * - **It must not sit on the stuck note.** `.wood-note` spans that same strip, so
 *   `.has-sound` shortens it by a card. Without that they are on top of each
 *   other, and the note is the wider of the two.
 * - **The menu must stay on screen at BOTH wood sides.** It is anchored to the
 *   launcher, which moves end to end with the Dash pile, so a fixed side would
 *   hang half of it off the phone for every left-handed player.
 *
 * Gated on LAYOUT=1 with the rest of the browser-measured suite.
 */
const CSS = readFileSync('src/theme.css', 'utf8')
  + readFileSync('src/ui/ui.css', 'utf8')
  + readFileSync('src/ui/game.css', 'utf8');

/** The hand as TableauView builds it: dash, three posts, wood, at one side. */
const page = (woodSide: 'left' | 'right', opts: { menu?: boolean; stuck?: boolean }) => {
  const dash = `<div class="pile-col" data-col="dash"><div class="card" data-card>10</div></div>`;
  const post = (i: number) => `<div class="pile-col" data-col="post${i}"><div class="card" data-card>${i}</div></div>`;
  const wood = `<div class="pile-col" data-col="wood"><div class="card" data-card>W</div><div class="card" data-card>W</div></div>`;
  const piles = woodSide === 'left'
    ? [wood, post(1), post(2), post(3), dash]
    : [dash, post(1), post(2), post(3), wood];
  const note = opts.stuck
    ? `<button class="wood-note">No moves left - Send top wood card to bottom</button>`
    : `<div class="wood-note drop-band"></div>`;
  const menu = opts.menu ? `<div class="sb-menu"><div class="soundbite-grid">
      ${Array.from({ length: 8 }, (_, i) => `<button class="soundbite" data-sb="s${i}">
        <span class="soundbite-glyph">x</span><span class="soundbite-label">Lab</span></button>`).join('')}
    </div></div>` : '';
  // --hand-card is NOT set here. `.game` derives it from the viewport and the
  // pile count, which is the whole reason the row always fits, and pinning it to
  // a number would test a board this app never draws.
  return `<!doctype html><html><head><style>${CSS}</style></head><body style="margin:0">
    <div class="game" style="--piles:5;--tgap:10px">
      <div class="tableau-zone wood-${woodSide} has-sound" data-hand>
        <div class="tableau-row">
          ${piles.join('')}
          ${note}
          <div class="sb-launch-wrap">
            <button class="sb-launch ${opts.menu ? 'open' : ''}">&#9834;</button>
            ${menu}
          </div>
        </div>
      </div>
    </div></body></html>`;
};

const SIZES = [[360, 740], [393, 851], [1280, 800]] as const;

describe.runIf(process.env.LAYOUT === '1')('the soundbite launcher on the board', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch(); });
  afterAll(async () => { await browser?.close(); });

  const measure = async (w: number, h: number, side: 'left' | 'right',
                         opts: { menu?: boolean; stuck?: boolean }) => {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.setContent(page(side, opts), { waitUntil: 'load' });
    try {
      return await p.evaluate(() => {
        const hit = (a: DOMRect, b: DOMRect) =>
          a.left < b.right - 0.5 && a.right > b.left + 0.5
          && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
        const launch = document.querySelector('.sb-launch')!.getBoundingClientRect();
        const cards = [...document.querySelectorAll('[data-card]')].map(c => c.getBoundingClientRect());
        const note = document.querySelector('.wood-note')!.getBoundingClientRect();
        const menuEl = document.querySelector('.sb-menu');
        const menu = menuEl?.getBoundingClientRect() ?? null;
        return {
          coversACard: cards.some(c => hit(launch, c)),
          onTheNote: hit(launch, note),
          launchW: launch.width,
          launchH: launch.height,
          // Measured off a real card rather than read from --hand-card: an
          // unregistered custom property computes to its unresolved token
          // ("clamp(34px, ...)"), so parsing it gives the floor and not the size.
          card: cards[0].width,
          rowOffRight: Math.round(Math.max(0,
            document.querySelector('.tableau-row')!.getBoundingClientRect().right - window.innerWidth)),
          menuOffLeft: menu ? Math.round(Math.max(0, -menu.left)) : 0,
          menuOffRight: menu ? Math.round(Math.max(0, menu.right - window.innerWidth)) : 0,
          menuAboveLaunch: menu ? menu.bottom <= launch.top + 0.5 : true,
          pageScrolls: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
    } finally { await p.close(); }
  };

  for (const [w, h] of SIZES) {
    for (const side of ['left', 'right'] as const) {
      const at = `${w}x${h}, wood ${side}`;

      it(`keeps the launcher off every card at ${at}`, async () => {
        const m = await measure(w, h, side, {});
        expect({ at, coversACard: m.coversACard }).toEqual({ at, coversACard: false });
      });

      it(`keeps the launcher off the stuck note at ${at}`, async () => {
        // Both live in the same strip. `.has-sound` is what separates them, and
        // the stuck note is the state where they would collide.
        const m = await measure(w, h, side, { stuck: true });
        expect({ at, onTheNote: m.onTheNote }).toEqual({ at, onTheNote: false });
      });

      it(`opens the menu on screen and above the button at ${at}`, async () => {
        // Anchored to the hand at the bottom of the phone, so it has to open
        // upwards; and pinned to the launcher's own end, so it has to stay on
        // screen at both.
        const m = await measure(w, h, side, { menu: true });
        expect({ at, offLeft: m.menuOffLeft, offRight: m.menuOffRight })
          .toEqual({ at, offLeft: 0, offRight: 0 });
        expect({ at, above: m.menuAboveLaunch }).toEqual({ at, above: true });
        expect({ at, pageScrolls: m.pageScrolls }).toEqual({ at, pageScrolls: false });
      });

      it(`sizes the launcher off the card, not off a number, at ${at}`, async () => {
        // One card wide, and the strip it sits in is 1.4 of one tall - the same
        // proportions .wood-note uses. A hard-coded size would hold at 393 and be
        // wrong on every other board.
        const m = await measure(w, h, side, {});
        // A pixel of tolerance, because both sides are sub-pixel layout values
        // and rounding each before comparing them invents a mismatch.
        expect(m.launchW).toBeCloseTo(m.card, 0);
        expect(m.launchH).toBeCloseTo(m.card * 1.4, 0);
      });

      it(`keeps the pile row itself inside the phone at ${at}`, async () => {
        // The menu is anchored to the row's end, so a row wider than the screen
        // would hang the menu off it however the menu is written. This is what
        // makes the check above meaningful rather than lucky.
        const m = await measure(w, h, side, { menu: true });
        expect({ at, rowOffRight: m.rowOffRight }).toEqual({ at, rowOffRight: 0 });
      });
    }
  }
});
