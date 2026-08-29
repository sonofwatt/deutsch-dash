import { useGameStore, isHost, tableReady, readyTally } from '../../state/store';
import { ScoreList } from './ScoreList';
import { Commentary } from './Commentary';
import { remarksForRoom } from '../commentary';

export function RoundEndOverlay() {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const next = useGameStore(s => s.next);
  const setReady = useGameStore(s => s.setReady);
  const noteActivity = useGameStore(s => s.noteActivity);
  const host = isHost({ uid, room });
  const actionError = useGameStore(s => s.actionError);
  const scores = room.round?.scores;
  if (!scores) return null;
  const blitzer = room.round?.blitzedBy ? room.players[room.round.blitzedBy]?.name : null;

  const me = uid ? room.players[uid] : null;
  const iAmReady = me?.ready === true;
  const all = tableReady(room);
  const tally = readyTally(room);
  // The sheet is a gate now, the same as the lobby is: everyone says when they
  // have finished reading their score and the host takes the table on. Pressing
  // it is also a sign of life, which clears an `awayAt` left over from a round
  // somebody sat quietly through - without that they would ready up and still
  // block the count.
  const toggleReady = () => { noteActivity(); setReady(!iAmReady); };

  return (
    <div className="overlay">
      <div className="sheet">
        <h2 style={{ margin: 0 }}>{blitzer ? `${blitzer} blitzed!` : 'Round over (all stuck)'}</h2>
        <ScoreList players={room.players} scores={scores} blitzedBy={room.round?.blitzedBy} />
        <Commentary remarks={remarksForRoom(room)} />
        {actionError && <p className="error" style={{ margin: 0 }}>{actionError}</p>}
        {me && !me.sittingOut && (
          <button className={`btn ready-btn${iAmReady ? ' on' : ''}`} onClick={toggleReady}>
            {iAmReady ? 'Ready!' : 'Ready?'}
          </button>
        )}
        {host
          // Primary once the table is with them, and an override before that -
          // the same shape as the lobby, and for the same reason: a dead phone
          // must not be able to strand a table between rounds either.
          ? all
            ? <button className="btn btn-primary" onClick={next}>Next round</button>
            : <button className="btn start-anyway" onClick={next}>
                Next round anyway ({tally.ready}/{tally.total} ready)
              </button>
          : <p className="muted" style={{ textAlign: 'center' }}>
              {all ? 'Waiting for the host…' : `Waiting for the table… (${tally.ready}/${tally.total} ready)`}
            </p>}
        {/* "Waiting for the host…" is a dead end when the host has put their
            phone in a pocket and gone home. Quiet, because leaving mid-game is
            not the thing to reach for first - but it has to be reachable. */}
        <a className="muted keep-back" href="#/">Leave game</a>
      </div>
    </div>
  );
}
