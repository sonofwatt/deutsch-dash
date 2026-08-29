import { motion } from 'framer-motion';
import { EMOJI } from '../../game/badges';
import type { SplashVariant } from '../splashVariant';

const SPARKS = 22;
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
          ['--a' as string]: `${(i * 360) / SPARKS}deg`,
          ['--d' as string]: `${[42, 30, 36][i % 3]}vmin`,
          ['--delay' as string]: `${(i % 7) * 90}ms`,
        }}>{'✨' + EMOJI}</span>
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
        <p style={{ textAlign: 'center', fontWeight: 600 }}>{name}</p>
      </motion.div>
    </div>
  );
}
