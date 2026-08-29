import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Remark } from '../commentary';

/**
 * Long enough to read a line of fifteen words and still feel the next one
 * arriving. It was 4200ms, which read as a slideshow being rushed past you.
 */
const DWELL_MS = 7000;

/**
 * The remarks, one at a time, rotating upward.
 *
 * Only one line is ever on screen: a wall of six jokes under the scores would
 * bury the numbers, which are the reason the sheet exists. The dots say there is
 * more without demanding anything, and the arrows are for the line somebody only
 * half read before it left.
 */
export function Commentary({ remarks }: { remarks: Remark[] }) {
  const [n, setN] = useState(0);
  // Bumped by a manual step, and a dependency of the timer below, so stepping
  // restarts the dwell rather than leaving the next auto-advance to arrive a
  // moment later and snatch the line away from somebody who just asked for it.
  const [stepped, setStepped] = useState(0);
  // Guarded read: no DOM in the test environment, and an unguarded matchMedia
  // throws at import time there.
  const [still] = useState(() =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (remarks.length < 2) return;
    const t = setInterval(() => setN(x => x + 1), DWELL_MS);
    return () => clearInterval(t);
  }, [remarks.length, stepped]);

  if (remarks.length === 0) return null;
  const many = remarks.length > 1;
  // Modulo of a negative is negative in JS, so stepping back off the front has to
  // be brought round by hand or the first back-tap lands on nothing.
  const at = ((n % remarks.length) + remarks.length) % remarks.length;
  const rise = still ? 0 : 14;
  const step = (by: number) => { setN(x => x + by); setStepped(x => x + 1); };
  return (
    <div className="commentary" role="status" aria-live="polite">
      <div className="commentary-row">
        {many
          ? <button className="commentary-step" onClick={() => step(-1)}
              aria-label="Previous remark">‹</button>
          : <span />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={remarks[at].id} className="commentary-line"
            initial={{ y: rise, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            exit={{ y: -rise, opacity: 0 }} transition={{ duration: 0.3 }}>
            {remarks[at].text}
          </motion.p>
        </AnimatePresence>
        {many
          ? <button className="commentary-step" onClick={() => step(1)}
              aria-label="Next remark">›</button>
          : <span />}
      </div>
      {many && (
        <div className="commentary-dots" aria-hidden="true">
          {remarks.map((r, i) => <span key={r.id} className={i === at ? 'on' : undefined} />)}
        </div>
      )}
    </div>
  );
}
