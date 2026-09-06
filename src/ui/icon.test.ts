/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * The app icon is two drawings and four PNGs. `public/icon.svg` is the full one,
 * rendered to `icon-512.png` and `icon-180.png`; `public/favicon.svg` is the
 * small cut - one card, one diamond - rendered to `favicon-32.png` and
 * `favicon-16.png`, because the full drawing at a tab's real size is a dark
 * square with an orange speck. `npm run icons` builds all four.
 *
 * Three ways that goes wrong, all pinned here.
 *
 * The PNGs are GENERATED AND COMMITTED, so editing an SVG and pushing puts a new
 * favicon beside old PNGs of it on the same page. The script records what it
 * built from; this fails when an SVG has moved on since, and the fix is to run
 * the script. The script it replaced never had the problem because it never read
 * the SVG at all: it redrew the art by hand in PIL, which is the worse version
 * of the same drift.
 *
 * Both SVGs are FULL BLEED, and going back to an inset tile is the mistake that
 * looks fine everywhere except a phone: iOS composites a transparent touch icon
 * onto black and rounds the corners itself, so a tile with its own margin comes
 * back small, in a black square, rounded twice.
 *
 * And the small drawing has to REACH the tab. A browser picks one icon out of
 * the `rel="icon"` links, so linking the full SVG there is what puts the wrong
 * one in front of everybody.
 */
const SVGS = ['icon.svg', 'favicon.svg'] as const;
const svgs = Object.fromEntries(
  SVGS.map(f => [f, readFileSync(`public/${f}`, 'utf8')]),
) as Record<(typeof SVGS)[number], string>;

/** `<sha>  <name>` per line, the shape `sha256sum` writes. */
const builtFrom = new Map(
  readFileSync('scripts/icon.sha256', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, name] = line.split(/\s+/);
      return [name, hash];
    }),
);

describe('the app icons', () => {
  it.each(SVGS)('has %s rendered into the PNGs that are checked in', file => {
    const now = createHash('sha256').update(readFileSync(`public/${file}`)).digest('hex');
    expect({ file, pngsBuiltFrom: builtFrom.get(file) }).toEqual({ file, pngsBuiltFrom: now });
  });

  it.each(SVGS)('draws %s over its whole canvas, corners left to the phone', file => {
    const svg = svgs[file];
    const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    expect(box).not.toBeNull();
    const [w, h] = [box![1], box![2]];
    // No x or y on the tile is the same as x="0" y="0", and either spelling is
    // fine; an inset one would carry them.
    const tile = new RegExp(`<rect id="tile"(?![^>]*\\s[xy]=)[^>]*width="${w}"[^>]*height="${h}"`);
    expect({ file, fullBleed: tile.test(svg) }).toEqual({ file, fullBleed: true });
  });

  it.each(SVGS)('keeps the id %s renderer takes the background colour from', file => {
    // make-icons.mjs paints the rounded corners back in with this rect's fill so
    // the PNG is an opaque square. It throws rather than guessing if it is gone.
    expect(svgs[file]).toMatch(/<rect id="tile"/);
  });

  it('reaches the home screen through BASE_URL, not off the root', () => {
    // Same failure the manifest test pins, one file over: the app is served from
    // / in dev and /deutsch-dash/ on Pages, so "/icon.svg" would draw in dev and
    // 404 in production. Vite does not rewrite a path built inside a component,
    // which is why this is BASE_URL and not a leading slash.
    const home = readFileSync('src/ui/screens/Home.tsx', 'utf8');
    expect(home).toMatch(/src=\{`\$\{import\.meta\.env\.BASE_URL\}icon\.svg`\}/);
    expect(home).not.toMatch(/src="\/icon\.svg"/);
  });

  it('puts the SMALL drawing in the tab, and the full one only where it is big', () => {
    const html = readFileSync('index.html', 'utf8');
    const icons = [...html.matchAll(/<link rel="icon"[^>]*href="\.\/([\w.-]+)"/g)].map(m => m[1]);
    expect(icons).toContain('favicon.svg');
    // The full SVG alongside it would be a second unsized candidate for the same
    // slot, and the browser is entitled to prefer it.
    expect(icons).not.toContain('icon.svg');
    // The 512 stays: it is the biggest thing on offer, and a browser that wants
    // an icon that large is not putting it in a tab.
    expect(icons).toContain('icon-512.png');
    expect(html).toMatch(/rel="apple-touch-icon"[^>]*href="\.\/icon-180\.png"/);
  });
});
