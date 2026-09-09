/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';

/**
 * The fireworks go BEHIND the final score sheet, and "behind" is a question only
 * a layout engine can answer.
 *
 * `render.test.ts` proves the game-over overlay contains both, in that order in
 * the markup. Source order is not paint order: `.fireworks` is positioned with a
 * z-index and `.sheet` was not positioned at all, so the fireworks would have
 * painted straight over the numbers however the JSX was written. That is why the
 * sheet carries `position: relative; z-index: 1`, and why this measures rather
 * than reads.
 *
 * Two failures, and they are different. Painting over the sheet hides the score.
 * Sitting over it in the HIT TEST leaves it visible and makes Rematch dead, which
 * is worse, because nothing on screen says why. So both are checked: the paint
 * order with the layer made hittable on purpose, and the tap with the stylesheet
 * exactly as it ships.
 *
 * Gated on LAYOUT=1 with the rest of the browser-measured suite.
 */
const CSS = readFileSync('src/ui/ui.css', 'utf8');

/** The game-over overlay's shape: the fireworks layer, then the sheet over it. */
const PAGE = `<!doctype html><html><head><style>${CSS}</style></head><body>
  <div class="overlay">
    <div class="fireworks"><span class="shell" style="left:50%;top:50%"><b></b><i></i></span></div>
    <div class="sheet"><h2 id="won">Dave wins!</h2><button id="again">Rematch</button></div>
  </div>
</body></html>`;

describe.runIf(process.env.LAYOUT === '1')('the game-over overlay layers', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch(); });
  afterAll(async () => { await browser?.close(); });

  const onPage = async <T,>(fn: (p: import('playwright').Page) => Promise<T>): Promise<T> => {
    const p = await browser.newPage({ viewport: { width: 393, height: 851 } });
    await p.setContent(PAGE);
    try { return await fn(p); } finally { await p.close(); }
  };

  it('covers the sheet with the fireworks layer, so the rest of this means something', async () => {
    // A layer that did not reach the sheet would pass both checks below without
    // proving anything. Same reasoning as the em-dash sweep asserting its own
    // file list is real before trusting a green result from it.
    const covered = await onPage(p => p.evaluate(() => {
      const fx = document.querySelector('.fireworks')!.getBoundingClientRect();
      const sheet = document.querySelector('.sheet')!.getBoundingClientRect();
      const cx = sheet.left + sheet.width / 2, cy = sheet.top + sheet.height / 2;
      return cx > fx.left && cx < fx.right && cy > fx.top && cy < fx.bottom;
    }));
    expect(covered).toBe(true);
  });

  it('paints the sheet on top of them', async () => {
    // pointer-events is switched ON here, which is the only way the hit-test
    // stack can report a layer the stylesheet deliberately makes untouchable.
    // The stack comes back topmost first, so the sheet has to appear before it.
    const order = await onPage(p => p.evaluate(() => {
      (document.querySelector('.fireworks') as HTMLElement).style.pointerEvents = 'auto';
      const sheet = document.querySelector('.sheet')!.getBoundingClientRect();
      const stack = document.elementsFromPoint(sheet.left + sheet.width / 2,
                                               sheet.top + sheet.height / 2);
      return {
        sheet: stack.findIndex(el => el.classList.contains('sheet')),
        fireworks: stack.findIndex(el => el.classList.contains('fireworks')),
      };
    }));
    expect(order.fireworks).toBeGreaterThan(-1);           // it is in the stack at all
    expect(order.sheet).toBeGreaterThan(-1);
    expect(order.sheet).toBeLessThan(order.fireworks);     // and the sheet is over it
  });

  it('lets a tap through to the button under them', async () => {
    // The stylesheet as it ships. A layer over the whole overlay with the default
    // pointer-events would eat this and leave a finished game with no way out.
    const hit = await onPage(p => p.evaluate(() => {
      const b = document.getElementById('again')!.getBoundingClientRect();
      const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return el?.id ?? el?.className ?? 'nothing';
    }));
    expect(hit).toBe('again');
  });
});
