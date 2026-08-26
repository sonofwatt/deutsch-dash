/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guards the one coverage gap this suite cannot see in itself.
 *
 * rooms.emu.test.ts and plays.emu.test.ts gate every describe on
 * `describe.runIf(process.env.EMULATOR === '1')`. Without that variable their
 * tests SKIP - and a skipped test reports green. That is the right trade for the
 * fast local loop (`npm test` needs no Java, no emulator, ~3s), but it means the
 * only tests that exercise database.rules.json are invisible unless something
 * deliberately turns them on. Those tests include the CANARY that proves the
 * rules are loaded into the emulator namespace at all, which is there because
 * they once silently were not.
 *
 * So CI runs `npm run test:emu` rather than `npm test`, and this asserts that it
 * still does. It reads the workflow rather than checking env vars so it fails in
 * ANY run - local, CI, or a contributor's machine - the moment the two drift
 * apart, instead of only failing in the environment that already broke.
 */
const WORKFLOW = '.github/workflows/deploy.yml';

describe('emulator coverage', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');

  it('CI runs the emulator suite, so the rules tests cannot skip silently', () => {
    expect(workflow).toMatch(/^\s*-\s*run:\s*npm run test:emu\s*$/m);
  });

  it('CI installs a JVM, without which the database emulator cannot start', () => {
    expect(workflow).toContain('actions/setup-java');
  });

  it('the emulator suites still gate on EMULATOR, which is what makes this guard necessary', () => {
    // If this ever stops being true the gating changed, and the reasoning above -
    // and the CI step it justifies - needs revisiting rather than silently rotting.
    for (const f of ['src/net/rooms.emu.test.ts', 'src/net/plays.emu.test.ts']) {
      expect(readFileSync(f, 'utf8')).toContain("describe.runIf(process.env.EMULATOR === '1')");
    }
  });
});
