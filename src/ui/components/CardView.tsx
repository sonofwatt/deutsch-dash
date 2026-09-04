import { memo } from 'react';
import { motion } from 'framer-motion';
import { badgeFor, type BadgeId } from '../../game/badges';
import { faceGroup } from '../../game/rules';
import { cardId, type Card, type FaceGroup } from '../../game/types';

/**
 * Boy/girl marker, drawn as an actual washroom-door sign: a white figure knocked
 * out of a solid plate. Post building is gated on this pair (red/blue are boys,
 * green/yellow girls), so the two have to be told apart instantly at card size -
 * the first cut used matching outline figures whose only difference was a
 * slightly tapered torso, which was not enough, and the silhouettes are now
 * deliberately exaggerated: the skirt flares to nearly the full plate width
 * against a torso barely half that, so the shapes differ in outline, not detail.
 *
 * **The plate is coloured by GENDER, not by suit.** It used to take the suit
 * colour, which said nothing the big number underneath was not already saying far
 * more loudly - so the one glyph whose job is to answer "boy or girl" was
 * answering it in shape alone, at about 15px. An in-between version outlined the
 * plate in the suit and coloured the figure instead, to carry both facts; at card
 * size the outline is a hairline and the figure a few pixels, so both halves did
 * less than the one solid block. The number still carries the suit.
 */
export function FaceGlyph({ group }: { group: FaceGroup }) {
  return (
    <svg className={`card-group sign-${group}`} viewBox="0 0 20 28" aria-hidden="true"
      preserveAspectRatio="xMidYMid meet">
      <rect className="plate" x="0" y="0" width="20" height="28" rx="4.5" />
      <g className="figure">
        <circle cx="10" cy="5.7" r="3.6" />
        {group === 'boy' ? (
          <>
            <rect x="5.2" y="10" width="9.6" height="8.4" rx="1.5" />
            <rect x="5.9" y="17.2" width="3.2" height="8.8" rx="1.1" />
            <rect x="10.9" y="17.2" width="3.2" height="8.8" rx="1.1" />
          </>
        ) : (
          <>
            <path d="M10 9.5c2.6 0 4 1.4 4.7 3.7l2.9 8.5H2.4l2.9-8.5C6 10.9 7.4 9.5 10 9.5z" />
            <rect x="6.8" y="20.6" width="2.7" height="5.4" rx="1" />
            <rect x="10.5" y="20.6" width="2.7" height="5.4" rx="1" />
          </>
        )}
      </g>
    </svg>
  );
}

interface CardViewProps {
  card: Card; badgeId: BadgeId; size?: 'md' | 'sm'; selected?: boolean; dimmed?: boolean;
  layoutId?: string; flipKey?: number;
}

/**
 * The props that decide what a card looks like, compared by VALUE. Every room
 * snapshot rebuilds every card object (normalizeRoom), so an identity compare
 * would never match and the memo below would buy nothing.
 */
function sameCardProps(a: CardViewProps, b: CardViewProps): boolean {
  return cardId(a.card) === cardId(b.card) && a.badgeId === b.badgeId && a.size === b.size
    && !!a.selected === !!b.selected && !!a.dimmed === !!b.dimmed
    && a.layoutId === b.layoutId && a.flipKey === b.flipKey;
}

/**
 * Memoised, and this is the single biggest saving on the board. Every write by
 * any player raises a snapshot on every client, and the game screen re-renders
 * on each one; without the memo all 75 cards of an eight-player board went
 * through framer-motion's per-node update (prop diff, animation check, and for
 * the layoutId cards two forced layout measurements) although nothing about them
 * had changed. Measured at roughly half of the render cost of a snapshot.
 *
 * One thing it gives up: a memoised card that did not re-render is not measured,
 * so when only the GRID changes shape (a rotation, a column-count change) the
 * cards jump to their new slots rather than sliding. A card moving between piles
 * still animates: it is a different element with the same layoutId, and framer
 * snapshots the leaving one on unmount.
 */
export const CardView = memo(function CardView(props: CardViewProps) {
  const { card, badgeId } = props;
  const b = badgeFor(badgeId);
  return (
    <motion.div
      layoutId={props.layoutId}
      key={props.flipKey}
      initial={props.flipKey != null ? { rotateY: 90, opacity: 0.5 } : false}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={`card ${props.size ?? 'md'}${props.selected ? ' selected' : ''}${props.dimmed ? ' dimmed' : ''}`}
      style={{ ['--suit' as string]: `var(--suit-${card.suit})`, ['--badge' as string]: b.color }}
    >
      <span className="card-v">{card.v}</span>
      <FaceGlyph group={faceGroup(card.suit)} />
      <span className="card-badge">{b.glyph}</span>
    </motion.div>
  );
}, sameCardProps);

export function CardBack({ badgeId, size }: { badgeId: BadgeId; size?: 'md' | 'sm' }) {
  const b = badgeFor(badgeId);
  return (
    <div className={`card card-back ${size ?? 'md'}`} style={{ ['--badge' as string]: b.color }}>
      <span className="card-badge-big">{b.glyph}</span>
    </div>
  );
}
