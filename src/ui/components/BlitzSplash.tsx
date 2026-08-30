import { motion } from 'framer-motion';
import { EMOJI } from '../../game/badges';
import type { SplashVariant } from '../splashVariant';

/** A proper shower of it. The blitzer wins the round; the screen should agree. */
const SPARKS = 44;
/**
 * The glitter is not one glyph any more. A single repeated emoji reads as a
 * pattern; a handful of them reads as a celebration, and the eye picks the whole
 * burst up as colour rather than as forty copies of one thing.
 */
const SPARKLES = ['✨', '🎉', '⭐', '🎊', '💫', '🥳', '🏆', '🌟'];
/**
 * A downpour rather than a drizzle. At ten, on a phone, most of the screen was
 * empty most of the time and the joke landed as a couple of glyphs drifting past.
 */
const FALLERS = 26;

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

/** A column of emoji per lane, staggered so they do not fall in a rank. */
function Rain({ glyph }: { glyph: string }) {
  return (
    <div className="splash-fx" aria-hidden="true">
      {Array.from({ length: FALLERS }, (_, i) => (
        <span key={i} className="faller" style={{
          // Two passes across the width rather than one row of lanes, so twice
          // the glyphs do not mean twice the columns - they overlap and read as
          // weather instead of as a picket fence.
          left: `${(i % 13) * 7.7 + (i < 13 ? 1 : 4.5)}%`,
          ['--delay' as string]: `${(i % 9) * 130}ms`,
          ['--dur' as string]: `${2600 + (i % 5) * 200}ms`,
          ['--spin' as string]: `${i % 2 ? 24 : -24}deg`,
        }}>{glyph + EMOJI}</span>
      ))}
    </div>
  );
}

export function BlitzSplash({ name, variant }: { name: string; variant: SplashVariant }) {
  return (
    <div className="blitz-splash">
      {variant === 'glitter' ? <Glitter /> : <Rain glyph={variant === 'poo' ? '💩' : '😢'} />}
      <motion.div initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
        <div className="blitz-word">BLITZ!</div>
        <p className="blitz-name">{name}</p>
      </motion.div>
    </div>
  );
}
