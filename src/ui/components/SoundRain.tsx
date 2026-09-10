import { useEffect, useState } from 'react';
import { useGameStore } from '../../state/store';
import { SOUNDBITES } from '../../game/soundbites';

/**
 * The soundbite's emoji, falling.
 *
 * A soundbite is a message across a table, and a message you can only hear is one
 * that misses anybody whose phone is face down, silenced by the OS, or simply not
 * being looked at. So every clip that reaches this device also draws itself. It is
 * the half that still works when the audio does not, which is why `playSoundbite`
 * reports "reached this device" rather than "made a noise".
 *
 * **It falls about a third of the way down and stops.** Not the full height the
 * dash splash uses: that one IS the moment and owns the screen for 3.6 seconds,
 * whereas this arrives in the middle of a round somebody is playing. The top third
 * is the head row and the opponent strip, which is the part of the screen with
 * nothing in it a thumb wants.
 *
 * **It cannot be touched.** `pointer-events: none` on the layer, and it is
 * `position: fixed` outside every drop target, so a card flicked through the
 * weather lands exactly where it would have. That is the hard requirement here: a
 * decoration that could eat a play would be worse than no decoration at all.
 *
 * Reads the store itself, the way `ConnectionPill` does, so both screens drop it
 * in as one line and the timer below lives in exactly one place.
 */
const DROPS = 7;
/**
 * How long the layer stays mounted. Comfortably past the slowest drop (1270ms
 * plus its 240ms of stagger) so nothing is cut off mid-fall, and short enough
 * that a parked one under reduced motion does not sit there for the rest of the
 * round.
 */
export const RAIN_MS = 1800;

export function SoundRain() {
  const lastSound = useGameStore(s => s.lastSound);
  const seq = lastSound?.seq ?? null;
  // `done` holds the nonce that has finished FALLING, and showing is derived from
  // it rather than set alongside it. A second soundbite arriving mid-fall gets a
  // nonce that no longer matches `done`, so the layer restarts instead of being
  // swallowed by a timer already running - and nothing sets state during the
  // effect, only from the timeout. Same shape as the hint's activity epoch in
  // Game.tsx.
  const [done, setDone] = useState<number | null>(null);
  useEffect(() => {
    if (seq == null) return;
    const t = setTimeout(() => setDone(seq), RAIN_MS);
    return () => clearTimeout(t);
  }, [seq]);

  if (!lastSound || seq == null || done === seq) return null;
  const glyph = SOUNDBITES[lastSound.id]?.glyph;
  if (!glyph) return null;
  return (
    // Keyed on the nonce so the same soundbite twice in a row remounts and
    // replays, rather than sitting there having already finished. Same trick the
    // race flash uses on its own `at`, but a counter rather than a clock - see
    // `lastSound` in the store for why that distinction is load bearing.
    <div className="sound-rain" key={seq} aria-hidden="true">
      {Array.from({ length: DROPS }, (_, i) => (
        <span key={i} className="sound-drop" style={{
          // Fixed lanes rather than a random scatter: this remounts often, and a
          // fresh roll every time reads as flicker rather than as weather.
          left: `${6 + i * 13.5 + (i % 2 ? 3 : 0)}%`,
          ['--delay' as string]: `${(i % 4) * 80}ms`,
          ['--dur' as string]: `${950 + (i % 3) * 160}ms`,
          ['--spin' as string]: `${i % 2 ? 18 : -18}deg`,
          ['--end' as string]: `${28 + (i % 3) * 4}vh`,
        }}>{glyph}</span>
      ))}
    </div>
  );
}
