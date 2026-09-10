/**
 * The lobby countdown's tones: three ticks and a GO.
 *
 * Given as a synthesis recipe by the table on 2026-09-10 - a band-limited pulse
 * at 30% duty, its upper partials rolled off, through a 3.2kHz lowpass - and
 * translated here rather than shipped as a file, for the same reason the
 * soundbites are synthesised: nothing goes in the bundle and there is no asset to
 * fetch before the first game of the day.
 *
 * **The timing is not in this file, and that is the point.** The recipe placed
 * the beeps a second apart by hand; the countdown already writes 3, 2, 1 and then
 * 0 a second apart, and every client plays a tone when the DIGIT CHANGES. So the
 * tones cannot drift from the numbers on screen - they are the same event - and a
 * phone that joins mid-countdown picks up from whatever digit it walked in on.
 * See RoomMeta.countdown for why the digit is the clock rather than a deadline.
 *
 * Pure, like `soundbites.ts`, so the whole recipe is testable in node where there
 * is no `AudioContext`.
 */

/** A pulse this wide. Narrow enough to have a reedy edge, not so narrow it thins. */
export const PULSE_DUTY = 0.30;
/** Everything above this is rounded off, which is what stops it being a buzz. */
export const PULSE_LOWPASS = 3200;

export interface Tone { freq: number; dur: number; release: number }
/** 3, 2, 1. */
export const COUNT_TONE: Tone = { freq: 440, dur: 0.20, release: 0.030 };
/** And GO, an octave up and held. */
export const GO_TONE: Tone = { freq: 880, dur: 0.75, release: 0.045 };

/** Which tone a digit gets. Zero renders as "GO!" on the board, and sounds like it. */
export function toneFor(digit: number): Tone {
  return digit === 0 ? GO_TONE : COUNT_TONE;
}

/**
 * The harmonic amplitudes of a band-limited pulse, as sine coefficients.
 *
 * `(2 / k.pi) . sin(k.pi.duty)` is the pulse itself; the `1 / (1 + (k/5)^2)`
 * after it is the part that makes it a countdown beep rather than a square-wave
 * alarm - it tames the bright upper partials, which are the ones a phone speaker
 * exaggerates. Additive rather than a sampled waveform, so there is nothing to
 * alias: every partial is placed deliberately and none of them is above Nyquist.
 *
 * Index 0 is the DC term and is always zero, which is the shape
 * `createPeriodicWave` wants.
 */
export function pulseHarmonics(count: number, duty = PULSE_DUTY): Float32Array {
  const out = new Float32Array(count + 1);
  for (let k = 1; k <= count; k++) {
    out[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty) / (1 + (k / 5) ** 2);
  }
  return out;
}

/**
 * How many partials a tone at this pitch may have before it reaches Nyquist.
 *
 * Capped, because the top of that range contributes almost nothing after the
 * roll-off above and the lowpass below - a 440Hz tone would otherwise carry 49
 * partials, 40 of which are inaudible and all of which cost the wave table.
 */
export const MAX_PARTIALS = 24;
export function partialsFor(freq: number, sampleRate: number): number {
  return Math.max(1, Math.min(MAX_PARTIALS, Math.floor(sampleRate / 2 / freq) - 1));
}
