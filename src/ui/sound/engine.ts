/**
 * The browser half of the soundbites: an `AudioContext`, a one-at-a-time queue
 * and a limiter on the way out.
 *
 * Everything here is lazy and nothing runs at module scope. That is not tidiness:
 * `vite.config.ts` sets `environment: 'node'`, so there is no `AudioContext` in
 * any test, and a construction at import time would take out every file that
 * transitively imports this one. The same rule that keeps `localStorage` out of
 * module scope in `store.ts`.
 *
 * The context is not built until sound is actually switched on, so a player who
 * leaves it off - which is everybody by default, see `prefs.ts` - never allocates
 * an audio device at all.
 */

import { SOUNDBITES, type SoundbiteId, type Voice } from '../../game/soundbites';

/** Trim under every clip, so the recipes can be written at comfortable peaks. */
const MASTER = 0.5;

/**
 * **Clips overlap. There is no queue.**
 *
 * There was one: each clip was scheduled after the last had finished, with a beat
 * between them, on the reasoning that two clips on top of each other is a noise
 * rather than two messages. Playing the table found the cost of that, and it was
 * bigger than the benefit: a player pressing a button twice heard the second
 * press a clip and a half later, which does not read as a second press at all. It
 * reads as lag. Reported as "there is a delay when pressing the sound effect
 * button", along with the ask that pressing repeatedly should simply play
 * repeatedly.
 *
 * So every clip now starts at `currentTime` and they pile up. The limiter in
 * `audio()` is what makes that safe, and it was always there for exactly this -
 * it is why the recipes can be careless about stacking.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = false;

/**
 * Whether this phone makes any noise at all. Default off, and the ONE gate: the
 * store fires soundbites at this module without knowing the preference, so a
 * check that is missing here is a check that is missing everywhere.
 *
 * Switching off does not tear the context down. A player toggling it while
 * deciding is not a reason to rebuild an audio device, and an interrupted
 * context on iOS is more trouble than an idle one.
 */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (on) void unlockAudio();
}

export function soundEnabled(): boolean {
  return enabled;
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  // The last line of defence, and the reason the recipes can be careless about
  // stacking: several voices at once, or a clip arriving over the tail of the
  // one before, cannot add up past this. Same shape as the limiter the research
  // note put on the receiving end of a voice clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(limiter).connect(ctx.destination);
  return ctx;
}

/**
 * Resume the context, which iOS will only do from inside a real gesture.
 *
 * Safari starts every context suspended and refuses to resume one outside a user
 * gesture, so the first tap has to be a tap the player made - which is why the
 * sound switch itself calls this, and why the switch lives in the LOBBY as well
 * as on the board. Turning it on IS the gesture, in the calm place, before the
 * cards land. Safe to call as often as you like.
 */
export async function unlockAudio(): Promise<void> {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') {
    try { await c.resume(); } catch { /* A refused resume leaves it silent, not broken. */ }
  }
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  const frames = Math.floor(c.sampleRate);
  noise = c.createBuffer(1, frames, c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/**
 * One burst, scheduled. The envelope is a short attack and an exponential decay
 * to silence across the whole of `dur`: linear ramps to zero click audibly at
 * these lengths, and `exponentialRampToValueAtTime` cannot reach 0, hence the
 * floor it aims at instead.
 */
function schedule(c: AudioContext, out: GainNode, v: Voice, start: number): void {
  const t = start + v.at;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, v.gain), t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);
  env.connect(out);

  if (v.kind === 'noise') {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    // A lowpass rather than a raw burst: unfiltered white noise is a hiss, and
    // what the fanfare wants is a shimmer sitting over the notes.
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = v.freq;
    src.connect(lp).connect(env);
    src.start(t);
    src.stop(t + v.dur);
    return;
  }

  const osc = c.createOscillator();
  osc.type = v.wave ?? 'sine';
  osc.frequency.setValueAtTime(v.freq, t);
  // Exponential, so a glide sounds like a slide in pitch rather than a slide in
  // Hz. A rise from 300 to 1400 ramped linearly spends most of its time at the
  // top and reads as a chirp.
  if (v.toFreq != null) osc.frequency.exponentialRampToValueAtTime(v.toFreq, t + v.dur);
  osc.connect(env);
  osc.start(t);
  osc.stop(t + v.dur);
}

/** Every voice of one clip, scheduled from now. Overlapping whatever is playing. */
function fire(c: AudioContext, out: GainNode, bite: { voices: Voice[] }): void {
  const start = c.currentTime;
  for (const v of bite.voices) schedule(c, out, v, start);
}

/**
 * Play one soundbite, immediately, on top of anything already sounding.
 *
 * **Returns whether the soundbite REACHED this device**, which is a slightly
 * different question from whether a sound came out, and it is the one the caller
 * needs: the emoji rain is keyed off this. A device that is switched off gets
 * neither. A device whose context is still waking gets the emoji now and the
 * noise a moment later, which is the right way round - the glyph is the half that
 * still works when the audio does not.
 *
 * **A suspended context is resumed and then PLAYED, not skipped.** It used to
 * return here, which was the reported bug: every context starts suspended and is
 * only allowed to resume inside a real gesture, so the very first press of a
 * soundbite resumed the device and made no sound, and the second one worked. The
 * resume is still asynchronous - it has to be - so the clip is fired from its
 * continuation rather than scheduled against a clock that is not yet moving.
 */
export function playSoundbite(id: SoundbiteId): boolean {
  if (!enabled) return false;
  const bite = SOUNDBITES[id];
  if (!bite) return false;
  const c = audio();
  if (!c || !master) return false;
  if (c.state !== 'running') {
    void unlockAudio().then(() => {
      // Re-checked on the way back in: the player may have switched sound off, or
      // the context been torn down and rebuilt, while the resume was in flight.
      if (enabled && ctx === c && master && c.state === 'running') fire(c, master, bite);
    });
    return true;
  }
  fire(c, master, bite);
  return true;
}

/** Tests only: forget the context between cases. */
export function resetSoundForTests(): void {
  ctx = null; master = null; noise = null; enabled = false;
}
