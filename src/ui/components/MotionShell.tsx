import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { honoursReducedMotion } from '../platform';

/**
 * The only place `MotionConfig` is set up, and deliberately NOT at the top of the
 * app any more.
 *
 * `App.tsx` used to wrap every route in it, which put framer-motion in the entry
 * chunk no matter how much of the app was code-split behind it: importing the
 * config is importing the library. So the shell lives here instead, and every
 * lazily loaded branch that animates anything renders its own. Two do, and they
 * are the only two: the board (`GameRoute`) and the scorepad (`KeeperRoute`).
 *
 * **A motion component rendered outside one of these gets framer's defaults**,
 * which ignore the reduced-motion preference. Anything new that animates belongs
 * inside a branch that has a shell, or needs one of its own.
 */
export function MotionShell({ children }: { children: ReactNode }) {
  // Phones let the OS decide; a desktop animates regardless. See
  // honoursReducedMotion for why the two are not treated alike.
  return (
    <MotionConfig reducedMotion={honoursReducedMotion() ? 'user' : 'never'}>
      {children}
    </MotionConfig>
  );
}
