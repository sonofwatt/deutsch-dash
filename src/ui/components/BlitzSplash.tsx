import { motion } from 'framer-motion';
import { EMOJI } from '../../game/badges';
import type { Splash, SplashBase } from '../splashVariant';

/**
 * Three glyphs, not eight. A burst reads as a celebration when the eye can take
 * it in at once, and eight different faces at forty-four copies read as a pile of
 * stickers. Sunglasses, party and fire: pleased with yourself, in that order.
 */
const SPARKLES = ['😎', '🥳', '🔥'];
const SPARKS = 42;
const FALLERS = 26;
/** Where the fireworks go off, as a percentage across and down. */
const SHELLS = [
  { x: 22, y: 30, hue: 42, delay: 0 }, { x: 76, y: 22, hue: 320, delay: 420 },
  { x: 50, y: 46, hue: 190, delay: 840 }, { x: 16, y: 58, hue: 96, delay: 1260 },
  { x: 84, y: 54, hue: 12, delay: 1680 },
];
const SHELL_SPARKS = 14;

/** What falls on somebody who did not blitz. The trophy falls with it. */
const GLYPHS: Record<Exclude<SplashBase, 'glitter'>, string> = {
  poo: '💩', crying: '😢', relief: '🥹', toilet: '🚽',
};

/**
 * Shells of coloured sparks, underneath everything else. Pure CSS: each spark is
 * one element flung along its own bearing and dropped by gravity at the end, and
 * the whole thing is five of those staggered across the splash's three seconds.
 */
function Fireworks() {
  return (
    <div className="fireworks" aria-hidden="true">
      {SHELLS.map((s, si) => (
        <span key={si} className="shell" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
          {Array.from({ length: SHELL_SPARKS }, (_, i) => (
            <i key={i} style={{
              ['--a' as string]: `${(i * 360) / SHELL_SPARKS}deg`,
              ['--r' as string]: `${16 + (i % 3) * 5}vmin`,
              ['--hue' as string]: String(s.hue + (i % 4) * 12),
              ['--delay' as string]: `${s.delay + (i % 3) * 40}ms`,
            }} />
          ))}
        </span>
      ))}
    </div>
  );
}

/** Emoji radiating from the middle, each staying upright as it flies. */
function Glitter() {
  return (
    <div className="splash-fx" aria-hidden="true">
      {Array.from({ length: SPARKS }, (_, i) => (
        <span key={i} className="spark" style={{
          // Two turns of the circle rather than one, so the arms interleave
          // instead of arriving as a single rank of spokes.
          ['--a' as string]: `${(i * 720) / SPARKS}deg`,
          ['--d' as string]: `${[46, 30, 38, 24, 42][i % 5]}vmin`,
          ['--delay' as string]: `${(i % 9) * 80}ms`,
          ['--spin' as string]: `${i % 2 ? 200 : -200}deg`,
          ['--size' as string]: `${[1, 1.35, 0.8, 1.15][i % 4]}`,
        }}>{SPARKLES[i % SPARKLES.length] + EMOJI}</span>
      ))}
    </div>
  );
}

/**
 * A column of emoji per lane, staggered so they do not fall in a rank. Two
 * glyphs when a trophy is falling with the bad news: they alternate down the
 * lanes rather than pairing up, so the trophy reads as part of the same weather.
 */
function Rain({ glyphs }: { glyphs: string[] }) {
  return (
    <div className="splash-fx" aria-hidden="true">
      {Array.from({ length: FALLERS }, (_, i) => (
        <span key={i} className="faller" style={{
          left: `${(i % 13) * 7.7 + (i < 13 ? 1 : 4.5)}%`,
          ['--delay' as string]: `${(i % 9) * 130}ms`,
          ['--dur' as string]: `${2600 + (i % 5) * 200}ms`,
          ['--spin' as string]: `${i % 2 ? 24 : -24}deg`,
        }}>{glyphs[i % glyphs.length] + EMOJI}</span>
      ))}
    </div>
  );
}

export function BlitzSplash({ name, splash }: { name: string; splash: Splash }) {
  const glyphs = splash.base === 'glitter' ? [] : [GLYPHS[splash.base]];
  if (splash.trophy) glyphs.push('🏆');
  return (
    <div className="blitz-splash">
      {splash.base === 'glitter' ? <><Fireworks /><Glitter /></> : <Rain glyphs={glyphs} />}
      {/* Above the weather, not in it. The name is the one piece of information
          the splash carries and it was being rained on. */}
      <motion.div className="blitz-say"
        initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
        <div className="blitz-word">BLITZ!</div>
        <p className="blitz-name">{name}</p>
      </motion.div>
    </div>
  );
}
