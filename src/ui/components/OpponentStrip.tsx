import { BADGES, type BadgeId } from '../../game/badges';
import { CardView } from './CardView';
import type { WoodSide } from '../prefs';
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

const blitzSlot = (card: Card | null, t: Tableau, p: PlayerInfo) =>
  card ? <Slot key="blitz" card={card} badgeId={p.badgeId} count={t.blitz.length} /> : null;
const woodSlot = (card: Card | null, p: PlayerInfo) =>
  card ? <Slot key="wood" card={card} badgeId={p.badgeId} /> : null;
const postSlots = (t: Tableau, p: PlayerInfo) => t.post.map((stack, i) => {
  const top = stack[stack.length - 1];
  return top ? <Slot key={i} card={top} badgeId={p.badgeId} /> : null;
});

export function OpponentStrip(props: {
  me: string; players: Record<string, PlayerInfo>; tableaus: Record<string, Tableau>;
  /** Optional: mirrors your own tableau, so a glance across reads the same way. */
  woodSide?: WoodSide;
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
        // Dimmed for either kind of absence - a dropped socket and a phone lying
        // face-up on the table both mean "do not wait for them", and at this size
        // two shades of grey would be indistinguishable anyway. The class is
        // `absent` rather than `away` precisely because it is now the pair of
        // them, not just the disconnect it started as.
        return (
          <div key={uid} className={`opp${p.connected && p.awayAt == null ? '' : ' absent'}`}
            style={{ ['--badge' as string]: b.color }}>
            <div className="opp-head">
              <span>{b.glyph}</span>
              <span>{p.name}</span>
              {p.isBot && <span className="opp-ai">AI</span>}
              {/* The Blitz count is NOT repeated here. It is on the pile it
                  counts, in the bubble at its corner (see Slot) - having it in
                  both places had players reading two numbers off one player and
                  looking for the difference between them. The bubble wins because
                  it is attached to the thing it describes; a bare number beside a
                  name says nothing about which pile it belongs to. */}
              {p.stuckAt != null && <span title="stuck">⏳</span>}
            </div>
            {/* Same left-to-right order as your own tableau, so a glance across
                the table reads the same way: Blitz, posts, wood. */}
            {/* Only the slots holding something. An empty slot said "this player
                has no wood turned over" at the cost of a whole card of width in a
                strip that has to fit seven other players. */}
            {t && (
              <div className="opp-cards">
                {(props.woodSide === 'left'
                  ? [woodSlot(woodTop, p), ...postSlots(t, p), blitzSlot(blitzTop, t, p)]
                  : [blitzSlot(blitzTop, t, p), ...postSlots(t, p), woodSlot(woodTop, p)]
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
