#!/usr/bin/env node
// Renders the icon SVGs to the PNGs the browsers and phones need:
// icon-512.png (the manifest) and icon-180.png (the iOS touch icon) from
// icon.svg, and favicon-32.png and favicon-16.png from favicon.svg.
//
// THERE ARE TWO DRAWINGS ON PURPOSE. The full one loses at a tab's real size:
// three cards, three speed lines and a diamond inside 16 pixels come out as a
// dark square with an orange speck. favicon.svg is the same tile, white and
// orange with one card and one diamond, which survives being that small.
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

/** Each source and the sizes rendered from it. The PNG takes the SVG's name. */
const JOBS = [
  { svg: 'icon.svg', sizes: [180, 512] },
  { svg: 'favicon.svg', sizes: [16, 32] },
];

const browser = await chromium.launch();
const built = [];
try {
  for (const job of JOBS) {
    const svgPath = path.join(repoRoot, 'public', job.svg);
    const svg = readFileSync(svgPath, 'utf8');
    const base = job.svg.replace(/\.svg$/, '');
    for (const px of job.sizes) {
      const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
      await page.setContent(
        `<style>html,body{margin:0}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`,
      );
      const fill = await page.evaluate(() => {
        const tile = document.getElementById('tile');
        if (!tile) return null;
        return getComputedStyle(tile).fill;
      });
      if (!fill) throw new Error(`public/${job.svg} has no #tile rect to take the background colour from`);
      await page.evaluate(c => { document.body.style.background = c; }, fill);
      await page.screenshot({ path: path.join(repoRoot, 'public', `${base}-${px}.png`) });
      await page.close();
      console.log(`wrote public/${base}-${px}.png`);
    }
    built.push(`${createHash('sha256').update(readFileSync(svgPath)).digest('hex')}  ${job.svg}`);
  }
} finally {
  await browser.close();
}

// The PNGs are generated, so nothing stops an edit to an SVG shipping beside the
// old ones. This records what they were built from; `icon.test.ts` fails if
// either SVG has moved on since, which is the reminder to run this script.
writeFileSync(path.join(repoRoot, 'scripts', 'icon.sha256'), `${built.join('\n')}\n`);
console.log('wrote scripts/icon.sha256');
