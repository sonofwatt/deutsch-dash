import { useEffect, useState } from 'react';
import { badgeFor, type BadgeId } from '../../game/badges';
import { CardView } from './CardView';
import type { WoodSide } from '../prefs';
import type { Card, PlayerInfo, Tableau } from '../../game/types';

/**
 * One face-up slot of an opponent's tableau. Everything shown here is public in
 * the physical game too - post tops, the turned-over wood card and the top of the
 * Dash pile all sit face up on the table.
 */
function Slot({ card, badgeId, count }: { card: Card; badgeId: BadgeId; count?: number }) {
  return (
    <div className="opp-slot">
      <CardView card={card} badgeId={badgeId} />
      {count != null && count > 0 && <span className="opp-count">{count}</span>}
    </div>
  );
}

const dashSlot = (card: Card | null, t: Tableau, p: PlayerInfo) =>
  card ? <Slot key="dash" card={card} badgeId={p.badgeId} count={t.dash.length} /> : null;
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
  /** The host's kick. Absent for everybody else, which is what hides the button. */
  onKick?: (uid: string, badgeId: BadgeId) => void;
}) {
  // Which opponent the kick is armed for. Two taps on a board being played at
  // speed, and it disarms itself, exactly like the sit-out button in the head:
  // removing somebody mid-game cannot be taken back from this side.
  const [arming, setArming] = useState<string | null>(null);
  useEffect(() => {
    if (!arming) return;
    const t = setTimeout(() => setArming(null), 4000);
    return () => clearTimeout(t);
  }, [arming]);
  const rows = Object.entries(props.players)
    .filter(([uid]) => uid !== props.me)
    .sort(([, a], [, b]) => a.joinedAt - b.joinedAt);
  return (
    <div className="opp-strip">
      {rows.map(([uid, p]) => {
        const b = badgeFor(p.badgeId);
        const t = props.tableaus[uid];
        const woodTop = t && t.woodIndex > 0 ? t.wood[t.woodIndex - 1] ?? null : null;
        const dashTop = t ? t.dash[t.dash.length - 1] ?? null : null;
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
              {/* The Dash count is NOT repeated here. It is on the pile it
                  counts, in the bubble at its corner (see Slot) - having it in
                  both places had players reading two numbers off one player and
                  looking for the difference between them. The bubble wins because
                  it is attached to the thing it describes; a bare number beside a
                  name says nothing about which pile it belongs to. */}
              {props.onKick && (
                arming === uid
                  ? <button className="opp-kick arming"
                      onClick={() => { setArming(null); props.onKick!(uid, p.badgeId); }}
                      aria-label={`Confirm removing ${p.name}`}>kick?</button>
                  : <button className="opp-kick" onClick={() => setArming(uid)}
                      aria-label={`Remove ${p.name}`} title={`Remove ${p.name}`}>&times;</button>
              )}
              {p.sittingOut
                ? <span className="opp-out" title="sitting out">out</span>
                : p.stuckAt != null && (
                    /* The same state your own board calls "No moves left", as a
                       word in the same tag as "out". It was an hourglass, which
                       reads as "the table is waiting on them" - the opposite of
                       stuck - and a playtest took a stuck bot for an away one. */
                    <span className="opp-stuck" title="No moves left">stuck</span>
                  )}
            </div>
            {/* Same left-to-right order as your own tableau, so a glance across
                the table reads the same way: Dash, posts, wood. */}
            {/* Only the slots holding something. An empty slot said "this player
                has no wood turned over" at the cost of a whole card of width in a
                strip that has to fit seven other players. */}
            {t && (
              <div className="opp-cards">
                {(props.woodSide === 'left'
                  ? [woodSlot(woodTop, p), ...postSlots(t, p), dashSlot(dashTop, t, p)]
                  : [dashSlot(dashTop, t, p), ...postSlots(t, p), woodSlot(woodTop, p)]
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
