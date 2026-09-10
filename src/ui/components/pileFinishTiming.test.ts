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
      <div class="pile-finish"><div class="pile-finish-turn">
        <div class="pile-finish-face"><div class="card md">10</div></div>
        <div class="pile-finish-back"><div class="card card-back md">
          <span class="card-badge-big">*</span></div></div>
      </div></div>
    </div>
    <div class="wood-back" style="--card-w:60px">
      <div class="card card-back md"><span class="card-badge-big">*</span></div>
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
      const turn = document.querySelector('.pile-finish-turn') as HTMLElement;
      const back = document.querySelector('.pile-finish-back') as HTMLElement;
      const cs = getComputedStyle(el), ts = getComputedStyle(turn);
      const ms = (v: string) => v.split(',').map(x => Math.round(parseFloat(x) * 1000));
      const slot = (document.querySelector('.pile-space') as HTMLElement).getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        names: [cs.animationName, ts.animationName],
        durations: [...ms(cs.animationDuration), ...ms(ts.animationDuration)],
        delays: [...ms(ts.animationDelay), ...ms(cs.animationDelay)],
        outerStyle: cs.transformStyle,
        turnStyle: ts.transformStyle,
        backHidden: getComputedStyle(back).backfaceVisibility,
        cardHidden: getComputedStyle(
          document.querySelector('.pile-finish-back .card') as HTMLElement).backfaceVisibility,
        zIndex: cs.zIndex,
        pointer: cs.pointerEvents,
        coversSlot: Math.abs(box.width - slot.width) < 5 && Math.abs(box.height - slot.height) < 5,
      };
    });
  };

  it('turns over, then holds the badge for exactly the hold', async () => {
    const m = await measure();
    expect(m.names).toEqual(['pile-finish-go', 'pile-finish-turn']);
    expect(m.delays[0]).toBe(0);                                  // the turn starts at once
    expect(m.durations[1]).toBe(PILE_FLIP_MS);
    // The clearing away starts once the turn has finished AND the hold has run.
    expect(m.delays[1]).toBe(PILE_FLIP_MS + PILE_HOLD_MS);
    expect(m.durations[0]).toBe(PILE_GO_MS);
  });

  it('keeps the fade off the element that turns, or there is no turn at all', async () => {
    /**
     * The bug this exists for, which shipped and which every property-reading
     * test passed straight through.
     *
     * `transform-style: preserve-3d` is flattened by a grouping property on the
     * same element, and an animated `opacity` is one. With the fade and the turn
     * together, the browser silently drops to 2D: `backface-visibility` stops
     * meaning anything, the front is painted the whole way round, and the pile
     * spins to show its own face MIRRORED while the badge never appears. Every
     * computed style still reads correctly while it does it.
     *
     * So the invariant is structural: whatever fades must not be what turns.
     */
    const m = await measure();
    expect(m.names[0]).toBe('pile-finish-go');       // the outer one fades
    expect(m.outerStyle).not.toBe('preserve-3d');    // and must not claim 3D
    expect(m.names[1]).toBe('pile-finish-turn');     // the inner one turns
    expect(m.turnStyle).toBe('preserve-3d');
    expect(m.names[1]).not.toContain('go');          // and nothing else
  });

  it('hides the back of every face, the cards inside them included', async () => {
    // The other half of the same bug: a `.card` descendant carries its own
    // `visible`, so hiding only the face leaves the card painted after 90 degrees.
    const m = await measure();
    expect(m.backHidden).toBe('hidden');
    expect(m.cardHidden).toBe('hidden');
  });

  it('wears the same back as the wood pile, centred, at the same size', async () => {
    // Asked for on 2026-09-10, after a look at it enlarged: the two should match.
    // The emblem on a card back means one thing on this board and should not mean
    // it at two different sizes.
    const p = await browser.newPage({ viewport: { width: 400, height: 700 } });
    await p.setContent(page, { waitUntil: 'load' });
    const m = await p.evaluate(() => {
      const slot = document.querySelector('.pile-space') as HTMLElement;
      const glyph = document.querySelector('.pile-finish-back .card-badge-big') as HTMLElement;
      const wood = document.querySelector('.wood-back .card-badge-big') as HTMLElement;
      const cs = getComputedStyle(glyph), ws = getComputedStyle(wood);
      const g = glyph.getBoundingClientRect(), s2 = slot.getBoundingClientRect();
      return {
        size: parseFloat(cs.fontSize), woodSize: parseFloat(ws.fontSize),
        opacity: cs.opacity, woodOpacity: ws.opacity,
        bg: getComputedStyle(
          document.querySelector('.pile-finish-back .card') as HTMLElement).backgroundColor,
        woodBg: getComputedStyle(
          document.querySelector('.wood-back .card') as HTMLElement).backgroundColor,
        // centred in the slot, to within a pixel on each axis
        offX: Math.abs((g.left + g.right) / 2 - (s2.left + s2.right) / 2),
        offY: Math.abs((g.top + g.bottom) / 2 - (s2.top + s2.bottom) / 2),
        insideShortAxis: g.width < s2.width && g.height < s2.height,
      };
    });
    expect(m.size).toBe(m.woodSize);
    expect(m.opacity).toBe(m.woodOpacity);
    expect(m.bg).toBe(m.woodBg);
    expect(m.offX).toBeLessThan(1.5);
    expect(m.offY).toBeLessThan(1.5);
    expect(m.insideShortAxis).toBe(true);
  });

  it('gives every card a thin white edge that stays a hairline when crowded', async () => {
    // The margin a real card has around its print. An inset shadow rather than a
    // border, because every pile positions against the card's exact size.
    const p = await browser.newPage({ viewport: { width: 400, height: 700 } });
    await p.setContent(page, { waitUntil: 'load' });
    const m = await p.evaluate(() => {
      const read = (w: number) => {
        const el = document.querySelector('.pile-finish-back .card') as HTMLElement;
        (el.closest('.pile-space') as HTMLElement).style.setProperty('--card-w', `${w}px`);
        const sh = getComputedStyle(el).boxShadow;
        // Chrome writes each shadow as "<colour> <x> <y> <blur> <spread> inset",
        // so the ring's thickness is the SPREAD of the inset one - the fourth
        // length in the segment that carries the keyword.
        const seg = sh.split(/,(?![^(]*\))/).find(x => x.includes('inset')) ?? '';
        const lengths = [...seg.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map(m2 => parseFloat(m2[1]));
        return { sh, seg, inset: seg !== '', px: lengths[3] ?? NaN };
      };
      return { big: read(96), small: read(40) };
    });
    expect(m.big.inset).toBe(true);
    expect(m.big.sh).toMatch(/rgb\(255,\s*255,\s*255\)/);   // white, not the theme ink
    // Scales with the card, and never vanishes on a crowded board.
    expect(m.small.px).toBeGreaterThanOrEqual(1);
    expect(m.small.px).toBeLessThan(m.big.px);
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
