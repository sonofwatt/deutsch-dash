import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore, legalTargets, gameStore } from '../../state/store';
import { hasLegalMove } from '../../game/rules';
import { HINT_DELAY_MS, HINT_SHOW_MS, hintSpace } from '../../game/hint';
import type { BadgeId } from '../../game/badges';
import { CardView } from '../components/CardView';
import { CenterGrid } from '../components/CenterGrid';
import { TableauView } from '../components/TableauView';
import { OpponentStrip } from '../components/OpponentStrip';
import { ConnectionPill } from '../components/ConnectionPill';
import { nearestSpace, useDrag, type DropTarget, type Point } from '../useDrag';
import { raceFlashes } from '../raceFlash';
import { useWoodSide } from '../prefs';
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
  const noteActivity = useGameStore(s => s.noteActivity);
  const [woodSide, swapSides] = useWoodSide();

  // The helper hint waits for the player to go quiet, so it never fires under
  // somebody playing at speed. `activity` counts MY input only - deliberately not
  // board changes, or a fast table would keep resetting the clock of the one
  // player who has actually stalled. Comparing the two counters (rather than
  // setting a flag from inside the effect) is what keeps the timer out of render.
  // It shows once per quiet spell and then goes: two pulses and away, rather than
  // a mark breathing on the board until it stops being read. Another one costs a
  // tap and another five seconds of stillness.
  const hintsOn = room.meta.hintsOn ?? false;
  const [activity, setActivity] = useState(0);
  const [shownFor, setShownFor] = useState(-1);
  const [doneFor, setDoneFor] = useState(-1);
  useEffect(() => {
    if (!hintsOn) return;
    const show = setTimeout(() => setShownFor(activity), HINT_DELAY_MS);
    const hide = setTimeout(() => setDoneFor(activity), HINT_DELAY_MS + HINT_SHOW_MS);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [hintsOn, activity]);

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

  // The store drops our hand the moment the phase leaves 'playing' (store.ts, the
  // clear that makes the next round adopt a fresh one). The round is still on
  // screen underneath the blitz splash and the score sheet though, so fall back
  // to the hand RTDB last recorded: the board the round ended on, rather than the
  // word "dealing…" flashing up behind the moment someone won. Nothing can be
  // played from it - playTo refuses outside 'playing'.
  const hand = tableau ?? round?.tableaus[uid] ?? null;
  if (!round || !hand) return <div className="screen"><p className="muted">dealing…</p></div>;

  const races = raceFlashes({ races: round.races, spaces: round.spaces, uid, lastRejected });
  const active = drag ? drag.source : selection;
  const targets = active ? legalTargets(hand, active, round.spaces) : { spaces: [], posts: [] };
  const stuckAvailable = !hasLegalMove(hand, round.spaces);
  // Recomputed every render rather than stored, so it can never point at a space
  // somebody else has since filled.
  const showingHint = hintsOn && shownFor === activity && doneFor !== activity;
  const hint = showingHint ? hintSpace(hand, round.spaces) : null;

  return (
    // Every tap and every drag on this screen is a sign of life, which is a wider
    // net than "made a legal move" on purpose: a player weighing up the board is
    // present, and marking them away would be wrong even though it is harmless.
    <div className="game" style={{ opacity: online ? 1 : 0.6 }}
      onPointerDown={() => { noteActivity(); setActivity(n => n + 1); }}>
      <div className="game-head">
        <strong>Round {room.meta.roundNumber}</strong>
        <span className="muted">{me.name} · {me.score} pts · to {room.meta.targetScore}</span>
        {/* Which thumb the wood pile sits under, changeable mid-game on purpose:
            a player who was auto-rejoined never sees a form again. */}
        <button className="side-swap" onClick={swapSides}
          aria-label={`Move the wood pile to the ${woodSide === 'right' ? 'left' : 'right'}`}
          title="Swap Blitz and wood">⇄</button>
        <ConnectionPill />
      </div>
      <OpponentStrip me={uid} players={room.players} tableaus={round.tableaus} woodSide={woodSide} />
      <CenterGrid spaces={round.spaces} highlight={targets.spaces} badgeOf={badgeOf}
        onTap={i => void playTo({ space: i })} races={races}
        snapping={targets.spaces.length > 0} stuck={me.stuckAt != null} hint={hint}
        onSnapTap={() => { if (targets.spaces.length) void playTo({ space: targets.spaces[0] }); }} />
      <div>
        <motion.div key={lastRejected?.at ?? 0}
          animate={lastRejected ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
          transition={{ duration: 0.35 }}>
          <TableauView t={hand} badgeId={me.badgeId} selection={selection} woodSide={woodSide}
            postHighlight={targets.posts} onSelect={select} onFlip={flip}
            onTapPost={i => void playTo({ post: i })} startDrag={startDrag} />
        </motion.div>
        {/* The automatic "no moves left" note is in the drop band now (CenterGrid),
            where it costs no layout. This slot carries the away note instead. */}
        {me.awayAt != null
          ? <button className="away-note" onClick={noteActivity}>Away — tap to rejoin the round</button>
          : ENABLE_STUCK_BUTTON && (
              <button className="btn stuck-btn" disabled={!stuckAvailable || me.stuckAt != null}
                onClick={markStuck} style={{ width: '100%', marginTop: 6 }}>
                {me.stuckAt != null ? 'Waiting for others…' : "I'm stuck"}
              </button>
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
