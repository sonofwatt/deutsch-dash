import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Remark } from '../commentary';

const DWELL_MS = 4200;

/**
 * The remarks, one at a time, rotating upward.
 *
 * Only one line is ever on screen: a wall of six jokes under the scores would
 * bury the numbers, which are the reason the sheet exists. The dots say there is
 * more without demanding anything.
 */
export function Commentary({ remarks }: { remarks: Remark[] }) {
  const [n, setN] = useState(0);
  // Guarded read: no DOM in the test environment, and an unguarded matchMedia
  // throws at import time there.
  const [still] = useState(() =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (remarks.length < 2) return;
    const t = setInterval(() => setN(x => x + 1), DWELL_MS);
    return () => clearInterval(t);
  }, [remarks.length]);

  if (remarks.length === 0) return null;
  const at = n % remarks.length;
  const rise = still ? 0 : 14;
  return (
    <div className="commentary" role="status" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={remarks[at].id} className="commentary-line"
          initial={{ y: rise, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          exit={{ y: -rise, opacity: 0 }} transition={{ duration: 0.3 }}>
          {remarks[at].text}
        </motion.p>
      </AnimatePresence>
      {remarks.length > 1 && (
        <div className="commentary-dots" aria-hidden="true">
          {remarks.map((r, i) => <span key={r.id} className={i === at ? 'on' : undefined} />)}
        </div>
      )}
    </div>
  );
}
