import { motion } from 'framer-motion';
import type { PlayerInfo } from '../../game/types';

/** What the splash throws at this particular viewer. */
export type SplashVariant = 'glitter' | 'poo' | 'crying';

/**
 * The blitzer gets glitter. Everyone else cries - except, at three or more
 * players, whoever is propping up the scoreboard, who gets something worse.
 *
 * "Worst score" is the running total on screen, not this round's delta: the
 * splash fires the moment blitz is announced, before the host has committed any
 * scores. Ties all get it. If the blitzer is the one holding the worst score
 * then nobody does - they just won the round, and glitter beats poo.
 */
export function splashVariant(
  players: Record<string, PlayerInfo>, blitzedBy: string, uid: string | null,
): SplashVariant {
  if (uid === blitzedBy) return 'glitter';
  const scores = Object.values(players).map(p => p.score);
  if (scores.length <= 2) return 'crying';
  const worst = Math.min(...scores);
  const me = uid ? players[uid] : undefined;
  return me && me.score === worst ? 'poo' : 'crying';
}

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
