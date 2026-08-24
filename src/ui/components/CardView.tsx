import { BADGES, type BadgeId } from '../../game/badges';
import { faceGroup } from '../../game/rules';
import type { Card } from '../../game/types';

export function CardView(props: {
  card: Card; badgeId: BadgeId; size?: 'md' | 'sm'; selected?: boolean; dimmed?: boolean;
}) {
  const { card, badgeId } = props;
  const b = BADGES[badgeId];
  return (
    <div
      className={`card ${props.size ?? 'md'}${props.selected ? ' selected' : ''}${props.dimmed ? ' dimmed' : ''}`}
      style={{ ['--suit' as string]: `var(--suit-${card.suit})`, ['--badge' as string]: b.color }}
    >
      <span className="card-v">{card.v}</span>
      <span className="card-group">{faceGroup(card.suit) === 'boy' ? '◆' : '○'}</span>
      <span className="card-badge">{b.glyph}</span>
    </div>
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
