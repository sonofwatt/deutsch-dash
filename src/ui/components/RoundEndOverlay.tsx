import { useGameStore, isHost } from '../../state/store';
import { BADGES } from '../../game/badges';

export function RoundEndOverlay() {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const next = useGameStore(s => s.next);
  const host = isHost({ uid, room });
  const scores = room.round?.scores;
  if (!scores) return null;
  const rows = Object.entries(room.players)
    .sort(([, a], [, b]) => b.score - a.score);
  const blitzer = room.round?.blitzedBy ? room.players[room.round.blitzedBy]?.name : null;

  return (
    <div className="overlay">
      <div className="sheet">
        <h2 style={{ margin: 0 }}>{blitzer ? `${blitzer} blitzed!` : 'Round over (all stuck)'}</h2>
        {rows.map(([id, p]) => {
          const s = scores[id];
          return (
            <div className="score-row" key={id}>
              <span className="chip" style={{ ['--badge' as string]: BADGES[p.badgeId].color }}>
                {BADGES[p.badgeId].glyph}
              </span>
              <span>{p.name}</span>
              <span>+{s?.centerCount ?? 0}</span>
              <span className="score-neg">-{2 * (s?.blitzLeft ?? 0)}</span>
              <span className="score-total">{p.score}</span>
            </div>
          );
        })}
        {host
          ? <button className="btn btn-primary" onClick={next}>Next round</button>
          : <p className="muted" style={{ textAlign: 'center' }}>Waiting for the host…</p>}
      </div>
    </div>
  );
}
