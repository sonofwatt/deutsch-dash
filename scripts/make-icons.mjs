#!/usr/bin/env node
// Renders public/icon.svg to the two PNGs the browsers and phones need:
// icon-512.png (the manifest) and icon-180.png (the iOS touch icon).
//
// It RASTERISES THE SVG rather than redrawing the art, which is the whole point
// of replacing the script that was here before: that one rebuilt the same shapes
// by hand in PIL, so the SVG and the PNGs were two drawings of one icon that
// nothing kept in step, and it loaded a font by absolute Windows path so it only
// ran on one machine. Chromium comes from the playwright devDependency the
// layout suite already needs.
//
// Two things about the output, both deliberate:
//
// - It is a FULL BLEED SQUARE. The corners the SVG rounds are painted back in
//   with the tile's own colour, because iOS shows a transparent touch icon
//   composited onto black and masks the corners itself. A rounded PNG gets
//   rounded twice and sits in a black square.
// - The background colour is read off the rendered `#tile` rect rather than
//   written down here, so recolouring the icon is editing the SVG and nothing
//   else. A missing `#tile` is a hard error rather than a guess.
//
// Usage: npm run icons
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svgPath = path.join(repoRoot, 'public', 'icon.svg');
const svg = readFileSync(svgPath, 'utf8');

const browser = await chromium.launch();
try {
  for (const px of [180, 512]) {
    const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`,
    );
    const fill = await page.evaluate(() => {
      const tile = document.getElementById('tile');
      if (!tile) return null;
      return getComputedStyle(tile).fill;
    });
    if (!fill) throw new Error('public/icon.svg has no #tile rect to take the background colour from');
    await page.evaluate(c => { document.body.style.background = c; }, fill);
    const out = path.join(repoRoot, 'public', `icon-${px}.png`);
    await page.screenshot({ path: out });
    await page.close();
    console.log(`wrote public/icon-${px}.png`);
  }
} finally {
  await browser.close();
}

// The PNGs are generated, so nothing stops an edit to the SVG shipping beside
// the old ones. This records what they were built from; `icon.test.ts` fails if
// the SVG has moved on since, which is the reminder to run this script.
const hash = createHash('sha256').update(readFileSync(svgPath)).digest('hex');
writeFileSync(path.join(repoRoot, 'scripts', 'icon.sha256'), `${hash}\n`);
console.log(`wrote scripts/icon.sha256 (${hash.slice(0, 12)})`);
