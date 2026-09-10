/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { PILE_FLIP_MS, PILE_GO_MS, PILE_HOLD_MS } from './CenterGrid';

/**
 * That the finish a player WATCHES is the one CenterGrid asked for.
 *
 * The constants and their arithmetic are checked in `finishedPiles.test.ts`. This
 * is the other leg: they are handed to the stylesheet as `--pile-flip`,
 * `--pile-hold` and `--pile-go`, and the exit's delay is a `calc()` over two of
 * them. A typo in any of that leaves the animation on its fallback with nothing
 * failing - and the failure mode is the pile hanging on the board or vanishing
 * without clearing away, neither of which a markup test can see.
 *
 * Gated on LAYOUT=1 with the rest of the browser-measured suite.
 */
const CSS = readFileSync('src/theme.css', 'utf8') + readFileSync('src/ui/game.css', 'utf8');

const page = `<!doctype html><html><head><style>${CSS}</style></head><body style="margin:0">
  <div class="game" style="--piles:5"><div class="board"
      style="--pile-flip:${PILE_FLIP_MS}ms;--pile-hold:${PILE_HOLD_MS}ms;--pile-go:${PILE_GO_MS}ms">
    <div class="pile-space" style="--card-w:60px">
      <div class="pile-finish">
        <div class="pile-finish-face"><div class="card md">10</div></div>
        <div class="pile-finish-back"><div class="card card-back md"></div></div>
      </div>
    </div>
  </div></div></body></html>`;

describe.runIf(process.env.LAYOUT === '1')('the finished pile a player watches', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch(); });
  afterAll(async () => { await browser?.close(); });

  const measure = async () => {
    const p = await browser.newPage({ viewport: { width: 400, height: 700 } });
    await p.setContent(page, { waitUntil: 'load' });
    return p.evaluate(() => {
      const el = document.querySelector('.pile-finish') as HTMLElement;
      const back = document.querySelector('.pile-finish-back') as HTMLElement;
      const cs = getComputedStyle(el);
      const ms = (v: string) => v.split(',').map(x => Math.round(parseFloat(x) * 1000));
      const slot = (document.querySelector('.pile-space') as HTMLElement).getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        names: cs.animationName,
        durations: ms(cs.animationDuration),
        delays: ms(cs.animationDelay),
        preserve: cs.transformStyle,
        backHidden: getComputedStyle(back).backfaceVisibility,
        zIndex: cs.zIndex,
        pointer: cs.pointerEvents,
        coversSlot: Math.abs(box.width - slot.width) < 5 && Math.abs(box.height - slot.height) < 5,
      };
    });
  };

  it('turns over, then holds the badge for exactly the hold', async () => {
    const m = await measure();
    expect(m.names).toBe('pile-finish-turn, pile-finish-go');
    expect(m.durations[0]).toBe(PILE_FLIP_MS);
    expect(m.delays[0]).toBe(0);
    // The clearing away starts once the turn has finished AND the hold has run.
    expect(m.delays[1]).toBe(PILE_FLIP_MS + PILE_HOLD_MS);
    expect(m.durations[1]).toBe(PILE_GO_MS);
  });

  it('is a real two-sided card, so the badge is on the BACK of it', async () => {
    const m = await measure();
    expect(m.preserve).toBe('preserve-3d');
    expect(m.backHidden).toBe('hidden');
  });

  it('covers the slot without being able to eat a play', async () => {
    // The space is free the instant the pile completes, so somebody may already
    // have played an Ace into it. This has to cover that - and must never take a
    // tap aimed at the board.
    const m = await measure();
    expect(m.coversSlot).toBe(true);
    expect(Number(m.zIndex)).toBeGreaterThan(1); // above .pile-space .card
    expect(m.pointer).toBe('none');
  });
});
