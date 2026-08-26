import { useGameStore, isHost } from '../../state/store';
import { ScoreRow } from './ScoreRow';

export function RoundEndOverlay() {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const next = useGameStore(s => s.next);
  const host = isHost({ uid, room });
  const actionError = useGameStore(s => s.actionError);
  const scores = room.round?.scores;
  if (!scores) return null;
  const rows = Object.entries(room.players)
    .sort(([, a], [, b]) => b.score - a.score);
  const blitzer = room.round?.blitzedBy ? room.players[room.round.blitzedBy]?.name : null;

  return (
    <div className="overlay">
      <div className="sheet">
        <h2 style={{ margin: 0 }}>{blitzer ? `${blitzer} blitzed!` : 'Round over (all stuck)'}</h2>
        {rows.map(([id, p]) => <ScoreRow key={id} player={p} score={scores[id]} />)}
        {actionError && <p className="error" style={{ margin: 0 }}>{actionError}</p>}
        {host
          ? <button className="btn btn-primary" onClick={next}>Next round</button>
          : <p className="muted" style={{ textAlign: 'center' }}>Waiting for the host…</p>}
      </div>
    </div>
  );
}
