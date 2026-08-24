import { useGameStore, isHost } from '../../state/store';
import { BADGES } from '../../game/badges';
import { winnerIds } from '../../game/scoring';

export function GameOverOverlay() {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const again = useGameStore(s => s.again);
  const host = isHost({ uid, room });
  const totals = Object.fromEntries(Object.entries(room.players).map(([id, p]) => [id, p.score]));
  // gameOver is only entered with a unique winner (ties play another round); the join below is defensive
  const winners = winnerIds(totals, room.meta.targetScore);
  const rows = Object.entries(room.players).sort(([, a], [, b]) => b.score - a.score);

  return (
    <div className="overlay">
      <div className="sheet">
        <h2 style={{ margin: 0 }}>
          🏆 {winners.map(w => room.players[w]?.name).join(' & ')} wins!
        </h2>
        {rows.map(([id, p]) => (
          <div className="score-row" key={id}>
            <span className="chip" style={{ ['--badge' as string]: BADGES[p.badgeId].color }}>
              {BADGES[p.badgeId].glyph}
            </span>
            <span>{p.name}</span><span /><span />
            <span className="score-total">{p.score}</span>
          </div>
        ))}
        {host
          ? <button className="btn btn-primary" onClick={again}>Rematch</button>
          : <p className="muted" style={{ textAlign: 'center' }}>Waiting for the host…</p>}
      </div>
    </div>
  );
}
