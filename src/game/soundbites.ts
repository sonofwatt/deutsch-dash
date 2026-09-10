/**
 * The canned soundbites: a fixed set of short noises a player can throw at the
 * table, chosen from a list rather than recorded.
 *
 * This is the cheaper half of `docs/audio-2026-09-09.md`, and it was built first
 * on that document's own argument: no microphone, no permission prompt, no
 * upload, no moderation problem and no normalisation problem, and it covers most
 * of what a table actually wants to say to each other mid-round. It is also not
 * throwaway work - the playback path, the one-at-a-time queue and the per-device
 * switch are the same pieces real voice clips would need.
 *
 * **They are SYNTHESISED, not files.** Nothing here loads an asset: every clip is
 * a handful of oscillator and noise bursts built at play time. That decision is
 * what keeps them out of the bundle entirely, and it is also the limit on what
 * they can be. A synthesised cheer is a rising triad, not a crowd; a synthesised
 * groan is a falling tone, not a voice. The set below is picked for what reads
 * clearly as an abstract noise, which is why it is stings and not impressions.
 *
 * This file is DATA and stays pure, so the whole catalogue is testable in node
 * where there is no `AudioContext`. `engine.ts` is the half that touches the
 * browser.
 */

import { EMOJI } from './badges';

export type SoundbiteId =
  | 'cheer' | 'groan' | 'hurry' | 'oops'
  | 'laugh' | 'wow' | 'boo' | 'tada';

/**
 * One burst inside a clip. A clip is a list of these, scheduled against the
 * moment playback starts, which is all the synthesis any of them needs.
 *
 * `freq` means two different things by `kind`, deliberately: an oscillator's
 * pitch for a tone, and a lowpass cutoff for a noise burst. Both are "how bright
 * is it", and keeping one field spares every recipe below a second one that is
 * meaningless for half of them.
 */
export interface Voice {
  kind: 'tone' | 'noise';
  /** Seconds from the start of the clip. */
  at: number;
  /** Seconds. The envelope decays to silence across it, so this is the whole tail. */
  dur: number;
  /** Peak, 0 to 1, before the master trim in the engine. */
  gain: number;
  /** Hz: an oscillator's pitch, or a noise burst's lowpass cutoff. */
  freq: number;
  /** A tone glides from `freq` to here across `dur`. Absent holds the pitch. */
  toFreq?: number;
  wave?: 'sine' | 'triangle' | 'square' | 'sawtooth';
}

export interface Soundbite {
  id: SoundbiteId;
  /** On the button, and what a screen reader says. */
  label: string;
  /** Carries EMOJI for the same reason every other glyph in the app does. */
  glyph: string;
  voices: Voice[];
}

/**
 * Eight rather than the dozen the research note sketched, and the number is the
 * point: they are a grid of buttons on a phone held over a board that is already
 * short of room, and four across by two down is what fits without the tray
 * scrolling. Eight distinct noises is also about where a table stops being able
 * to tell them apart. Adding a ninth is one entry here plus its recipe - the
 * catalogue is the only place that knows how many there are.
 */
export const SOUNDBITES: Record<SoundbiteId, Soundbite> = {
  // A rising major triad, opening out to the octave. The one unambiguously happy
  // shape available without a voice.
  cheer: {
    id: 'cheer', label: 'Cheer', glyph: '\u{1F389}' + EMOJI,
    voices: [
      { kind: 'tone', at: 0.00, dur: 0.12, gain: 0.45, freq: 523, wave: 'triangle' },
      { kind: 'tone', at: 0.09, dur: 0.12, gain: 0.45, freq: 659, wave: 'triangle' },
      { kind: 'tone', at: 0.18, dur: 0.30, gain: 0.55, freq: 784, wave: 'triangle' },
      { kind: 'tone', at: 0.27, dur: 0.30, gain: 0.35, freq: 1047, wave: 'triangle' },
    ],
  },
  // Falling, low and dull. Two voices a whisker apart so it beats slightly rather
  // than sounding like a test tone, which is most of what makes it read as a
  // groan and not as an error.
  groan: {
    id: 'groan', label: 'Groan', glyph: '\u{1F62B}' + EMOJI,
    voices: [
      { kind: 'tone', at: 0, dur: 0.55, gain: 0.45, freq: 220, toFreq: 110, wave: 'triangle' },
      { kind: 'tone', at: 0, dur: 0.55, gain: 0.30, freq: 226, toFreq: 113, wave: 'sine' },
    ],
  },
  // Two even ticks and a third that jumps, which is the shape of an impatient
  // "come ON" without any of its consonants.
  hurry: {
    id: 'hurry', label: 'Hurry up', glyph: '\u{23F1}' + EMOJI,
    voices: [
      { kind: 'tone', at: 0.00, dur: 0.06, gain: 0.40, freq: 880, wave: 'square' },
      { kind: 'tone', at: 0.12, dur: 0.06, gain: 0.40, freq: 880, wave: 'square' },
      { kind: 'tone', at: 0.24, dur: 0.12, gain: 0.50, freq: 1175, wave: 'square' },
    ],
  },
  // A small descending pair. Deliberately soft: this is somebody owning up, not
  // the board refusing a play, and the refusal sound is a different problem in a
  // different tier.
  oops: {
    id: 'oops', label: 'Oops', glyph: '\u{1F643}' + EMOJI,
    voices: [
      { kind: 'tone', at: 0.00, dur: 0.10, gain: 0.40, freq: 494, wave: 'triangle' },
      { kind: 'tone', at: 0.10, dur: 0.24, gain: 0.40, freq: 370, wave: 'triangle' },
    ],
  },
  // Four quick blips alternating high and low. The rhythm is the whole joke.
  laugh: {
    id: 'laugh', label: 'Laugh', glyph: '\u{1F604}' + EMOJI,
    voices: [
      { kind: 'tone', at: 0.00, dur: 0.07, gain: 0.40, freq: 700, wave: 'triangle' },
      { kind: 'tone', at: 0.09, dur: 0.07, gain: 0.38, freq: 560, wave: 'triangle' },
      { kind: 'tone', at: 0.18, dur: 0.07, gain: 0.36, freq: 700, wave: 'triangle' },
      { kind: 'tone', at: 0.27, dur: 0.10, gain: 0.34, freq: 520, wave: 'triangle' },
    ],
  },
  // One long rise. A sine so the sweep stays smooth rather than buzzing on the
  // way up, which is what separates surprise from an alarm.
  wow: {
    id: 'wow', label: 'Wow', glyph: '\u{1F62E}' + EMOJI,
    voices: [
      { kind: 'tone', at: 0, dur: 0.45, gain: 0.42, freq: 300, toFreq: 1400, wave: 'sine' },
    ],
  },
  // Low sawtooth, falling. The one place a rasp is wanted: a clean tone down
  // there reads as a fault noise, and this has to read as pantomime.
  boo: {
    id: 'boo', label: 'Boo', glyph: '\u{1F44E}' + EMOJI,
    voices: [
      { kind: 'tone', at: 0, dur: 0.50, gain: 0.35, freq: 150, toFreq: 98, wave: 'sawtooth' },
    ],
  },
  // A soft chime: three sine partials of one bell, struck once and left to ring.
  //
  // This slot WAS a two-note fanfare with a wash of bright noise over the second,
  // and it was reported as too harsh - which it was, and for two reasons worth
  // keeping written down. The noise burst was lowpassed at 6kHz, so most of its
  // energy sat exactly where a phone speaker is most peaky and an ear is most
  // sensitive; and the top triangle at 1319Hz put a stack of odd harmonics above
  // that. Sines carry no harmonics at all, and nothing here reaches past 1kHz.
  //
  // Still the celebratory one, so it keeps the sparkle glyph, and it keeps the id
  // `tada` DELIBERATELY: the id is enumerated in `database.rules.json`, so
  // renaming it would need a rules deploy to go out before any client could send
  // the new one, and the id is not a thing a player ever sees.
  tada: {
    id: 'tada', label: 'Nice one', glyph: '\u{2728}' + EMOJI,
    voices: [
      // The strike, and the fifth above it a breath later: two notes of the same
      // bell rather than two notes of a fanfare.
      { kind: 'tone', at: 0.00, dur: 0.66, gain: 0.38, freq: 587, wave: 'sine' },
      { kind: 'tone', at: 0.06, dur: 0.70, gain: 0.30, freq: 880, wave: 'sine' },
      // The shimmer, well under the other two and decaying first, which is what
      // makes it read as one struck thing rather than as a third note.
      { kind: 'tone', at: 0.06, dur: 0.40, gain: 0.12, freq: 1175, wave: 'sine' },
    ],
  },
};

/** Catalogue order, which is button order. Object key order, pinned by a test. */
export const SOUNDBITE_IDS = Object.keys(SOUNDBITES) as SoundbiteId[];

/**
 * Is this one of ours? Every soundbite id in a room arrived from some other
 * client, and the same reasoning applies as to `isBadgeId`: a hand-edited or
 * retired value must not reach the engine, which would otherwise look up
 * `undefined.voices`. The rules validate the id too, but the client does not get
 * to assume the rules were deployed - see the handoff on exactly that.
 */
export function isSoundbiteId(v: unknown): v is SoundbiteId {
  return typeof v === 'string' && Object.hasOwn(SOUNDBITES, v);
}

/**
 * How long a clip runs, in seconds: the last voice to finish, not the last to
 * start. The queue schedules against this, so a voice with a long tail that
 * starts early still has to be counted.
 */
export function clipLength(voices: Voice[]): number {
  return voices.reduce((max, v) => Math.max(max, v.at + v.dur), 0);
}
