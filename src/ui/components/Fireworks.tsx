/**
 * Shells of coloured sparks, thrown behind whatever is on top of them.
 *
 * This ran on the dash splash until 2026-09-09, when the table asked for the two
 * celebrations to say different things: a dash rains emoji, and the fireworks are
 * what a WON GAME gets, behind the final score sheet. It moved into its own file
 * on the way, because it now has one caller and that caller is not the splash.
 *
 * **Forty-five shells at forty-six sparks each**, about 2115 elements, over
 * eight seconds. Fifteen over four until 2026-09-09, thirty until 2026-09-10,
 * and every step measured before it was allowed: the display is what it costs.
 *
 * A spark's FLIGHT is transform and opacity, so it composites and nothing here
 * reflows. The twinkle running alongside it is `filter: brightness`, which is
 * paint rather than composite - the one property in it that is not free, and on
 * every spark at forty-five shells it stopped being affordable: it was the whole
 * of the jump from 33ms frames to 67ms. It runs on the WHITE sparks only now, one
 * in six, which is where the glitter reads from anyway, and that bought the cost
 * back entirely. It also STOPS with the flight rather than running `infinite`,
 * which it did until 2026-09-09: a twinkle left ticking behind a sheet nobody had
 * dismissed halved the frame rate of a screen doing nothing.
 *
 * Pure CSS: each spark is one element flung along its own bearing and dropped by
 * gravity at the end, which is the whole difference between a firework and a
 * starburst.
 *
 * **Five roman candles** fire up the same sky, added 2026-09-09. They are a
 * different instrument on purpose: a shell is one burst that fills its patch of
 * sky at once, and a candle is a slow file of single stars leaving one spot,
 * which gives the display a pulse between bursts rather than thirty of the same
 * event. Fifty elements against the shells' 1410, and measured at no cost at all,
 * so what they buy is rhythm and what they spend is nothing.
 */

/**
 * How far apart the shells go off. The whole display is this times the shell
 * count, plus the 1500ms a spark takes to fly, so doubling the duration is this
 * number and the length of the list below and nothing else.
 */
const SHELL_GAP_MS = 148;

/**
 * Where each shell goes off, as a percentage across and down its container.
 *
 * The order is the FIRING order and it is scattered on purpose: a list in reading
 * order marches across the screen. These sit on a jittered 5 x 9 grid walked 19
 * cells at a time - 19 is coprime with 45, so the walk visits every position
 * exactly once while consecutive shells land rows and columns apart. No two in a
 * row are closer than 37 units of the 100 the canvas is wide, and the hues step
 * 128 degrees with them, so neighbours in time differ in colour as well as place.
 */
const SHELLS = [
  { x: 10, y: 13, hue: 0 }, { x: 91, y: 35, hue: 128 },
  { x: 74, y: 73, hue: 256 }, { x: 54, y: 25, hue: 24 },
  { x: 24, y: 63, hue: 152 }, { x: 5, y: 19, hue: 280 },
  { x: 95, y: 45, hue: 48 }, { x: 69, y: 81, hue: 176 },
  { x: 49, y: 37, hue: 304 }, { x: 31, y: 71, hue: 72 },
  { x: 9, y: 26, hue: 200 }, { x: 93, y: 55, hue: 328 },
  { x: 68, y: 8, hue: 96 }, { x: 54, y: 45, hue: 224 },
  { x: 26, y: 84, hue: 352 }, { x: 5, y: 36, hue: 120 },
  { x: 95, y: 62, hue: 248 }, { x: 73, y: 18, hue: 16 },
  { x: 45, y: 52, hue: 144 }, { x: 25, y: 8, hue: 272 },
  { x: 8, y: 46, hue: 40 }, { x: 90, y: 71, hue: 168 },
  { x: 68, y: 26, hue: 296 }, { x: 52, y: 66, hue: 64 },
  { x: 33, y: 23, hue: 192 }, { x: 5, y: 59, hue: 320 },
  { x: 95, y: 85, hue: 88 }, { x: 75, y: 40, hue: 216 },
  { x: 47, y: 75, hue: 344 }, { x: 27, y: 30, hue: 112 },
  { x: 10, y: 69, hue: 240 }, { x: 95, y: 12, hue: 8 },
  { x: 70, y: 48, hue: 136 }, { x: 55, y: 86, hue: 264 },
  { x: 29, y: 41, hue: 32 }, { x: 5, y: 76, hue: 160 },
  { x: 89, y: 22, hue: 288 }, { x: 75, y: 57, hue: 56 },
  { x: 52, y: 12, hue: 184 }, { x: 24, y: 51, hue: 312 },
  { x: 10, y: 86, hue: 80 }, { x: 95, y: 29, hue: 208 },
  { x: 70, y: 70, hue: 336 }, { x: 47, y: 22, hue: 104 },
  { x: 29, y: 58, hue: 232 },
];
const SHELL_SPARKS = 46;

/**
 * How fast one candle files its stars off, and how many. A candle is a rhythm,
 * not a burst: at 520ms and eight it fired too slowly to read as a stream, and
 * a lone star every half second among a couple of hundred shell sparks read as
 * more confetti rather than as a tube going off.
 */
const CANDLE_GAP_MS = 360;
const CANDLE_STARS = 10;
/**
 * The tubes, along the bottom edge. `start` is deliberately NOT a formula and
 * deliberately not in order across the screen: candles going off in step read as
 * one machine, and the point of them is to punctuate the shells rather than march
 * with them. Each runs 8 x 520ms plus a star's 1200ms flight, so the last one
 * lit at 2800ms finishes at 7240ms, inside the shells' own eight seconds.
 *
 * They sit OUT at the edges rather than spread evenly, because the sheet is in
 * the middle: a tube at 31% spends most of its climb behind the scores. The one
 * at 50% is deliberate, and passing behind the sheet is what it is for.
 */
const CANDLES = [
  { x: 6, hue: 45, start: 400 },
  { x: 24, hue: 200, start: 2100 },
  { x: 50, hue: 330, start: 900 },
  { x: 76, hue: 110, start: 2800 },
  { x: 94, hue: 20, start: 1600 },
];

export function Fireworks() {
  return (
    <div className="fireworks" aria-hidden="true">
      {SHELLS.map((s, si) => (
        <span key={si} className="shell" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
          {/* The ignition bloom. One element, and it is most of why a shell reads
              as going OFF rather than as dots appearing. */}
          <b style={{ ['--hue' as string]: String(s.hue), ['--delay' as string]: `${si * SHELL_GAP_MS}ms` }} />
          {Array.from({ length: SHELL_SPARKS }, (_, i) => (
            <i key={i}
              // The white one-in-six, named rather than counted in CSS: this is
              // the one place that decides which sparks are the white ones, and
              // `.glint` is what carries that decision to the stylesheet.
              className={i % 6 === 0 ? 'glint' : undefined}
              style={{
              // Two turns of the circle, so the arms interleave rather than
              // arriving as one rank of spokes.
              ['--a' as string]: `${(i * 720) / SHELL_SPARKS}deg`,
              ['--r' as string]: `${13 + (i % 5) * 4.5}vmin`,
              ['--hue' as string]: String(s.hue + (i % 6) * 10),
              ['--delay' as string]: `${si * SHELL_GAP_MS + (i % 4) * 35}ms`,
              // Every sixth spark is a small white one, which is what turns a
              // coloured burst into a glittery one - and, since 2026-09-10, the
              // only one that twinkles. See `.glint` in ui.css for what that
              // bought back.
              ['--sz' as string]: i % 6 === 0 ? '4px' : `${5 + (i % 3) * 2}px`,
              ['--lit' as string]: i % 6 === 0 ? '96%' : '58%',
              ['--tw' as string]: `${(i % 7) * 90}ms`,
            }} />
          ))}
        </span>
      ))}
      {CANDLES.map((c, ci) => (
        <span key={`c${ci}`} className="candle" style={{ left: `${c.x}%`, top: '98%' }}>
          {Array.from({ length: CANDLE_STARS }, (_, i) => (
            <i key={i} style={{
              ['--delay' as string]: `${c.start + i * CANDLE_GAP_MS}ms`,
              // Four heights and a little sideways drift, so a tube does not fire
              // the same star eight times up the same line.
              ['--rise' as string]: `-${40 + (i % 4) * 7}vh`,
              ['--dx' as string]: `${((i % 3) - 1) * 2.5}vw`,
              ['--hue' as string]: String(c.hue + (i % 3) * 8),
              ['--sz' as string]: i % 3 === 0 ? '13px' : '11px',
            }} />
          ))}
        </span>
      ))}
    </div>
  );
}
