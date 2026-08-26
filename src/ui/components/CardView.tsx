import { motion } from 'framer-motion';
import { BADGES, type BadgeId } from '../../game/badges';
import { faceGroup } from '../../game/rules';
import type { Card, FaceGroup } from '../../game/types';

/**
 * Boy/girl marker, drawn as an actual washroom-door sign: the figure knocked out
 * of a solid suit-coloured plate. Post building is gated on this pair (red/blue
 * are boys, green/yellow girls), so the two have to be told apart instantly at
 * card size - the first cut used matching outline figures whose only difference
 * was a slightly tapered torso, which was not enough. The silhouettes are now
 * deliberately exaggerated: the skirt flares to nearly the full plate width
 * against a torso barely half that, so the shapes differ in outline, not detail.
 */
export function FaceGlyph({ group }: { group: FaceGroup }) {
  return (
    <svg className="card-group" viewBox="0 0 20 28" aria-hidden="true"
      preserveAspectRatio="xMidYMid meet">
      <rect className="plate" x="0" y="0" width="20" height="28" rx="4.5" />
      <g className="figure">
        <circle cx="10" cy="6.6" r="3.2" />
        {group === 'boy' ? (
          <>
            <rect x="6.1" y="10.9" width="7.8" height="7.7" rx="1.3" />
            <rect x="6.8" y="16.6" width="2.7" height="7.8" rx="1" />
            <rect x="10.5" y="16.6" width="2.7" height="7.8" rx="1" />
          </>
        ) : (
          <>
            <path d="M10 10.5c2.3 0 3.5 1.2 4.1 3.2l2.4 7.4H3.5l2.4-7.4c.6-2 1.8-3.2 4.1-3.2z" />
            <rect x="7.3" y="20" width="2.3" height="4.4" rx=".9" />
            <rect x="10.4" y="20" width="2.3" height="4.4" rx=".9" />
          </>
        )}
      </g>
    </svg>
  );
}

export function CardView(props: {
  card: Card; badgeId: BadgeId; size?: 'md' | 'sm'; selected?: boolean; dimmed?: boolean;
  layoutId?: string; flipKey?: number;
}) {
  const { card, badgeId } = props;
  const b = BADGES[badgeId];
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
}

export function CardBack({ badgeId, size }: { badgeId: BadgeId; size?: 'md' | 'sm' }) {
  const b = BADGES[badgeId];
  return (
    <div className={`card card-back ${size ?? 'md'}`} style={{ ['--badge' as string]: b.color }}>
      <span className="card-badge-big">{b.glyph}</span>
    </div>
  );
}
