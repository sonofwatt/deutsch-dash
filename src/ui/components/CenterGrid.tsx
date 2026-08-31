import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CardView } from './CardView';
import { depthLayers } from './PileStack';
import { cardId, type Card, type CenterSpace } from '../../game/types';
import { EMOJI, type BadgeId } from '../../game/badges';
import { orderlyColumns } from '../../game/rules';
import type { RaceFlash } from '../raceFlash';
import type { Opening } from '../openings';

/** The box the grid has to fill, in CSS pixels. */
export type GridBox = { w: number; h: number };

/**
 * These mirror `.game-grid` in game.css and are approximations on purpose: they
 * only RANK the candidate shapes against each other, and CSS still does the
 * actual sizing from the real box. If one drifts, the board picks a slightly
 * wrong SHAPE - never a wrong size, and never anything that overflows.
 */
const CARD_RATIO = 1.4;   // a slot is 2.5 x 3.5, so 1.4 x as tall as it is wide
const CAPTION_PX = 34;    // the drop zone's caption row, always reserved
const GAP_PX = 8;         // the middle of --gap's clamp(4px, 1.4vw, 10px)
const MAX_SLOT_PX = 96;   // the clamp's ceiling: bigger than this is not spent

/**
 * The board stays a block. One row is a strip and nine columns is a smear, and
 * neither is a board anybody can read at speed.
 */
const MIN_COLS = 2;
const MAX_COLS = 8;

/** The slot edge a given column count would buy, as `.game-grid` would size it. */
function slotFor(count: number, cols: number, box: GridBox): number {
  const rows = Math.ceil(count / cols);
  const w = (box.w - (cols - 1) * GAP_PX) / cols;
  const h = (box.h - CAPTION_PX - (rows - 1) * GAP_PX) / rows / CARD_RATIO;
  return Math.min(w, h, MAX_SLOT_PX);
}

/**
 * Columns for a board of `count` spaces (4 x players - see spaceCountForPlayers).
 *
 * With no `box` this is the old fixed-shape answer: four rows at every game
 * size, growing sideways instead, because height is the scarce axis on a phone.
 * That is still what a first paint and every static render gets.
 *
 * Given the box the board actually has, it picks the shape that buys the
 * biggest slot instead. Four rows is right on a tall screen and wrong on a short
 * one: a Safari tab with its address bar down left a four-player board
 * height-bound at 4x4 with spare width on both sides, where 6x3 fits a visibly
 * bigger card. Nothing about the shape is shared - every client picks its own
 * from its own screen, exactly as each already decides for itself whether the
 * rails are in flow - so two phones at one table may lay the same board out
 * differently, which is the point.
 */
export function gridColumns(count: number, orderly = false, box?: GridBox): number {
  // An orderly board's columns are NOT free: suitForSpace derives a space's suit
  // from its index modulo this number, and that suit is what canPlayToSpace and
  // centerPlayTxn enforce. Re-shaping the grid would recolour the board under
  // the rule. Fixed by the suits, and it stays that way - see orderlyColumns.
  if (orderly) return orderlyColumns(count);
  const fixed = Math.max(4, Math.ceil(count / 4));
  if (!box || box.w <= 0 || box.h <= 0 || count < 1) return fixed;

  const hi = Math.max(1, Math.min(MAX_COLS, count));
  const lo = Math.min(MIN_COLS, hi);
  const tried = [];
  for (let cols = lo; cols <= hi; cols++) {
    tried.push({ cols, slot: slotFor(count, cols, box), waste: cols * Math.ceil(count / cols) - count });
  }
  const best = Math.max(...tried.map(c => c.slot));
  // Within a pixel is a tie as far as a thumb is concerned, and above the clamp's
  // ceiling everything ties. Settle those on the tidier board - fewest holes in
  // the bottom row, then fewest columns, which keeps the familiar shape whenever
  // it costs nothing.
  return tried
    .filter(c => c.slot > best - 1)
    .sort((a, b) => a.waste - b.waste || a.cols - b.cols)[0].cols;
}

/**
 * useLayoutEffect in the browser so the measured shape is the first one painted
 * rather than a visible re-flow on entering a round, and useEffect on the server
 * only to keep react-dom/server from warning - render.test.ts runs no effects
 * either way, so a static render keeps the fixed shape above.
 */
const useMeasureEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The box `.grid-wrap` currently has, or undefined before it has been measured. */
function useGridBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<GridBox | undefined>(undefined);
  useMeasureEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      // Cannot feed back: .grid-wrap is `container-type: size`, so its own box is
      // fixed by the tracks around it and the grid inside it cannot push on it.
      // The epsilon is for sub-pixel churn on a rotating or resizing window.
      setBox(prev => (prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/** At most this many chips per rail before the overflow marker takes over. */
const RAIL_CAP = 8;

/**
 * Past this many spaces the board is crowded enough that the finished-pile rails
 * stop paying their way: at seven and eight players the grid is eight columns
 * wide and every pixel the rails hold is one the slots do not get. Above this the
 * rails keep a third of their width and let the chips hang off the edge of the
 * screen instead - still legible as "piles have finished, in these colours",
 * which is all they are for.
 */
const CROWDED_SPACES = 24;

/**
 * Finished piles, stacked down the side of the board. A completed 1..10 pile
 * clears its space (so the space can be reused), and lands here face down in its
 * suit colour - so the pile count and the suits that have gone are both readable
 * at a glance instead of the cards simply vanishing.
 */
function DoneRail({ runs }: { runs: Card[][] }) {
  const overflow = runs.length - RAIL_CAP;
  const shown = overflow > 0 ? runs.slice(-RAIL_CAP + 1) : runs;
  return (
    <div className="done-rail" aria-label={`${runs.length} finished pile${runs.length === 1 ? '' : 's'}`}>
      {overflow > 0 && <span className="done-more">+{overflow + 1}</span>}
      {shown.map((run, i) => (
        <div key={i} className="done-chip"
          style={{ ['--suit' as string]: `var(--suit-${run[0].suit})` }} />
      ))}
    </div>
  );
}

export function CenterGrid(props: {
  spaces: CenterSpace[]; highlight: number[]; badgeOf: (owner: string) => BadgeId;
  onTap: (i: number) => void; snapping?: boolean; onSnapTap: () => void;
  // Optional: a board with nobody racing passes nothing at all.
  races?: Record<number, RaceFlash>;
  // All optional on purpose - render.test.ts builds these props as complete
  // literals, and tsc -b typechecks it, so a REQUIRED prop here breaks the build
  // rather than just the tests. See the handoff's two traps.
  // Which space the helper hint is pointing at, if the host turned hints on and
  // the player has gone quiet. See game/hint.ts for why it is the destination.
  hint?: number | null;
  // One colour per column. The suits themselves come off the spaces, which is
  // where the rule lives; this only decides the column count.
  orderly?: boolean;
  // Spaces somebody else just played to that this player can use. See openings.ts.
  openings?: Record<number, Opening>;
  /**
   * The table has stopped, or is being got going again. Optional like everything
   * else here - render.test.ts builds these props as complete literals and tsc -b
   * typechecks it, so a REQUIRED prop breaks the build rather than just the tests.
   */
  stall?: {
    mode: 'stalled' | 'rescue';
    /** Only the host is offered the way out; everybody else is told to wait. */
    canRescue: boolean;
    onRescue: () => void;
  };
}) {
  // Above every early return there could ever be, and before anything that could
  // become one: this is a hook, and the board vanishing under a player who sits
  // out is exactly the case that tears the tree down otherwise. See the handoff.
  const [wrapRef, box] = useGridBox();
  const cols = gridColumns(props.spaces.length, props.orderly, box);
  const done = props.spaces.flatMap(s => s.history);
  // split alternately so both rails grow together rather than one filling first
  const left = done.filter((_, i) => i % 2 === 0);
  const right = done.filter((_, i) => i % 2 === 1);

  return (
    <div className={`board${props.spaces.length > CROWDED_SPACES ? ' crowded' : ''}`}>
      <DoneRail runs={left} />
      <div className="grid-wrap" ref={wrapRef}>
        {/* The drop zone is the WHOLE board area and the grid sits inside it, which
            is the only arrangement that makes every pixel between the slots a
            target: parseDrop walks UP from whatever is under the finger, so a
            sibling overlay would be invisible to it however it was stacked.

            It used to be a dashed box captioned "drop here" below the grid,
            permanently drawn whether it was usable or not. Now it is invisible at
            rest and only speaks when it has something to say - a soft wash while
            you hold a card that fits somewhere, and the stuck note when you hold
            nothing that does. The grid keeps the position it always had. */}
        <div className={`drop-zone${props.snapping ? ' on' : ''}`}
          data-drop="nearest" onClick={props.onSnapTap}>
        <div className="game-grid"
          // Rows as well as columns: the slot is sized against the height the
          // board has as well as its width, and CSS cannot count grid rows.
          style={{
            ['--cols' as string]: String(cols),
            ['--rows' as string]: String(Math.max(1, Math.ceil(props.spaces.length / cols))),
          }}>
          {props.spaces.map((s, i) => {
            const top = s.stack[s.stack.length - 1];
            // Capped at two: the peek only has the grid gap to grow into, and the
            // card's own number already says how deep a centre pile is.
            const layers = depthLayers(s.stack.length, 2);
            return (
              <div key={i} data-drop={`space:${i}`}
                // Stops the tap reaching the drop zone underneath, which would
                // otherwise ALSO snap-play into whichever space happened to be
                // first legal - two cards gone on one tap.
                onClick={e => { e.stopPropagation(); props.onTap(i); }}
                // The suit tint is the whole point of an orderly board and has to
                // read while the space is EMPTY - once a card is down its own face
                // says the colour. So it goes on the slot, not on the card.
                style={s.suit ? { ['--suit' as string]: `var(--suit-${s.suit})` } : undefined}
                className={`pile-space${s.suit ? ' owned' : ''}`
                  + (props.highlight.includes(i) ? ' glow' : '')
                  + (props.hint === i ? ' hint' : '')}>
                {Array.from({ length: layers }, (_, k) => (
                  <div key={k} className="slot-layer" style={{ ['--k' as string]: String(layers - k) }} />
                ))}
                {top && (
                  <CardView key={cardId(top)} card={top} badgeId={props.badgeOf(top.owner)} layoutId={cardId(top)} />
                )}
                {/* Keyed by the race, so a new one remounts the span and replays
                    the animation. The element then simply sits at opacity 0 - no
                    timer clears it, which is why nothing here needs a clock. */}
                {props.races?.[i] && (
                  <span key={props.races[i].at} className={`race-flash race-${props.races[i].kind}`}>
                    {(props.races[i].kind === 'angry' ? '😠' : '😇') + EMOJI}
                  </span>
                )}
                {/* Its own element for the same reason the race face is: a class
                    toggled on the slot cannot replay its animation, and a second
                    opening on the same space has to be seen. Keyed by the nonce,
                    so it remounts. */}
                {props.openings?.[i] && (
                  <span key={props.openings[i].at} className="open-glow"
                    style={{ ['--open' as string]: `var(--suit-${props.openings[i].suit})` }} />
                )}
              </div>
            );
          })}
        </div>
        {/* Across the board, because a table that has stopped is not a fact about
            one player's hand - it is a fact about the game, and it wants saying
            where everyone is already looking. Transparent to the pointer except
            for the button, so it can never be the thing that stops a play. */}
        {props.stall && (
          <div className={`stall-note stall-${props.stall.mode}`} role="status">
            {props.stall.mode === 'stalled' ? (
              <>
                <strong>Nobody can move.</strong>
                {props.stall.canRescue
                  ? <button className="btn btn-slim" onClick={props.stall.onRescue}>
                      Turn wood one card at a time
                    </button>
                  : <span>Waiting for the host to open the wood up…</span>}
              </>
            ) : (
              <>
                <strong>One card at a time.</strong>
                <span>The wood turns over singly until somebody plays.</span>
              </>
            )}
          </div>
        )}
        {/* Down at the tableau end of the zone, where the old band used to be, so
            a stuck player reads it without looking away from their own cards -
            and so it never lands on top of the grid. */}
        {props.snapping && (
          <span className="drop-note">drop anywhere here → nearest space</span>
        )}
        </div>
      </div>
      <DoneRail runs={right} />
    </div>
  );
}
