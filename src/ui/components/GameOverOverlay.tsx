import { useGameStore, isHost } from '../../state/store';
import { winnerIds } from '../../game/scoring';
import { ScoreList } from './ScoreList';
import { Commentary } from './Commentary';
import { remarksForRoom } from '../commentary';

export function GameOverOverlay() {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const again = useGameStore(s => s.again);
  const host = isHost({ uid, room });
  const actionError = useGameStore(s => s.actionError);
  const totals = Object.fromEntries(Object.entries(room.players).map(([id, p]) => [id, p.score]));
  // gameOver is only entered with a unique winner (ties play another round); the join below is defensive
  const winners = winnerIds(totals, room.meta.targetScore);
  // The final round's breakdown, which the round-end overlay never gets to show
  // when the round that ends the game is the same snapshot that ends the round.
  const scores = room.round?.scores;

  return (
    <div className="overlay">
      <div className="sheet">
        <h2 style={{ margin: 0 }}>
          🏆 {winners.map(w => room.players[w]?.name).join(' & ')} wins!
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Final round · played to {room.meta.targetScore} points
        </p>
        <ScoreList players={room.players} scores={scores} />
        <Commentary remarks={remarksForRoom(room, true)} />
        {actionError && <p className="error" style={{ margin: 0 }}>{actionError}</p>}
        {host
          ? <button className="btn btn-primary" onClick={again}>Rematch</button>
          : <p className="muted" style={{ textAlign: 'center' }}>Waiting for the host…</p>}
        {/* A finished game is the most likely place for somebody to want out,
            and until now it had no exit at all: the overlay covers the screen
            and only the host had a button on it. */}
        <a className="muted keep-back" href="#/">Home</a>
      </div>
    </div>
  );
}
