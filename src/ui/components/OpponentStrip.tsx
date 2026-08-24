import { BADGES } from '../../game/badges';
import type { PlayerInfo, Tableau } from '../../game/types';

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
        return (
          <div key={uid} className={`opp${p.connected ? '' : ' away'}`}
            style={{ ['--badge' as string]: b.color }}>
            <span>{b.glyph}</span>
            <span>{p.name}</span>
            <span className="opp-blitz">{t ? t.blitz.length : '-'}</span>
            {p.stuckAt != null && <span title="stuck">⏳</span>}
          </div>
        );
      })}
    </div>
  );
}
