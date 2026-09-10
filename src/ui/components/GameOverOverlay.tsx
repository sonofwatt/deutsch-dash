import { useEffect, useState } from 'react';
import { useGameStore, isHost } from '../../state/store';
import { Fireworks } from './Fireworks';
import { winnerIds } from '../../game/scoring';
import { ScoreList } from './ScoreList';
import { Commentary } from './Commentary';
import { remarksForRoom } from '../commentary';

/** How long the Rematch button stays dead, in seconds. */
export const REMATCH_WAIT_S = 3;

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
  // The rematch button is dead for three seconds. It arrives under a celebration,
  // in the spot the ready button occupied a moment earlier on the round-end
  // sheet, and a host still tapping through the last round would deal a whole new
  // game before anybody had read who won. Counted down out loud rather than only
  // greyed: a button that does nothing and does not say why reads as broken.
  const [wait, setWait] = useState(REMATCH_WAIT_S);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  return (
    <div className="overlay">
      {/* The game's own celebration, behind the sheet that says who won. A dash
          rains emoji; winning is the thing that gets fireworks. They go off once,
          over the scrim and under the numbers, and are finished by the time
          anybody has read the sheet.

          ONLY THE WINNER GETS THEM. A dash rains emoji on everybody because a
          round is a thing that happened to the table; winning the game happened
          to one player, and eight seconds of fireworks fired at the people who
          just lost reads as gloating rather than as a celebration. */}
      {uid != null && winners.includes(uid) && <Fireworks />}
      <div className="sheet">
        <h2 style={{ margin: 0 }}>
          🏆 {winners.map(w => room.players[w]?.name).join(' & ')} wins!
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Final round · played to {room.meta.targetScore} points
        </p>
        {/* `dashedBy` matters as much here as on the round-end sheet, and was
            missing: the round that ends a game is still a round somebody dashed,
            and this is the only sheet anybody sees for it. */}
        <ScoreList players={room.players} scores={scores} dashedBy={room.round?.dashedBy}
          history={room.stats?.history} />
        <Commentary remarks={remarksForRoom(room, true)} />
        {actionError && <p className="error" style={{ margin: 0 }}>{actionError}</p>}
        {host
          ? <button className="btn btn-primary" onClick={again} disabled={wait > 0}>
              {wait > 0 ? `Rematch in ${wait}\u2026` : 'Rematch'}
            </button>
          : <p className="muted" style={{ textAlign: 'center' }}>Waiting for the host…</p>}
        {/* A finished game is the most likely place for somebody to want out,
            and until now it had no exit at all: the overlay covers the screen
            and only the host had a button on it. */}
        <a className="muted keep-back" href="#/">Home</a>
      </div>
    </div>
  );
}
