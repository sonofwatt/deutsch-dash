import { useGameStore } from '../../state/store';
import { Join } from './Join';
import { Lobby } from './Lobby';
import { Game } from './Game';

export function RoomScreen({ code }: { code: string }) {
  const joinPhase = useGameStore(s => s.joinPhase);
  const room = useGameStore(s => s.room);
  if (joinPhase !== 'in-room' || !room) return <Join code={code} />;
  if (room.meta.phase === 'lobby') return <Lobby code={code} />;
  return <Game />;
}
