import { useEffect, useState } from 'react';
import { useGameStore } from '../../state/store';
import { SOUNDBITES } from '../../game/soundbites';
import { expireFall, noteFall, seedFalls } from '../sound/soundFalls';

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
  /**
   * Which falls are on screen, and which nonce has been accounted for. Both live
   * in `soundFalls.ts`, which is pure and holds the two behaviours that were
   * reported as bugs: falls STACK rather than replacing each other, and a fresh
   * mount adopts whatever was last played instead of replaying it.
   *
   * Seeded lazily so the adopt happens once, at mount, off the store as it stands
   * then - which is the whole of the fix for emoji arriving at the start of a
   * round.
   */
  const [state, setState] = useState(() => seedFalls(seq));
  const { falls } = state;

  useEffect(() => {
    const id = lastSound?.id;
    if (seq == null || !id) return;
    setState(prev => noteFall(prev, id, seq));
    const t = setTimeout(() => setState(prev => expireFall(prev, seq)), RAIN_MS);
    return () => clearTimeout(t);
    // `seq` is the nonce and the only thing that may add a fall: reading
    // `lastSound` here would re-run on an unrelated store write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  if (falls.length === 0) return null;
  return (
    <>
      {falls.map(fall => {
        const glyph = SOUNDBITES[fall.id]?.glyph;
        if (!glyph) return null;
        return (
          // Keyed on the nonce so the same soundbite twice in a row is two
          // layers rather than one that restarts. Same trick the race flash uses
          // on its own `at`, but a counter rather than a clock - see `lastSound`
          // in the store for why that distinction is load bearing.
          <div className="sound-rain" key={fall.seq} aria-hidden="true">
            {Array.from({ length: DROPS }, (_, i) => (
              <span key={i} className="sound-drop" style={{
                // Fixed lanes rather than a random scatter: this remounts often,
                // and a fresh roll every time reads as flicker rather than as
                // weather. Nudged by the nonce so two falls at once are not one
                // fall in bold - a whole lane apart would break the lanes.
                left: `${6 + i * 13.5 + (i % 2 ? 3 : 0) + (fall.seq % 3) * 2}%`,
                ['--delay' as string]: `${(i % 4) * 80}ms`,
                ['--dur' as string]: `${950 + (i % 3) * 160}ms`,
                ['--spin' as string]: `${i % 2 ? 18 : -18}deg`,
                ['--end' as string]: `${28 + (i % 3) * 4}vh`,
              }}>{glyph}</span>
            ))}
          </div>
        );
      })}
    </>
  );
}
