/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * The same guard `emulatorCoverage.test.ts` keeps, for the same reason.
 *
 * `tableauLayout.test.ts` gates on `describe.runIf(process.env.LAYOUT === '1')`,
 * so under a plain `npm test` it SKIPS - and a skipped test reports green. That
 * is the right trade for the fast local loop, which then needs no browser binary
 * and stays under three seconds. It also means the only test in this repo that
 * measures anything is invisible unless something deliberately turns it on.
 *
 * So CI runs `npm run test:layout`, and this asserts that it still does, reading
 * the workflow rather than an env var so it fails in ANY run the moment the two
 * drift apart rather than only in the environment that already broke.
 */
const WORKFLOW = '.github/workflows/deploy.yml';

describe('tableau layout coverage', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');

  it('CI runs the layout suite, so the geometry checks cannot skip silently', () => {
    expect(workflow).toMatch(/^\s*-\s*run:\s*npm run test:layout\s*$/m);
  });

  it('CI installs the browser the layout suite measures in', () => {
    expect(workflow).toContain('playwright install');
  });

  it('every suite that launches a browser gates on LAYOUT', () => {
    // Both halves of the trade. A browser suite that did NOT gate would put a
    // playwright launch inside the fast loop, which is the thing the gate buys;
    // and one that gates is invisible without it, which is what the guard above
    // is for. Found rather than listed, so a second browser suite - there is one
    // now, woodFlipTiming - cannot arrive without being held to the same rule.
    const files = execSync('git ls-files "src/**/*.test.ts"', { encoding: 'utf8' })
      .split('\n').filter(Boolean);
    const browserSuites = files.filter(f => readFileSync(f, 'utf8').includes("from 'playwright'"));
    expect(browserSuites.length).toBeGreaterThan(1);
    for (const f of browserSuites) {
      expect(readFileSync(f, 'utf8'), f).toContain("describe.runIf(process.env.LAYOUT === '1')");
    }
  });
});
