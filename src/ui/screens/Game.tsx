import { motion } from 'framer-motion';
import { useGameStore, legalTargets, gameStore } from '../../state/store';
import { hasLegalMove } from '../../game/rules';
import type { BadgeId } from '../../game/badges';
import { CardView } from '../components/CardView';
import { CenterGrid } from '../components/CenterGrid';
import { TableauView } from '../components/TableauView';
import { OpponentStrip } from '../components/OpponentStrip';
import { ConnectionPill } from '../components/ConnectionPill';
import { nearestSpace, useDrag, type DropTarget, type Point } from '../useDrag';
import { raceFlashes } from '../raceFlash';
import type { PlaySource } from '../../game/types';
import '../game.css';

// Feature flag, off after the first live playtest. The whole stuck path is intact
// underneath - markStuck, the all-stuck wood rotation and the three-fruitless-
// rotations round end all still work; only the button that lets a player claim it
// is hidden. Flip this back to true to bring the feature back.
export const ENABLE_STUCK_BUTTON: boolean = false;

export function Game() {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid)!;
  const tableau = useGameStore(s => s.tableau);
  const selection = useGameStore(s => s.selection);
  const select = useGameStore(s => s.select);
  const playTo = useGameStore(s => s.playTo);
  const flip = useGameStore(s => s.flip);
  const markStuck = useGameStore(s => s.markStuck);
  const lastRejected = useGameStore(s => s.lastRejected);
  const online = useGameStore(s => s.online);

  const round = room.round;
  const me = room.players[uid];
  const badgeOf = (owner: string): BadgeId => room.players[owner]?.badgeId ?? me.badgeId;

  const { drag, startDrag } = useDrag((source: PlaySource, target: DropTarget, at: Point) => {
    gameStore.setState({ selection: source }); // direct set - select() would TOGGLE an already-selected source off
    if ('nearest' in target) {
      // Dropped on the snap band rather than on a pile: send it to whichever
      // space it can legally land in that is closest to where they let go. For an
      // Ace that is just the nearest free space, which is the point of the band.
      const legal = round ? legalTargets(tableau!, source, round.spaces).spaces : [];
      const best = nearestSpace(legal, at.x, at.y);
      if (best == null) { gameStore.setState({ selection: null }); return; }
      void playTo({ space: best });
      return;
    }
    void playTo(target);                       // playTo consumes the selection
  });

  if (!round || !tableau) return <div className="screen"><p className="muted">dealing…</p></div>;

  const races = raceFlashes({ races: round.races, spaces: round.spaces, uid, lastRejected });
  const active = drag ? drag.source : selection;
  const targets = active ? legalTargets(tableau, active, round.spaces) : { spaces: [], posts: [] };
  const stuckAvailable = !hasLegalMove(tableau, round.spaces);

  return (
    <div className="game" style={{ opacity: online ? 1 : 0.6 }}>
      <div className="game-head">
        <strong>Round {room.meta.roundNumber}</strong>
        <span className="muted">{me.name} · {me.score} pts · to {room.meta.targetScore}</span>
        <ConnectionPill />
      </div>
      <OpponentStrip me={uid} players={room.players} tableaus={round.tableaus} />
      <CenterGrid spaces={round.spaces} highlight={targets.spaces} badgeOf={badgeOf}
        onTap={i => void playTo({ space: i })} races={races}
        snapping={targets.spaces.length > 0}
        onSnapTap={() => { if (targets.spaces.length) void playTo({ space: targets.spaces[0] }); }} />
      <div>
        <motion.div key={lastRejected?.at ?? 0}
          animate={lastRejected ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
          transition={{ duration: 0.35 }}>
          <TableauView t={tableau} badgeId={me.badgeId} selection={selection}
            postHighlight={targets.posts} onSelect={select} onFlip={flip}
            onTapPost={i => void playTo({ post: i })} startDrag={startDrag} />
        </motion.div>
        {ENABLE_STUCK_BUTTON
          ? <button className="btn stuck-btn" disabled={!stuckAvailable || me.stuckAt != null}
              onClick={markStuck} style={{ width: '100%', marginTop: 6 }}>
              {me.stuckAt != null ? 'Waiting for others…' : "I'm stuck"}
            </button>
          : me.stuckAt != null && (
              // Declared automatically (see syncStuck): say so, or the wait looks broken
              <p className="stuck-note">No moves left — waiting for the others…</p>
            )}
      </div>
      {drag && (
        <div className="drag-ghost"
          style={{ transform: `translate(${drag.x}px, ${drag.y}px) translate(-50%, -55%)` }}>
          <CardView card={drag.card} badgeId={me.badgeId} />
        </div>
      )}
    </div>
  );
}
