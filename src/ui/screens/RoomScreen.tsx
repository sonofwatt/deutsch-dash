import { useEffect, useState } from 'react';
import { useGameStore, gameStore } from '../../state/store';
import { Join } from './Join';
import { Lobby } from './Lobby';
import { Game } from './Game';
import { BlitzSplash } from '../components/BlitzSplash';
import { splashVariant, type Splash } from '../splashVariant';
import { RoundEndOverlay } from '../components/RoundEndOverlay';
import { GameOverOverlay } from '../components/GameOverOverlay';

/**
 * How long the blitz splash holds the screen. The particles have to finish inside
 * it - see ui.css, where the slowest faller runs 3.4s - and it was 1600ms, which
 * cut the celebration off before most of it had crossed the screen.
 */
const SPLASH_MS = 3600;

export function RoomScreen({ code }: { code: string }) {
  const joinPhase = useGameStore(s => s.joinPhase);
  const room = useGameStore(s => s.room);
  const phase = room?.meta.phase;
  const blitzedBy = room?.round?.blitzedBy ?? null;
  // Frozen at the blitz, deliberately. The host commits the round's totals within a
  // few hundred ms of the phase turning, so a variant recomputed on every render
  // can change glyph halfway through its own animation - tears turning to
  // something worse as the new totals land. The splash is a snapshot of the moment
  // it fired, and the sheet behind it carries the new numbers.
  const [splash, setSplash] = useState<{ until: number; variant: Splash } | null>(null);

  useEffect(() => {
    if (phase !== 'roundEnd' || !blitzedBy) return;
    // Sampled from the store rather than read from render scope on purpose: this
    // wants the totals as they stood AT THE BLITZ, and must not re-run when they
    // change a moment later. Taking them as deps would do exactly that.
    const at = gameStore.getState();
    if (at.room) setSplash({ until: Date.now() + SPLASH_MS,
      variant: splashVariant(at.room.players, blitzedBy, at.uid, at.room.round) });
  }, [phase, blitzedBy]);
  const [, force] = useState(0);
  useEffect(() => {
    const until = splash?.until ?? 0;
    if (until > Date.now()) {
      const t = setTimeout(() => force(x => x + 1), until - Date.now());
      return () => clearTimeout(t);
    }
  }, [splash]);

  if (joinPhase !== 'in-room' || !room) return <Join code={code} />;
  if (phase === 'lobby') return <Lobby code={code} />;

  const splashing = (splash?.until ?? 0) > Date.now();
  const blitzerName = blitzedBy ? room.players[blitzedBy]?.name ?? '' : '';
  return (
    <>
      <Game />
      {splashing && blitzerName && splash &&
        <BlitzSplash name={blitzerName} splash={splash.variant} />}
      {!splashing && phase === 'roundEnd' && <RoundEndOverlay />}
      {!splashing && phase === 'gameOver' && <GameOverOverlay />}
    </>
  );
}
