import { motion } from 'framer-motion';
import type { SplashVariant } from '../splashVariant';

const SPARKS = 14;
const FALLERS = 10;

/** Emoji radiating from the middle, each staying upright as it flies. */
function Glitter() {
  return (
    <div className="splash-fx" aria-hidden="true">
      {Array.from({ length: SPARKS }, (_, i) => (
        <span key={i} className="spark" style={{
          ['--a' as string]: `${(i * 360) / SPARKS}deg`,
          ['--d' as string]: `${[42, 30, 36][i % 3]}vmin`,
          ['--delay' as string]: `${(i % 5) * 70}ms`,
        }}>✨</span>
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
          left: `${4 + i * 9.6}%`,
          ['--delay' as string]: `${(i % 5) * 80}ms`,
          ['--dur' as string]: `${1150 + (i % 4) * 150}ms`,
          ['--spin' as string]: `${i % 2 ? 24 : -24}deg`,
        }}>{glyph}</span>
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
