import { AnimatePresence, motion } from 'framer-motion';
import { CardView } from './CardView';
import { cardId, type CenterSpace } from '../../game/types';
import type { BadgeId } from '../../game/badges';

export function CenterGrid(props: {
  spaces: CenterSpace[]; highlight: number[]; badgeOf: (owner: string) => BadgeId;
  onTap: (i: number) => void;
}) {
  return (
    <div className="game-grid">
      {props.spaces.map((s, i) => {
        const top = s.stack[s.stack.length - 1];
        return (
          <div key={i} data-drop={`space:${i}`} onClick={() => props.onTap(i)}
            className={`pile-space${props.highlight.includes(i) ? ' glow' : ''}`}>
            <AnimatePresence>
              {top && (
                <motion.div key={`${i}:${s.history.length}`}
                  exit={{ scale: 1.35, opacity: 0, transition: { duration: 0.35 } }}
                  style={{ position: 'absolute', inset: 0 }}>
                  <CardView key={cardId(top)} card={top} badgeId={props.badgeOf(top.owner)} layoutId={cardId(top)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
