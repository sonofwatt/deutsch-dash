/**
 * Shells of coloured sparks, thrown behind whatever is on top of them.
 *
 * This ran on the dash splash until 2026-09-09, when the table asked for the two
 * celebrations to say different things: a dash rains emoji, and the fireworks are
 * what a WON GAME gets, behind the final score sheet. It moved into its own file
 * on the way, because it now has one caller and that caller is not the splash.
 *
 * **Thirty shells at forty-six sparks each**, about 1410 elements, over eight
 * seconds. Doubled from fifteen over four on 2026-09-09, at the table's request
 * and after measuring: the display is what it costs, and the handoff's own note
 * said to measure before letting it grow again.
 *
 * A spark's FLIGHT is transform and opacity, so it composites and nothing here
 * reflows. The twinkle running alongside it is `filter: brightness`, which is
 * paint rather than composite - the one property in it that is not free. It
 * stays, because it cannot move to opacity without fighting the flight's own fade
 * on that property, but it now STOPS with the flight rather than running
 * `infinite`: at 690 elements a twinkle left ticking behind a sheet nobody has
 * dismissed was affordable and rude, and at 1410 it is neither.
 *
 * Pure CSS: each spark is one element flung along its own bearing and dropped by
 * gravity at the end, which is the whole difference between a firework and a
 * starburst.
 */

/**
 * How far apart the shells go off. The whole display is this times the shell
 * count, plus the 1500ms a spark takes to fly, so doubling the duration is this
 * number and the length of the list below and nothing else.
 */
const SHELL_GAP_MS = 225;

/**
 * Where each shell goes off, as a percentage across and down its container. The
 * order is the firing order, and the two halves are INTERLEAVED so consecutive
 * shells land far apart: a list in reading order marches across the screen.
 */
const SHELLS = [
  { x: 22, y: 30, hue: 42 },  { x: 48, y: 12, hue: 0 },
  { x: 76, y: 22, hue: 320 }, { x: 18, y: 74, hue: 225 },
  { x: 50, y: 46, hue: 190 }, { x: 66, y: 10, hue: 60 },
  { x: 16, y: 58, hue: 96 },  { x: 90, y: 60, hue: 270 },
  { x: 84, y: 54, hue: 12 },  { x: 8, y: 20, hue: 130 },
  { x: 34, y: 16, hue: 265 }, { x: 56, y: 80, hue: 350 },
  { x: 64, y: 66, hue: 55 },  { x: 30, y: 84, hue: 80 },
  { x: 12, y: 38, hue: 150 }, { x: 74, y: 76, hue: 180 },
  { x: 88, y: 36, hue: 340 }, { x: 40, y: 36, hue: 300 },
  { x: 44, y: 72, hue: 200 }, { x: 60, y: 56, hue: 20 },
  { x: 70, y: 44, hue: 30 },  { x: 24, y: 44, hue: 160 },
  { x: 28, y: 52, hue: 285 }, { x: 92, y: 14, hue: 45 },
  { x: 58, y: 26, hue: 110 }, { x: 6, y: 66, hue: 310 },
  { x: 80, y: 68, hue: 15 },  { x: 52, y: 68, hue: 90 },
  { x: 38, y: 62, hue: 175 }, { x: 82, y: 28, hue: 240 },
];
const SHELL_SPARKS = 46;

export function Fireworks() {
  return (
    <div className="fireworks" aria-hidden="true">
      {SHELLS.map((s, si) => (
        <span key={si} className="shell" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
          {/* The ignition bloom. One element, and it is most of why a shell reads
              as going OFF rather than as dots appearing. */}
          <b style={{ ['--hue' as string]: String(s.hue), ['--delay' as string]: `${si * SHELL_GAP_MS}ms` }} />
          {Array.from({ length: SHELL_SPARKS }, (_, i) => (
            <i key={i} style={{
              // Two turns of the circle, so the arms interleave rather than
              // arriving as one rank of spokes.
              ['--a' as string]: `${(i * 720) / SHELL_SPARKS}deg`,
              ['--r' as string]: `${13 + (i % 5) * 4.5}vmin`,
              ['--hue' as string]: String(s.hue + (i % 6) * 10),
              ['--delay' as string]: `${si * SHELL_GAP_MS + (i % 4) * 35}ms`,
              // Every sixth spark is a small white one, which is what turns a
              // coloured burst into a glittery one.
              ['--sz' as string]: i % 6 === 0 ? '4px' : `${5 + (i % 3) * 2}px`,
              ['--lit' as string]: i % 6 === 0 ? '96%' : '58%',
              ['--tw' as string]: `${(i % 7) * 90}ms`,
            }} />
          ))}
        </span>
      ))}
    </div>
  );
}
