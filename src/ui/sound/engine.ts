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

import { SOUNDBITES, clipLength, type SoundbiteId, type Voice } from '../../game/soundbites';

/** Trim under every clip, so the recipes can be written at comfortable peaks. */
const MASTER = 0.5;
/** A beat between queued clips, so two in a row are two and not one long one. */
const GAP_S = 0.06;
/**
 * How far ahead the queue will schedule before it starts dropping clips.
 *
 * A table that is enjoying itself can press faster than the clips play, and
 * without this the queue simply grows: the noises arrive later and later until
 * they are commentary on a round that finished. Better to drop them. Two seconds
 * is about four clips deep, which is enough that a genuine flurry all lands.
 */
const MAX_QUEUE_S = 2;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let nextFree = 0;
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
  nextFree = ctx.currentTime;
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

/**
 * Play one soundbite, or queue it behind the one already going.
 *
 * They never overlap, which is the whole reason there is a queue: two players
 * pressing at the same moment is common at a table, and two clips on top of each
 * other is a noise rather than two messages.
 *
 * **Returns whether the soundbite REACHED this device**, which is a slightly
 * different question from whether a sound came out, and it is the one the caller
 * needs: the emoji rain is keyed off this. A device that is switched off gets
 * neither. A device whose context has not been unlocked yet gets the emoji and
 * misses the noise, which is the right way round - the glyph is the half that
 * still works when the audio does not. A clip dropped for backing the queue up
 * gets neither, so a player leaning on the buttons cannot bury the screen in
 * emoji either.
 */
export function playSoundbite(id: SoundbiteId): boolean {
  if (!enabled) return false;
  const bite = SOUNDBITES[id];
  if (!bite) return false;
  const c = audio();
  if (!c || !master) return false;
  // A context suspended by the OS (a backgrounded tab, or a first tap that never
  // came) would otherwise accept the schedule against a clock that is not moving
  // and empty the whole queue at once on resume. Shown, not heard.
  if (c.state !== 'running') { void unlockAudio(); return true; }

  const now = c.currentTime;
  if (nextFree < now) nextFree = now;
  if (nextFree - now > MAX_QUEUE_S) return false;

  const start = nextFree;
  for (const v of bite.voices) schedule(c, master, v, start);
  nextFree = start + clipLength(bite.voices) + GAP_S;
  return true;
}

/** Tests only: forget the context and the queue between cases. */
export function resetSoundForTests(): void {
  ctx = null; master = null; noise = null; nextFree = 0; enabled = false;
}
