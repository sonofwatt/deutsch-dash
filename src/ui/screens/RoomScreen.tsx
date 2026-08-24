import { useEffect, useState } from 'react';
import { useGameStore } from '../../state/store';
import { Join } from './Join';
import { Lobby } from './Lobby';
import { Game } from './Game';
import { BlitzSplash } from '../components/BlitzSplash';
import { RoundEndOverlay } from '../components/RoundEndOverlay';
import { GameOverOverlay } from '../components/GameOverOverlay';

export function RoomScreen({ code }: { code: string }) {
  const joinPhase = useGameStore(s => s.joinPhase);
  const room = useGameStore(s => s.room);
  const phase = room?.meta.phase;
  const blitzedBy = room?.round?.blitzedBy ?? null;
  const [splashUntil, setSplashUntil] = useState(0);

  useEffect(() => {
    if (phase === 'roundEnd' && blitzedBy) setSplashUntil(Date.now() + 1600);
  }, [phase, blitzedBy]);
  const [, force] = useState(0);
  useEffect(() => {
    if (splashUntil > Date.now()) {
      const t = setTimeout(() => force(x => x + 1), splashUntil - Date.now());
      return () => clearTimeout(t);
    }
  }, [splashUntil]);

  if (joinPhase !== 'in-room' || !room) return <Join code={code} />;
  if (phase === 'lobby') return <Lobby code={code} />;

  const splashing = splashUntil > Date.now();
  const blitzerName = blitzedBy ? room.players[blitzedBy]?.name ?? '' : '';
  return (
    <>
      <Game />
      {splashing && blitzerName && <BlitzSplash name={blitzerName} />}
      {!splashing && phase === 'roundEnd' && <RoundEndOverlay />}
      {!splashing && phase === 'gameOver' && <GameOverOverlay />}
    </>
  );
}
