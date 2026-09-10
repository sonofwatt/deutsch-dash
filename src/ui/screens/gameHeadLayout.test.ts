/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';

/**
 * The head row holds its controls on screen, and "on screen" is a question only
 * a layout engine can answer.
 *
 * The island in the corner grew from three buttons to four when the soundbite
 * note joined the wood swap, the sit-out door and the theme toggle. That is 39px
 * more in a row that also carries the round number, the player's name and score,
 * and - only when the connection has dropped - a "reconnecting" pill. At 393px
 * the four of them together put the island's right-hand edge 12px PAST the edge
 * of the phone, which takes the theme toggle with it.
 *
 * The cause is not the flex row. `.game` is a grid with one implicit `auto`
 * column, and a grid item's automatic minimum size is its MIN-CONTENT width - so
 * a head row that did not fit did not shrink to the phone, it made the column
 * wider than the phone. `min-width: 0` on `.game-head` is what lets it shrink,
 * and `.game-head .muted` is what actually gives, because the name and score are
 * the only thing in the row that is not a control or a fixed fact.
 *
 * Two failures, and they are different. A control off the right-hand edge cannot
 * be tapped at all. A row that wraps instead stays tappable and takes a line off
 * the BOARD, which the sizing rules in handoff.md exist to prevent. So both are
 * checked, at every size the rest of the layout suite covers.
 *
 * Gated on LAYOUT=1 with the rest of the browser-measured suite.
 */
const CSS = readFileSync('src/theme.css', 'utf8')
  + readFileSync('src/ui/ui.css', 'utf8')
  + readFileSync('src/ui/game.css', 'utf8');

/** The head as Game.tsx builds it: four buttons in the island, pill optional. */
const page = (name: string, reconnecting: boolean) => `<!doctype html><html><head>
  <style>${CSS}</style></head><body style="margin:0">
  <div class="game" style="--piles:5">
    <div class="game-head">
      <strong>Round 12</strong>
      <span class="muted">${name} 100 pts to 75</span>
      ${reconnecting ? '<span class="conn-pill">reconnecting…</span>' : ''}
      <span class="head-btns">
        <button class="side-swap">⇄</button>
        <button class="side-swap sound-btn" data-on="yes">♪</button>
        <button class="side-swap"><svg class="door-ajar" viewBox="0 0 24 24">
          <path d="M13.5 3.5H20V20.5H13.5" /></svg></button>
        <button class="side-swap">◐</button>
      </span>
    </div>
  </div></body></html>`;

/** The sizes the tableau suite measures, so the two agree on what a phone is. */
const SIZES = [[360, 740], [393, 851], [1280, 800]] as const;
/** Long enough to blow the row apart, and inside MAX_NAME_LENGTH. */
const NAMES = ['Al', 'Maximilian1234'] as const;

describe.runIf(process.env.LAYOUT === '1')('the game head row', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch(); });
  afterAll(async () => { await browser?.close(); });

  const measure = async (width: number, height: number, name: string, reconnecting: boolean) => {
    const p = await browser.newPage({ viewport: { width, height } });
    await p.setContent(page(name, reconnecting), { waitUntil: 'load' });
    try {
      return await p.evaluate(() => {
        const head = document.querySelector('.game-head')!;
        const island = document.querySelector('.head-btns')!;
        const btns = [...document.querySelectorAll('.head-btns .side-swap')];
        const hb = head.getBoundingClientRect(), ib = island.getBoundingClientRect();
        return {
          islandRight: Math.round(ib.right),
          viewport: window.innerWidth,
          // One line. The head is an `auto` grid track: a second line comes off the board.
          rows: new Set(btns.map(b => Math.round(b.getBoundingClientRect().top))).size,
          headHeight: Math.round(hb.height),
          buttons: btns.map(b => {
            const r = b.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height) };
          }),
          // The whole page, not just this row: a grid column wider than the phone
          // is what the overflow was, and it would drag the board with it.
          pageScrolls: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
    } finally { await p.close(); }
  };

  for (const [w, h] of SIZES) {
    for (const name of NAMES) {
      for (const reconnecting of [false, true]) {
        const what = `${w}x${h}, "${name}"${reconnecting ? ', reconnecting' : ''}`;

        it(`keeps every control on screen at ${what}`, async () => {
          const m = await measure(w, h, name, reconnecting);
          // The right-hand button is the theme toggle. Past the edge it is gone.
          expect({ what, past: Math.max(0, m.islandRight - m.viewport) })
            .toEqual({ what, past: 0 });
          expect({ what, pageScrolls: m.pageScrolls }).toEqual({ what, pageScrolls: false });
        });

        it(`keeps the island on one line at ${what}`, async () => {
          const m = await measure(w, h, name, reconnecting);
          expect({ what, rows: m.rows }).toEqual({ what, rows: 1 });
        });

        it(`keeps all four buttons at full thumb size at ${what}`, async () => {
          // Squeezing the buttons would "fit" and quietly undo the 20% they were
          // deliberately given - see --btn-w in ui.css. Fitting has to come out of
          // the name and score, which is the only thing in the row that can give.
          const m = await measure(w, h, name, reconnecting);
          expect({ what, buttons: m.buttons })
            .toEqual({ what, buttons: Array.from({ length: 4 }, () => ({ w: 37, h: 30 })) });
        });
      }
    }
  }

  it('gives the name and score whatever is left, rather than nothing at all', async () => {
    // The row shrinking to fit is only right if the shrinking stops somewhere
    // useful: a name truncated to zero would pass every check above.
    const m = await browser.newPage({ viewport: { width: 393, height: 851 } });
    await m.setContent(page('Maximilian1234', true), { waitUntil: 'load' });
    const width = await m.evaluate(() =>
      Math.round(document.querySelector('.game-head .muted')!.getBoundingClientRect().width));
    await m.close();
    expect(width).toBeGreaterThan(20);
  });
});
