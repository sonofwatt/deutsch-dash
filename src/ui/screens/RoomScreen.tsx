import { lazy, Suspense } from 'react';
import { useGameStore } from '../../state/store';
import { Join, Rejoining } from './Join';
import { roomView } from './roomView';
import { Lobby } from './Lobby';

/**
 * The board, loaded when a player actually reaches one.
 *
 * Everything above this line renders without framer-motion: `Join` and `Lobby`
 * reach it through nothing, which is the whole reason the boundary sits HERE and
 * not around `RoomScreen` itself. An invite link mounts `RoomScreen` immediately,
 * so splitting at the route above would have deferred the library only until the
 * exact moment it was already needed, and bought nothing on the one path this is
 * meant to help.
 */
const GameRoute = lazy(() => import('./GameRoute'));

export function RoomScreen({ code }: { code: string }) {
  const joinPhase = useGameStore(s => s.joinPhase);
  const room = useGameStore(s => s.room);

  const view = roomView(joinPhase, room != null);
  if (view === 'form') return <Join code={code} />;
  // `room` is non-null whenever the view is 'room', by construction. The second
  // half of this condition is what tells the COMPILER that, since the decision
  // now goes through a function, and it falls the safe way if it ever stops
  // being true.
  if (view === 'rejoining' || !room) return <Rejoining code={code} />;
  if (room.meta.phase === 'lobby') return <Lobby code={code} />;

  // Seen only by a player whose first sight of a board is also their first sight
  // of this chunk: a reload straight into a running round on a cold cache. Every
  // other route here arrives with it already fetched, from the lobby they waited
  // in or from a previous round.
  return (
    <Suspense fallback={<div className="screen stack"><p className="muted">Dealing…</p></div>}>
      <GameRoute />
    </Suspense>
  );
}
