import { describe, it, expect, afterEach } from 'vitest';
import { readSoundOn } from './prefs';

/**
 * The two sound defaults are a pair, and getting either backwards is the whole
 * feature misbehaving:
 *
 * - the HOST's `meta.soundsOn` defaults OFF, so a table is silent until somebody
 *   decides otherwise (tested against the real rules in `rooms.emu.test.ts`);
 * - this, the PLAYER's own switch, defaults ON, so once the host has said yes
 *   nobody has to go hunting for a control.
 *
 * Which is why this reads "is it off" rather than "is it on": absent has to mean
 * on, and absent is the case for every phone that has never been asked, every
 * private window, and every browser with storage blocked.
 *
 * There is no `localStorage` in this suite - `vite.config.ts` sets
 * `environment: 'node'` - so the stub below is the only way to reach the stored
 * paths at all. It is installed per case and torn down after, because a global
 * left behind would leak into every other file in the run.
 */
type Store = { getItem(k: string): string | null };
const withStorage = (impl: Store | 'throws' | null, fn: () => void) => {
  const g = globalThis as { localStorage?: unknown };
  const had = 'localStorage' in g;
  const prev = g.localStorage;
  if (impl === null) delete g.localStorage;
  else if (impl === 'throws') {
    g.localStorage = { getItem() { throw new DOMException('denied'); } };
  } else g.localStorage = impl;
  try { fn(); } finally {
    if (had) g.localStorage = prev; else delete g.localStorage;
  }
};

const stored = (v: string | null): Store => ({ getItem: () => v });

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('the player\'s own sound switch', () => {
  it('is ON for a phone that has never been asked', () => {
    withStorage(stored(null), () => expect(readSoundOn()).toBe(true));
  });

  it('is ON where there is no storage at all', () => {
    // The node test environment, and a browser that has none.
    withStorage(null, () => expect(readSoundOn()).toBe(true));
  });

  it('is ON when reading storage throws', () => {
    // A private window, or a browser set to block site data. It still works for
    // this game; it just will not remember.
    withStorage('throws', () => expect(readSoundOn()).toBe(true));
  });

  it('stays OFF once a player has turned it off', () => {
    withStorage(stored('off'), () => expect(readSoundOn()).toBe(false));
  });

  it('is ON for the value written when they turn it back on', () => {
    withStorage(stored('on'), () => expect(readSoundOn()).toBe(true));
  });

  it('treats anything it does not recognise as ON', () => {
    // Only the exact string 'off' switches it off. A hand-edited or half-written
    // value must fail towards the default rather than towards silence, because
    // silence is the state a player cannot tell from the feature being broken.
    for (const v of ['', 'OFF', 'false', 'no', '0', 'nonsense']) {
      withStorage(stored(v), () => expect({ v, on: readSoundOn() }).toEqual({ v, on: true }));
    }
  });
});
