/**
 * Shells of coloured sparks, thrown behind whatever is on top of them.
 *
 * This ran on the dash splash until 2026-09-09, when the table asked for the two
 * celebrations to say different things: a dash rains emoji, and the fireworks are
 * what a WON GAME gets, behind the final score sheet. It moved into its own file
 * on the way, because it now has one caller and that caller is not the splash.
 *
 * **Fifteen shells at forty-six sparks each**, about 690 elements. It is
 * affordable because it exists for 3.6 seconds and nothing here reflows: a
 * spark's FLIGHT is transform and opacity. The twinkle running alongside it is
 * `filter: brightness`, which is paint rather than composite - the one property
 * in it that is not free, and it stays because it cannot move to opacity without
 * fighting the flight's own fade on that property. Worth re-measuring on a
 * low-end phone before it grows again, and the twinkle is the first thing to look
 * at if it ever costs.
 *
 * Pure CSS: each spark is one element flung along its own bearing and dropped by
 * gravity at the end, which is the whole difference between a firework and a
 * starburst. The shells are staggered across three seconds so they go off in
 * sequence rather than together.
 */

/** Where each shell goes off, as a percentage across and down its container. */
const SHELLS = [
  { x: 22, y: 30, hue: 42, delay: 0 },    { x: 76, y: 22, hue: 320, delay: 180 },
  { x: 50, y: 46, hue: 190, delay: 360 }, { x: 16, y: 58, hue: 96, delay: 540 },
  { x: 84, y: 54, hue: 12, delay: 720 },  { x: 34, y: 16, hue: 265, delay: 900 },
  { x: 64, y: 66, hue: 55, delay: 1080 }, { x: 12, y: 38, hue: 150, delay: 1260 },
  { x: 88, y: 36, hue: 340, delay: 1440 }, { x: 44, y: 72, hue: 200, delay: 1620 },
  { x: 70, y: 44, hue: 30, delay: 1800 }, { x: 28, y: 52, hue: 285, delay: 1980 },
  { x: 58, y: 26, hue: 110, delay: 2160 }, { x: 80, y: 68, hue: 15, delay: 2340 },
  { x: 38, y: 62, hue: 175, delay: 2520 },
];
const SHELL_SPARKS = 46;

export function Fireworks() {
  return (
    <div className="fireworks" aria-hidden="true">
      {SHELLS.map((s, si) => (
        <span key={si} className="shell" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
          {/* The ignition bloom. One element, and it is most of why a shell reads
              as going OFF rather than as dots appearing. */}
          <b style={{ ['--hue' as string]: String(s.hue), ['--delay' as string]: `${s.delay}ms` }} />
          {Array.from({ length: SHELL_SPARKS }, (_, i) => (
            <i key={i} style={{
              // Two turns of the circle, so the arms interleave rather than
              // arriving as one rank of spokes.
              ['--a' as string]: `${(i * 720) / SHELL_SPARKS}deg`,
              ['--r' as string]: `${13 + (i % 5) * 4.5}vmin`,
              ['--hue' as string]: String(s.hue + (i % 6) * 10),
              ['--delay' as string]: `${s.delay + (i % 4) * 35}ms`,
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
