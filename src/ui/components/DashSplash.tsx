import { motion } from 'framer-motion';
import { EMOJI } from '../../game/badges';
import type { Splash, SplashBase } from '../splashVariant';

/**
 * Two glyphs, not eight. Sunglasses and party: pleased with yourself. A
 * celebration reads as one thing when the eye can take it in at once, and eight
 * different faces at twenty-six copies read as a pile of stickers.
 *
 * 🔥 used to be a third one here, every single dash. That made it wallpaper: it
 * said "you dashed" beside two glyphs already saying that. It joins these only
 * on a run of two or more rounds now, where it says something the board does
 * not - see `splashVariant`.
 */
const CHEERS = ['😎', '🥳'];
/**
 * How many fall, whatever they are. Fixed rather than per-glyph, so the fire
 * arriving CHANGES THE MIX AND NOT THE AMOUNT: 26 either way, thirteen of each
 * without it and about nine of each with it. A count that grew with the glyph
 * list would make a streak literally heavier weather than an ordinary dash, and
 * the trophy would have done the same thing to a losing round.
 */
const FALLERS = 26;

/** What falls on somebody who did not dash. The trophy falls with it. */
const GLYPHS: Record<Exclude<SplashBase, 'glitter'>, string> = {
  poo: '💩', crying: '😢', relief: '🥹', toilet: '🚽',
};

/**
 * A column of emoji per lane, staggered so they do not fall in a rank. More than
 * one glyph - the three cheers, or bad news with a trophy falling beside it -
 * alternates down the lanes rather than pairing up, so the whole screen reads as
 * one kind of weather.
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

/**
 * EVERYBODY GETS RAIN, and only the glyphs differ. Asked for on 2026-09-09: the
 * dasher used to get fireworks and a burst of emoji radiating from the middle,
 * which made a round win look like the end of the game. The fireworks are the
 * GAME's celebration now and go off behind the final score sheet; a dash rains
 * 😎🥳 the way a bad round rains 💩, so the two are the same gesture carrying
 * different news.
 */
export function DashSplash({ name, splash }: { name: string; splash: Splash }) {
  const glyphs = splash.base === 'glitter' ? [...CHEERS] : [GLYPHS[splash.base]];
  // Two glyphs that ride along with whatever you got, and they are mutually
  // exclusive by construction rather than by a check here: splashVariant never
  // hands the dasher a trophy (they already dashed) and never hands anybody else
  // a fire (only the dasher can be on a run at the moment they dash).
  if (splash.fire) glyphs.push('🔥');
  if (splash.trophy) glyphs.push('🏆');
  return (
    <div className="dash-splash">
      <Rain glyphs={glyphs} />
      {/* Above the weather, not in it. The name is the one piece of information
          the splash carries and it was being rained on. */}
      <motion.div className="dash-say"
        initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
        <div className="dash-word">DASH!</div>
        <p className="dash-name">{name}</p>
      </motion.div>
    </div>
  );
}
