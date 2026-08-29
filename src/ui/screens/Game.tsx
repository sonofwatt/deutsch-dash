import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore, legalTargets, gameStore, isHost } from '../../state/store';
import { allConnectedStuck } from '../../net/plays';
import { hasLegalMove } from '../../game/rules';
import { HINT_DELAY_MS, HINT_REPEAT_MS, HINT_SHOW_MS, hintSpace } from '../../game/hint';
import { EMOJI, type BadgeId } from '../../game/badges';
import { DragGhost } from '../components/DragGhost';
import { CenterGrid } from '../components/CenterGrid';
import { TableauView } from '../components/TableauView';
import { OpponentStrip } from '../components/OpponentStrip';
import { ConnectionPill } from '../components/ConnectionPill';
import { ThemeToggle } from '../components/ThemeToggle';
import { aimedAt, nearestSpace, spaceCentres, useDrag, type DropTarget, type Point } from '../useDrag';
import { raceFlashes } from '../raceFlash';
import { useOpenings } from '../openings';
import { useWoodSide } from '../prefs';
import type { CenterSpace, PlaySource } from '../../game/types';
import '../game.css';

// Module-level so its identity is stable. useOpenings compares `spaces` by
// reference to decide whether the board moved, and a fresh [] every render would
// look like a change every render - which, since it sets state, would spin.
const NO_SPACES: CenterSpace[] = [];

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
  const actionError = useGameStore(s => s.actionError);
  const noteActivity = useGameStore(s => s.noteActivity);
  const setSittingOut = useGameStore(s => s.setSittingOut);
  const setSingleFlip = useGameStore(s => s.setSingleFlip);
  const [woodSide, swapSides] = useWoodSide();

  // The helper hint waits for the player to go quiet, so it never fires under
  // somebody playing at speed. `activity` counts MY input only - deliberately not
  // board changes, or a fast table would keep resetting the clock of the one
  // player who has actually stalled. Comparing the two counters (rather than
  // setting a flag from inside the effect) is what keeps the timer out of render.
  // Two pulses and away, then again every HINT_REPEAT_MS for as long as the player
  // goes on not playing - a mark that simply sat there breathing would become
  // furniture and stop being read, but one that never came back is no use to
  // somebody who has been staring at the board for a minute.
  //
  // `showing` holds the activity epoch it is showing FOR, so any input both stops
  // the timers (the effect re-runs) and hides the mark on the spot, without the
  // cleanup having to set state. The epoch is why this needs no separate "hide".
  const hintsOn = room.meta.hintsOn ?? false;
  const [activity, setActivity] = useState(0);
  const [showing, setShowing] = useState<number | null>(null);
  // The sit-out button's confirm step. Disarms itself, so a stray tap in the
  // corner of a fast board costs nothing but a glance.
  const [arming, setArming] = useState(false);
  useEffect(() => {
    if (!arming) return;
    const t = setTimeout(() => setArming(false), 4000);
    return () => clearTimeout(t);
  }, [arming]);
  useEffect(() => {
    if (!hintsOn) return;
    let hide: ReturnType<typeof setTimeout> | undefined;
    let again: ReturnType<typeof setInterval> | undefined;
    const fire = () => {
      setShowing(activity);
      hide = setTimeout(() => setShowing(null), HINT_SHOW_MS);
    };
    const first = setTimeout(() => { fire(); again = setInterval(fire, HINT_REPEAT_MS); }, HINT_DELAY_MS);
    return () => { clearTimeout(first); clearTimeout(hide); clearInterval(again); };
  }, [hintsOn, activity]);

  const round = room.round;
  const me = room.players[uid];
  const badgeOf = (owner: string): BadgeId => room.players[owner]?.badgeId ?? me.badgeId;

  const { drag, startDrag } = useDrag((source: PlaySource, target: DropTarget, at: Point) => {
    gameStore.setState({ selection: source }); // direct set - select() would TOGGLE an already-selected source off
    if ('nearest' in target) {
      // No particular square was chosen. The candidates are the spaces this card
      // can LEGALLY land in, and that is what makes the gesture forgiving: aim at
      // a space that is full, or at a pile this card cannot follow, and it goes to
      // a playable one rather than coming back. Nothing is ever returned while
      // there is somewhere for it to go.
      const legal = round ? legalTargets(tableau!, source, round.spaces).spaces : [];
      // Two signals, tried in order. The LINE of a throw comes first, because a
      // flick says a direction and nothing dependable about distance - that is
      // what lets a 30px flick reach a space 400px away. Where they let go comes
      // second, and covers the throw that overshot: aim from a release point past
      // the board points back down at it, so the aim finds nothing and the
      // release - which is over the board, where they meant it - decides instead.
      const best = (target.aim ? aimedAt(spaceCentres(legal), target.aim) : null)
        ?? (target.loose ? nearestSpace(legal, at.x, at.y) : null);
      if (best == null) { gameStore.setState({ selection: null }); return; }
      void playTo({ space: best });
      return;
    }
    void playTo(target);                       // playTo consumes the selection
  }, room.meta.flingOn ?? true);

  // The store drops our hand the moment the phase leaves 'playing' (store.ts, the
  // clear that makes the next round adopt a fresh one). The round is still on
  // screen underneath the blitz splash and the score sheet though, so fall back
  // to the hand RTDB last recorded: the board the round ended on, rather than the
  // word "dealing…" flashing up behind the moment someone won. Nothing can be
  // played from it - playTo refuses outside 'playing'.
  const hand = tableau ?? round?.tableaus[uid] ?? null;
  // ABOVE the returns below, and it has to stay there. This is a hook, and both
  // returns are now reachable mid-round - sitting out deletes the hand out from
  // under a board that was rendering a moment ago - so calling it after them
  // changes the hook count between renders and React tears the tree down. It
  // used to sit lower on the reasoning that a round either has a board for its
  // whole life or never does, which sitting out is exactly the end of.
  const openings = useOpenings(round?.spaces ?? NO_SPACES, hand, uid, hintsOn);
  if (!round) return <div className="screen"><p className="muted">dealing…</p></div>;
  // Two ways to be off the board, and they end differently. Sitting out KEEPS the
  // hand, so returning drops straight back into the round in progress. Having no
  // hand at all means the deal happened without you, and no button can undo that
  // - the cards are dealt - so that one waits for the next round.
  const out = me?.sittingOut === true;
  // No hand and not sitting out: either they joined a game already in progress,
  // or the deal happened while they were away. Either way they watch this round
  // and are dealt in at the next one - and watching means the BOARD, live, not a
  // waiting-room screen. The standby banner stands in for the opponent strip.
  const watching = !out && !hand;
  if (out) {
    const canRejoin = hand != null;
    return (
      <div className="screen stack">
        <h1 className="title">{out ? 'Sitting out' : 'Back next round'}</h1>
        <p className="muted">
          {out
            ? `Round ${room.meta.roundNumber} is being played without you. You are not being
               scored for it, and nobody is waiting on you.`
            : `You are in from the next deal. Round ${room.meta.roundNumber} finishes without you.`}
        </p>
        {out
          ? <button className="btn ready-btn" onClick={() => setSittingOut(false)}>
              {canRejoin ? "I'm back — rejoin this round" : "I'm back — deal me in"}
            </button>
          : <button className="btn btn-slim sit-out" onClick={() => setSittingOut(true)}>
              Actually, keep me out
            </button>}
        {out && !canRejoin && (
          <p className="muted" style={{ fontSize: 13 }}>
            This round was dealt without you, so you come back in the next one.
          </p>
        )}
        <a className="muted keep-back" href="#/">Home</a>
      </div>
    );
  }

  const races = raceFlashes({ races: round.races, spaces: round.spaces, uid, lastRejected });
  const active = drag ? drag.source : selection;
  const targets = hand && active ? legalTargets(hand, active, round.spaces) : { spaces: [], posts: [] };
  const stuckAvailable = hand ? !hasLegalMove(hand, round.spaces) : false;
  // Recomputed every render rather than stored, so it can never point at a space
  // somebody else has since filled.
  // Recomputed every render rather than stored, so a re-fire ten seconds later
  // points at the board as it is now - which is the case that matters most, a
  // player who WAS stuck and has just had a move opened up for them.
  const hint = hand && hintsOn && showing === activity ? hintSpace(hand, round.spaces) : null;
  // A stopped table is a fact about the GAME, not about one hand, so it is said
  // across the board rather than under the tableau. The rescue reads the same way
  // for everybody; only the host is offered the button that starts it.
  const stall = room.meta.singleFlip
    ? { mode: 'rescue' as const, canRescue: false, onRescue: () => {} }
    : allConnectedStuck(room.players, round.tableaus)
      ? { mode: 'stalled' as const, canRescue: isHost({ uid, room }),
          onRescue: () => setSingleFlip(true) }
      : undefined;

  return (
    // Every tap and every drag on this screen is a sign of life, which is a wider
    // net than "made a legal move" on purpose: a player weighing up the board is
    // present, and marking them away would be wrong even though it is harmless.
    <div className={`game${room.meta.paleCards ? ' pale-cards' : ''}`}
      // --piles/--tgap feed --hand-card in game.css, which sizes the tableau to
      // the row it actually has. They live HERE rather than on .tableau-zone
      // because the drag ghost is a sibling of the tableau and must be given the
      // same size - it cannot inherit one it is not inside.
      // Two players deal five posts (seven piles across), which is where the
      // tighter gap is needed; every other size deals three.
      style={{
        opacity: online ? 1 : 0.6,
        ['--piles' as string]: String((hand?.post.length ?? 3) + 2),
        ['--tgap' as string]: (hand?.post.length ?? 3) >= 5 ? '6px' : '10px',
      }}
      onPointerDown={() => { noteActivity(); setActivity(n => n + 1); }}>
      <div className="game-head">
        <strong>Round {room.meta.roundNumber}</strong>
        <span className="muted">{me.name} · {me.score} pts · to {room.meta.targetScore}</span>
        {/* Which thumb the wood pile sits under, changeable mid-game on purpose:
            a player who was auto-rejoined never sees a form again. */}
        <ConnectionPill />
        {/* One island rather than three loose dots: the three controls that are
            not game actions, on a single pill. They stay one tap each - grouping
            is all this is. The theme toggle lives HERE on the board and in the
            fixed corner pill everywhere else (App.tsx), never in both. */}
        <span className="head-btns">
          <button className="side-swap" onClick={swapSides}
            aria-label={`Move the wood pile to the ${woodSide === 'right' ? 'left' : 'right'}`}
            title="Swap Blitz and wood">⇄</button>
          {/* Two taps, never one. This now ends the player's round outright and
              forfeits its score, which is far too much to hang on one stray
              thumb in the corner of a board being played at speed. The armed
              state times out by itself so a mis-tap costs nothing. */}
          {arming
            ? <button className="side-swap arming" onClick={() => { setArming(false); setSittingOut(true); }}
                aria-label="Confirm sitting out of this round">out?</button>
            : <button className="side-swap" onClick={() => setArming(true)}
                aria-label="Sit out" title="Sit out of the round">{'\u{1f6aa}' + EMOJI}</button>}
          <ThemeToggle />
        </span>
      </div>
      {/* The banner takes the opponent strip's PLACE rather than sitting above it:
          that row is a fixed track in .game's grid, so a second thing in it would
          come straight off the board this player is here to watch. */}
      {watching
        ? <div className="standby-banner" role="status">
            <strong>Standby. Game in progress.</strong>
            <span>You are dealt in at the start of the next round.</span>
          </div>
        : <OpponentStrip me={uid} players={room.players} tableaus={round.tableaus} woodSide={woodSide} />}
      <CenterGrid spaces={round.spaces} highlight={targets.spaces} badgeOf={badgeOf}
        onTap={i => void playTo({ space: i })} races={races}
        snapping={targets.spaces.length > 0} stuck={hand != null && me.stuckAt != null} hint={hint}
        openings={openings} stall={stall}
        onSnapTap={() => { if (targets.spaces.length) void playTo({ space: targets.spaces[0] }); }} />
      <div>
        {hand ? <>
        <motion.div key={lastRejected?.at ?? 0}
          animate={lastRejected ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
          transition={{ duration: 0.35 }}>
          <TableauView t={hand} badgeId={me.badgeId} selection={selection} woodSide={woodSide}
            postHighlight={targets.posts} onSelect={select} onFlip={flip}
            onTapPost={i => void playTo({ post: i })} startDrag={startDrag} />
        </motion.div>
        {/* A host write that was refused. It belongs on THIS screen and not only
            on the score sheet, because the write most likely to fail is the one
            that builds the sheet - so the sheet is not there to carry its own
            error. Costs no layout until something has actually gone wrong. */}
        {actionError && <p className="error" style={{ margin: '6px 0 0', fontSize: 13 }}>{actionError}</p>}
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
        </> : (
          /* A watcher has no cards, but the row is still a track in .game's grid
             and leaving it empty would let the board grow into it and then shrink
             back the moment they are dealt in. */
          <p className="muted standby-hand">Your cards arrive with the next deal.</p>
        )}
      </div>
      {hand && drag && <DragGhost drag={drag} badgeId={me.badgeId} />}
    </div>
  );
}
