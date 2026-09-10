import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { playSoundbite, setSoundEnabled, resetSoundForTests } from './engine';

/**
 * The engine, against a fake `AudioContext`.
 *
 * There is no audio device in node - `vite.config.ts` sets `environment: 'node'`
 * - which is why this half of the soundbites had no test at all and why the two
 * bugs below reached a table. The fake is small on purpose: it counts what was
 * STARTED and when, which is the whole of what the engine decides.
 */

interface Started { at: number }
class FakeContext {
  state: 'suspended' | 'running' = 'suspended';
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  started: Started[] = [];
  resumeCalls = 0;
  /** Resolves on the microtask queue, like the real one. */
  async resume() { this.resumeCalls++; this.state = 'running'; }
  createGain() {
    return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
             connect: (n: unknown) => n };
  }
  createDynamicsCompressor() {
    const p = () => ({ value: 0 });
    return { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(),
             connect: (n: unknown) => n };
  }
  createBuffer(_ch: number, frames: number) {
    return { getChannelData: () => new Float32Array(frames) };
  }
  createBufferSource() {
    const self = this;
    return { buffer: null, connect: (n: unknown) => n,
             start(at: number) { self.started.push({ at }); }, stop() {} };
  }
  createBiquadFilter() {
    return { type: '', frequency: { value: 0 }, connect: (n: unknown) => n };
  }
  createOscillator() {
    const self = this;
    return {
      type: '',
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: (n: unknown) => n,
      start(at: number) { self.started.push({ at }); },
      stop() {},
    };
  }
}

let fake: FakeContext;
beforeEach(() => {
  resetSoundForTests();
  fake = new FakeContext();
  vi.stubGlobal('window', { AudioContext: function () { return fake; } });
});
afterEach(() => { vi.unstubAllGlobals(); resetSoundForTests(); });

describe('the first press', () => {
  it('makes a noise, rather than only waking the device up', async () => {
    // The reported bug, exactly: "when a player first presses a sound button the
    // sound doesn't play locally. If they press again, it works." Every context
    // starts suspended and may only resume inside a real gesture, and the engine
    // used to return at that point - so the first press resumed and went silent.
    setSoundEnabled(true);
    fake.state = 'suspended';
    fake.started = [];
    expect(playSoundbite('wow')).toBe(true);
    expect(fake.started).toHaveLength(0);   // cannot schedule against a stopped clock
    await Promise.resolve(); await Promise.resolve();
    expect(fake.resumeCalls).toBeGreaterThan(0);
    expect(fake.started.length).toBeGreaterThan(0); // and then it plays
  });

  it('does not play once the resume has been overtaken by sound going off', async () => {
    setSoundEnabled(true);
    fake.state = 'suspended';
    fake.started = [];
    playSoundbite('wow');
    setSoundEnabled(false);
    await Promise.resolve(); await Promise.resolve();
    expect(fake.started).toHaveLength(0);
  });
});

describe('pressing repeatedly', () => {
  it('plays every press, and plays them all AT ONCE rather than in a queue', async () => {
    // The other half of the report: "there is a delay when pressing the sound
    // effect button - allow players to press the button repeatedly causing the
    // sound to play multiple times". Clips used to be scheduled after the last
    // one finished, so the second press was heard a clip and a half later.
    setSoundEnabled(true);
    await Promise.resolve();
    fake.state = 'running';
    fake.started = [];
    expect(playSoundbite('wow')).toBe(true);
    expect(playSoundbite('wow')).toBe(true);
    expect(playSoundbite('wow')).toBe(true);
    // Three clips' worth of voices, every one of them scheduled at the current
    // time. Nothing is waiting for anything.
    expect(fake.started.length).toBeGreaterThanOrEqual(3);
    expect(fake.started.every(v => v.at === fake.currentTime)).toBe(true);
  });

  it('never refuses a press for backing up, however many arrive', async () => {
    setSoundEnabled(true);
    await Promise.resolve();
    fake.state = 'running';
    const results = Array.from({ length: 30 }, () => playSoundbite('cheer'));
    expect(results.every(Boolean)).toBe(true);
  });
});

describe('the sound switch is the one gate', () => {
  it('makes no noise and reports nothing reached the device when off', () => {
    setSoundEnabled(false);
    fake.started = [];
    expect(playSoundbite('cheer')).toBe(false);
    expect(fake.started).toHaveLength(0);
  });

  it('refuses an id that is not in the catalogue', async () => {
    setSoundEnabled(true);
    await Promise.resolve();
    fake.state = 'running';
    expect(playSoundbite('nope' as never)).toBe(false);
  });
});
