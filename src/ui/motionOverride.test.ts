/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';

/**
 * Reduced motion is honoured on a phone and overridden on a desktop, and the only
 * way to check that is to ask a browser what it actually computed.
 *
 * The switch is the absence of `data-platform` on `<html>`: platform.ts stamps
 * `ios` or `android` and leaves a desktop with nothing, so `[data-platform]`
 * inside the reduced-motion blocks means "a phone said reduce, and meant it".
 * Windows says the same thing through a general polish-and-performance toggle,
 * and it took the wood flip and the falling emojis off a desktop mid-game.
 *
 * Gated on LAYOUT=1 with the rest of the browser-measured suite.
 */
const CSS = readFileSync('src/ui/ui.css', 'utf8') + readFileSync('src/ui/game.css', 'utf8');

/** Every animation the reduced-motion blocks switch off, and what runs normally. */
const ANIMATED = [
  ['.wood-deal > *', 'wood-flip'],
  ['.faller', 'fall-down'],
  ['.spark', 'spark-out'],
  // The fireworks: the ignition bloom and a spark. A spark runs two animations,
  // and the computed name lists both.
  ['.shell b', 'shell-flash'],
  ['.shell i', 'firework, twinkle'],
] as const;

const PAGE = `<!doctype html><html><head><style>${CSS}</style></head><body>
  <div class="wood-deal"><div class="card">7</div></div>
  <div class="faller">X</div>
  <div class="spark"></div>
  <div class="fireworks"><span class="shell"><b></b><i></i></span></div>
</body></html>`;

describe.runIf(process.env.LAYOUT === '1')('the reduced-motion override', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch(); });
  afterAll(async () => { await browser?.close(); });

  /** What each animation resolves to, on one device, under one preference. */
  const names = async (reducedMotion: 'reduce' | 'no-preference', platform?: string) => {
    const p = await browser.newPage({ reducedMotion });
    await p.setContent(PAGE);
    if (platform) await p.evaluate(v => document.documentElement.setAttribute('data-platform', v), platform);
    const out = await p.evaluate((sels) => Object.fromEntries(sels.map(s =>
      [s, getComputedStyle(document.querySelector(s)!).animationName])),
      ANIMATED.map(([sel]) => sel) as string[]);
    await p.close();
    return out;
  };

  it('runs every animation on a desktop even when the OS asks for less motion', async () => {
    // No data-platform is what a desktop gets: platform.ts writes nothing for it.
    const got = await names('reduce');
    for (const [sel, keyframes] of ANIMATED) expect({ sel, name: got[sel] }).toEqual({ sel, name: keyframes });
  });

  for (const phone of ['ios', 'android'] as const) {
    it(`still stops them on ${phone}, where the preference means what it says`, async () => {
      const got = await names('reduce', phone);
      for (const [sel] of ANIMATED) expect({ sel, name: got[sel] }).toEqual({ sel, name: 'none' });
    });

    it(`leaves ${phone} animating when the OS has not asked for less`, async () => {
      const got = await names('no-preference', phone);
      for (const [sel, keyframes] of ANIMATED) expect({ sel, name: got[sel] }).toEqual({ sel, name: keyframes });
    });
  }

  it('has no reduced-motion rule that forgot the phone guard', () => {
    // A block added later without `[data-platform]` would switch its animation off
    // on a desktop too, and nothing above would notice: the list at the top of this
    // file is hand-written. So the stylesheets are read instead.
    const blocks = [...CSS.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{/g)];
    expect(blocks.length).toBeGreaterThan(0);
    for (const m of blocks) {
      // Take the block by counting braces from the opening one.
      let i = m.index! + m[0].length, depth = 1;
      while (depth > 0 && i < CSS.length) {
        if (CSS[i] === '{') depth++;
        if (CSS[i] === '}') depth--;
        i++;
      }
      const body = CSS.slice(m.index! + m[0].length, i - 1)
        // A @keyframes nested in here is a definition, not a rule, and its steps
        // ("0%, 70% {") look exactly like selectors. Take the whole thing out.
        .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
      // Every selector left - the lines that open a rule - must be scoped.
      for (const rule of body.matchAll(/(^|\n)\s*([^{@\n][^{]*)\{/g)) {
        const selector = rule[2].trim();
        expect({ selector, scoped: selector.includes('[data-platform]') })
          .toEqual({ selector, scoped: true });
      }
    }
  });
});
