import { BADGES, type BadgeId } from '../../game/badges';
import { CardView } from './CardView';
import type { Card, PlayerInfo, Tableau } from '../../game/types';

/**
 * One face-up slot of an opponent's tableau. Everything shown here is public in
 * the physical game too - post tops, the turned-over wood card and the top of the
 * Blitz pile all sit face up on the table.
 */
function Slot({ card, badgeId, count }: { card: Card; badgeId: BadgeId; count?: number }) {
  return (
    <div className="opp-slot">
      <CardView card={card} badgeId={badgeId} />
      {count != null && count > 0 && <span className="opp-count">{count}</span>}
    </div>
  );
}

export function OpponentStrip(props: {
  me: string; players: Record<string, PlayerInfo>; tableaus: Record<string, Tableau>;
}) {
  const rows = Object.entries(props.players)
    .filter(([uid]) => uid !== props.me)
    .sort(([, a], [, b]) => a.joinedAt - b.joinedAt);
  return (
    <div className="opp-strip">
      {rows.map(([uid, p]) => {
        const b = BADGES[p.badgeId];
        const t = props.tableaus[uid];
        const woodTop = t && t.woodIndex > 0 ? t.wood[t.woodIndex - 1] ?? null : null;
        const blitzTop = t ? t.blitz[t.blitz.length - 1] ?? null : null;
        return (
          <div key={uid} className={`opp${p.connected ? '' : ' away'}`}
            style={{ ['--badge' as string]: b.color }}>
            <div className="opp-head">
              <span>{b.glyph}</span>
              <span>{p.name}</span>
              {p.isBot && <span className="opp-ai">AI</span>}
              <span className="opp-blitz">{t ? t.blitz.length : '-'}</span>
              {p.stuckAt != null && <span title="stuck">⏳</span>}
            </div>
            {/* Same left-to-right order as your own tableau, so a glance across
                the table reads the same way: Blitz, posts, wood. */}
            {/* Only the slots holding something. An empty slot said "this player
                has no wood turned over" at the cost of a whole card of width in a
                strip that has to fit seven other players. */}
            {t && (
              <div className="opp-cards">
                {blitzTop && <Slot card={blitzTop} badgeId={p.badgeId} count={t.blitz.length} />}
                {t.post.map((s, i) => {
                  const top = s[s.length - 1];
                  return top ? <Slot key={i} card={top} badgeId={p.badgeId} /> : null;
                })}
                {woodTop && <Slot card={woodTop} badgeId={p.badgeId} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
