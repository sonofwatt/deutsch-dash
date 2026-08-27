import { useGameStore, isHost } from '../../state/store';
import { ScoreList } from './ScoreList';
import { Commentary } from './Commentary';
import { remarksForRoom } from '../commentary';

export function RoundEndOverlay() {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const next = useGameStore(s => s.next);
  const host = isHost({ uid, room });
  const actionError = useGameStore(s => s.actionError);
  const scores = room.round?.scores;
  if (!scores) return null;
  const blitzer = room.round?.blitzedBy ? room.players[room.round.blitzedBy]?.name : null;

  return (
    <div className="overlay">
      <div className="sheet">
        <h2 style={{ margin: 0 }}>{blitzer ? `${blitzer} blitzed!` : 'Round over (all stuck)'}</h2>
        <ScoreList players={room.players} scores={scores} />
        <Commentary remarks={remarksForRoom(room)} />
        {actionError && <p className="error" style={{ margin: 0 }}>{actionError}</p>}
        {host
          ? <button className="btn btn-primary" onClick={next}>Next round</button>
          : <p className="muted" style={{ textAlign: 'center' }}>Waiting for the host…</p>}
        {/* "Waiting for the host…" is a dead end when the host has put their
            phone in a pocket and gone home. Quiet, because leaving mid-game is
            not the thing to reach for first - but it has to be reachable. */}
        <a className="muted keep-back" href="#/">Leave game</a>
      </div>
    </div>
  );
}
