import { motion } from 'framer-motion';
import { BADGES, type BadgeId } from '../../game/badges';
import { faceGroup } from '../../game/rules';
import type { Card, FaceGroup } from '../../game/types';

/**
 * Boy/girl marker, drawn as the North-American washroom pictograms. Post building
 * is gated on this pair (red/blue are boys, green/yellow girls), so it has to be
 * readable at a glance at card size - the old ◆/○ dingbats were not.
 * Painted in currentColor, which .card-group sets to the card's suit colour.
 */
export function FaceGlyph({ group }: { group: FaceGroup }) {
  return (
    <svg className="card-group" viewBox="4.6 0 14.8 24" fill="currentColor" aria-hidden="true"
      preserveAspectRatio="xMidYMid meet">
      <circle cx="12" cy="3.9" r="3.5" />
      {group === 'boy' ? (
        <>
          <rect x="6.4" y="8.4" width="11.2" height="9" rx="1.6" />
          <rect x="7.9" y="14.8" width="3.4" height="8.6" rx="1.1" />
          <rect x="12.7" y="14.8" width="3.4" height="8.6" rx="1.1" />
        </>
      ) : (
        <>
          <path d="M12 8.2c2.7 0 4.3 1.5 4.9 3.6l1.7 6H5.4l1.7-6C7.7 9.7 9.3 8.2 12 8.2z" />
          <rect x="8.3" y="17" width="3" height="6.4" rx="1" />
          <rect x="12.7" y="17" width="3" height="6.4" rx="1" />
        </>
      )}
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
