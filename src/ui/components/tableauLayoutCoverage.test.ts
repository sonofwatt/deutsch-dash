/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

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

  it('the layout suite still gates on LAYOUT, which is what makes this guard necessary', () => {
    expect(readFileSync('src/ui/components/tableauLayout.test.ts', 'utf8'))
      .toContain("describe.runIf(process.env.LAYOUT === '1')");
  });
});
