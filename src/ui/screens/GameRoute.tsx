import { useEffect, useState } from 'react';
import { useGameStore, gameStore } from '../../state/store';
import { Game } from './Game';
import { DashSplash } from '../components/DashSplash';
import { splashVariant, type Splash } from '../splashVariant';
import { RoundEndOverlay } from '../components/RoundEndOverlay';
import { GameOverOverlay } from '../components/GameOverOverlay';
import { MotionShell } from '../components/MotionShell';

/**
 * The board and everything layered over it, behind one dynamic import.
 *
 * This is where framer-motion enters the app for a player: the board, the splash,
 * and the two sheets all animate, and nothing before this point does. `Join` and
 * `Lobby` reach the library through nothing at all, which is what makes the split
 * worth having - somebody opening an invite link gets to the join screen without
 * downloading 43 kB of animation they cannot see yet, and it arrives while they
 * are typing a name.
 *
 * It lives in its own file, default-exported, because `React.lazy` needs a module
 * whose default is the component, and because the `MotionShell` has to be inside
 * the boundary rather than outside it.
 */
const SPLASH_MS = 3600; // the slowest faller in ui.css runs 3.4s; the splash has to outlast it

export default function GameRoute() {
  // Non-null by construction: `RoomScreen` only renders this once the room has
  // landed and its phase has left the lobby.
  const room = useGameStore(s => s.room)!;
  const phase = room.meta.phase;
  const dashedBy = room.round?.dashedBy ?? null;
  // Frozen at the dash, deliberately. The host commits the round's totals within a
  // few hundred ms of the phase turning, so a variant recomputed on every render
  // can change glyph halfway through its own animation - tears turning to
  // something worse as the new totals land. The splash is a snapshot of the moment
  // it fired, and the sheet behind it carries the new numbers.
  const [splash, setSplash] = useState<{ until: number; variant: Splash } | null>(null);

  useEffect(() => {
    if (phase !== 'roundEnd' || !dashedBy) return;
    // Sampled from the store rather than read from render scope on purpose: this
    // wants the totals as they stood AT THE DASH, and must not re-run when they
    // change a moment later. Taking them as deps would do exactly that.
    const at = gameStore.getState();
    if (at.room) setSplash({ until: Date.now() + SPLASH_MS,
      variant: splashVariant(at.room.players, dashedBy, at.uid, at.room.round) });
  }, [phase, dashedBy]);
  const [, force] = useState(0);
  useEffect(() => {
    const until = splash?.until ?? 0;
    if (until > Date.now()) {
      const t = setTimeout(() => force(x => x + 1), until - Date.now());
      return () => clearTimeout(t);
    }
  }, [splash]);

  const splashing = (splash?.until ?? 0) > Date.now();
  const dasherName = dashedBy ? room.players[dashedBy]?.name ?? '' : '';
  return (
    <MotionShell>
      <Game />
      {splashing && dasherName && splash &&
        <DashSplash name={dasherName} splash={splash.variant} />}
      {!splashing && phase === 'roundEnd' && <RoundEndOverlay />}
      {!splashing && phase === 'gameOver' && <GameOverOverlay />}
    </MotionShell>
  );
}
