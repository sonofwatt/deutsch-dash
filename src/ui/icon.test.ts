/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * The app icon is one drawing in three files: `public/icon.svg` is the source,
 * and `icon-512.png` and `icon-180.png` are rendered from it by
 * `npm run icons`. Two ways that used to go wrong, both pinned here.
 *
 * The PNGs are GENERATED AND COMMITTED, so editing the SVG and pushing puts a
 * new favicon beside two old touch icons on the same page. The script records
 * what it built from; this fails when the SVG has moved on since, and the fix is
 * to run the script. The script it replaced never had this problem because it
 * never read the SVG at all: it redrew the same art by hand in PIL, which is the
 * worse version of the same drift.
 *
 * The SVG is FULL BLEED, and going back to an inset tile is the mistake that
 * looks fine everywhere except a phone: iOS composites a transparent touch icon
 * onto black and rounds the corners itself, so a tile with its own margin comes
 * back small, in a black square, rounded twice.
 */
const svg = readFileSync('public/icon.svg', 'utf8');

describe('the app icon', () => {
  it('has the PNGs rendered from the SVG that is checked in', () => {
    const built = readFileSync('scripts/icon.sha256', 'utf8').trim();
    const now = createHash('sha256').update(readFileSync('public/icon.svg')).digest('hex');
    expect({ svg: now, pngsBuiltFrom: built }).toEqual({ svg: now, pngsBuiltFrom: now });
  });

  it('fills its whole canvas, corners left to the phone', () => {
    const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    expect(box).not.toBeNull();
    const [w, h] = [box![1], box![2]];
    // No x or y on the tile is the same as x="0" y="0", and either spelling is
    // fine; an inset one would carry them.
    const tile = new RegExp(`<rect id="tile"(?![^>]*\\s[xy]=)[^>]*width="${w}"[^>]*height="${h}"`);
    expect({ fullBleed: tile.test(svg), viewBox: `${w}x${h}` })
      .toEqual({ fullBleed: true, viewBox: `${w}x${h}` });
  });

  it('keeps the id the renderer takes the background colour from', () => {
    // make-icons.mjs paints the rounded corners back in with this rect's fill so
    // the PNG is an opaque square. It throws rather than guessing if it is gone.
    expect(svg).toMatch(/<rect id="tile"/);
  });
});
