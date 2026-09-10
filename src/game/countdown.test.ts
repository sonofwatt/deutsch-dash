import { describe, it, expect } from 'vitest';
import { COUNT_TONE, GO_TONE, MAX_PARTIALS, partialsFor, PULSE_DUTY, PULSE_LOWPASS,
  pulseHarmonics, toneFor } from './countdown';

/**
 * The countdown tones, against the recipe they were given as.
 *
 * The reference is a band-limited pulse: `(2 / k.pi) . sin(k.pi.duty)`, each
 * partial then scaled by `1 / (1 + (k/5)^2)`, through a 3.2kHz lowpass. Checked
 * against the arithmetic rather than against a table of numbers, so the duty can
 * be retuned without re-pinning every harmonic.
 */
const reference = (k: number, duty = PULSE_DUTY) =>
  (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty) / (1 + (k / 5) ** 2);

describe('the pulse', () => {
  it('matches the recipe partial for partial', () => {
    // 6 places, not more: these are stored in a Float32Array, which is what
    // createPeriodicWave takes, and that carries about seven significant digits.
    const h = pulseHarmonics(12);
    for (let k = 1; k <= 12; k++) expect(h[k]).toBeCloseTo(reference(k), 6);
  });

  it('leaves the DC term at zero, which is the shape a PeriodicWave wants', () => {
    expect(pulseHarmonics(8)[0]).toBe(0);
    expect(pulseHarmonics(8)).toHaveLength(9);
  });

  it('rolls the bright partials off, which is what stops it being an alarm', () => {
    // The 1/(1+(k/5)^2) term. Without it a 30% pulse is a square-ish buzz, and a
    // phone speaker exaggerates exactly that end of it.
    const h = pulseHarmonics(20);
    expect(Math.abs(h[10])).toBeLessThan(Math.abs(h[1]));
    expect(Math.abs(h[20])).toBeLessThan(Math.abs(h[10]));
    // and the fundamental is the loudest thing in it
    const peak = Math.max(...[...h].map(Math.abs));
    expect(Math.abs(h[1])).toBe(peak);
  });

  it('puts a null where a 30% duty puts one', () => {
    // sin(k.pi.duty) is zero at k = 10 for a 3/10 duty, and a pulse having gaps
    // in its series is what makes it a pulse rather than a saw.
    expect(pulseHarmonics(12)[10]).toBeCloseTo(0, 12);
  });
});

describe('how many partials a tone gets', () => {
  it('never reaches Nyquist, whatever the pitch', () => {
    for (const freq of [440, 880]) {
      for (const rate of [44100, 48000]) {
        expect(partialsFor(freq, rate) * freq).toBeLessThan(rate / 2);
      }
    }
  });

  it('is capped, because the top of the range is inaudible after the roll-off', () => {
    expect(partialsFor(440, 44100)).toBe(MAX_PARTIALS);
    // A high pitch runs out of room before it reaches the cap.
    expect(partialsFor(8000, 44100)).toBeLessThan(MAX_PARTIALS);
  });

  it('always gives at least one, so a tone is never silent', () => {
    expect(partialsFor(30000, 44100)).toBeGreaterThanOrEqual(1);
  });
});

describe('which tone a digit gets', () => {
  it('ticks on 3, 2 and 1 and goes on 0', () => {
    // The lobby renders 0 as "GO!", so 0 is the one that sounds different.
    expect(toneFor(3)).toBe(COUNT_TONE);
    expect(toneFor(2)).toBe(COUNT_TONE);
    expect(toneFor(1)).toBe(COUNT_TONE);
    expect(toneFor(0)).toBe(GO_TONE);
  });

  it('puts GO an octave above the ticks, and holds it', () => {
    expect(GO_TONE.freq).toBe(COUNT_TONE.freq * 2);
    expect(GO_TONE.dur).toBeGreaterThan(COUNT_TONE.dur);
  });

  it('is the recipe\'s own numbers', () => {
    expect(COUNT_TONE).toEqual({ freq: 440, dur: 0.20, release: 0.030 });
    expect(GO_TONE).toEqual({ freq: 880, dur: 0.75, release: 0.045 });
    expect(PULSE_DUTY).toBe(0.30);
    expect(PULSE_LOWPASS).toBe(3200);
  });

  it('never runs a tick into the next digit, which arrives a second later', () => {
    // The recipe placed its beeps a second apart by hand; here the digits do that,
    // so the only thing that has to hold is that a tone fits inside one.
    expect(COUNT_TONE.dur).toBeLessThan(1);
    expect(GO_TONE.dur).toBeLessThan(1);
  });
});
