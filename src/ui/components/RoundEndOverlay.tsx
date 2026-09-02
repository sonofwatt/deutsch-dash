import { useGameStore, isHost, tableReady, readyTally } from '../../state/store';
import { ScoreList } from './ScoreList';
import { Commentary } from './Commentary';
import { remarksForRoom } from '../commentary';

export function RoundEndOverlay() {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const next = useGameStore(s => s.next);
  const startAnyway = useGameStore(s => s.startAnyway);
  const cancelCountdown = useGameStore(s => s.cancelCountdown);
  const countdown = room.meta.countdown ?? null;
  const setReady = useGameStore(s => s.setReady);
  const noteActivity = useGameStore(s => s.noteActivity);
  const host = isHost({ uid, room });
  const actionError = useGameStore(s => s.actionError);
  const scores = room.round?.scores;
  if (!scores) return null;
  const dasher = room.round?.dashedBy ? room.players[room.round.dashedBy]?.name : null;

  const me = uid ? room.players[uid] : null;
  const iAmReady = me?.ready === true;
  const all = tableReady(room);
  // Ready, or sitting this one out: either is an answer, and the override needs
  // one before it can be sure the deal it forces has somebody in it.
  const answered = iAmReady || me?.sittingOut === true;
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
        <h2 style={{ margin: 0 }}>{dasher ? `${dasher} dashed!` : 'Round over (all stuck)'}</h2>
        <ScoreList players={room.players} scores={scores} dashedBy={room.round?.dashedBy} showReady />
        <Commentary remarks={remarksForRoom(room)} />
        {actionError && <p className="error" style={{ margin: 0 }}>{actionError}</p>}
        {me && !me.sittingOut && (
          <button className={`btn ready-btn${iAmReady ? ' on' : ''}`} onClick={toggleReady}>
            {iAmReady ? 'Ready!' : 'Ready?'}
          </button>
        )}
        {/* Once the table is ready the countdown has it, exactly as in the lobby -
            so there is no button to press, only one to call it off. */}
        {host && all && countdown == null
          ? <p className="muted" style={{ textAlign: 'center' }}>Dealing in a moment…</p>
          : host
          // Primary once the table is with them, and an override before that -
          // the same shape as the lobby, and for the same reason: a dead phone
          // must not be able to strand a table between rounds either.
          //
          // The override waits for the host to have answered for THEMSELVES,
          // ready or sitting out, exactly as the lobby's does. Without that a
          // host who taps it before readying deals a round to nobody at all:
          // startRound gives a hand only to players who are ready, and between
          // rounds that flag starts cleared.
          ? all
            ? <button className="btn btn-primary" onClick={next}>Next round</button>
            : answered
              ? <button className="btn start-anyway" onClick={startAnyway}>
                  Next round anyway ({tally.ready}/{tally.total} ready)
                </button>
              : <p className="muted" style={{ textAlign: 'center' }}>
                  Say you are ready, then you can start without the others.
                </p>
          : <p className="muted" style={{ textAlign: 'center' }}>
              {all ? 'Waiting for the host…' : `Waiting for the table… (${tally.ready}/${tally.total} ready)`}
            </p>}
        {/* "Waiting for the host…" is a dead end when the host has put their
            phone in a pocket and gone home. Quiet, because leaving mid-game is
            not the thing to reach for first - but it has to be reachable. */}
        <a className="muted keep-back" href="#/">Leave game</a>
      </div>
      {/* The same three seconds the lobby counts, over the sheet the scores are
          on, so nobody is dealt a hand they have not looked up for. */}
      {countdown != null && (
        <div className="overlay countdown-overlay">
          <div className="countdown-num" key={countdown}>{countdown === 0 ? 'GO!' : countdown}</div>
          {host && countdown > 0 && (
            <button className="btn countdown-cancel" onClick={cancelCountdown}>
              Cancel - back to the scores
            </button>
          )}
        </div>
      )}
    </div>
  );
}
