import { CardView } from './CardView';
import { depthLayers } from './PileStack';
import { cardId, type Card, type CenterSpace } from '../../game/types';
import { EMOJI, type BadgeId } from '../../game/badges';
import { orderlyColumns } from '../../game/rules';
import type { RaceFlash } from '../raceFlash';
import type { Opening } from '../openings';

/**
 * Columns for a board of `count` spaces (4 x players, capped - see
 * spaceCountForPlayers). Holds the board at four rows for every game size and
 * grows sideways instead: two players get 4x2, four get 4x4, six or more get
 * 6x4. Height is the scarce axis on a phone - the opponent strip and the whole
 * tableau live below this.
 */
export function gridColumns(count: number, orderly = false): number {
  // An orderly board's columns are fixed by its suits, not by its size - see
  // orderlyColumns. Same four-row ceiling in practice: 24 spaces land on 8 x 3.
  if (orderly) return orderlyColumns(count);
  return Math.max(4, Math.ceil(count / 4));
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
  // All three optional on purpose - render.test.ts builds these props as complete
  // literals, and tsc -b typechecks it, so a REQUIRED prop here breaks the build
  // rather than just the tests. See the handoff's two traps.
  stuck?: boolean;
  // Which space the helper hint is pointing at, if the host turned hints on and
  // the player has gone quiet. See game/hint.ts for why it is the destination.
  hint?: number | null;
  // One colour per column. The suits themselves come off the spaces, which is
  // where the rule lives; this only decides the column count.
  orderly?: boolean;
  // Spaces somebody else just played to that this player can use. See openings.ts.
  openings?: Record<number, Opening>;
}) {
  const done = props.spaces.flatMap(s => s.history);
  // split alternately so both rails grow together rather than one filling first
  const left = done.filter((_, i) => i % 2 === 0);
  const right = done.filter((_, i) => i % 2 === 1);

  return (
    <div className={`board${props.spaces.length > CROWDED_SPACES ? ' crowded' : ''}`}>
      <DoneRail runs={left} />
      <div className="grid-wrap">
        {/* The drop zone is the WHOLE board area and the grid sits inside it, which
            is the only arrangement that makes every pixel between the slots a
            target: parseDrop walks UP from whatever is under the finger, so a
            sibling overlay would be invisible to it however it was stacked.

            It used to be a dashed box captioned "drop here" below the grid,
            permanently drawn whether it was usable or not. Now it is invisible at
            rest and only speaks when it has something to say - a soft wash while
            you hold a card that fits somewhere, and the stuck note when you hold
            nothing that does. The grid keeps the position it always had. */}
        <div className={`drop-zone${props.snapping ? ' on' : ''}${props.stuck ? ' stuck' : ''}`}
          data-drop="nearest" onClick={props.onSnapTap}>
        <div className="game-grid"
          style={{ ['--cols' as string]: String(gridColumns(props.spaces.length, props.orderly)) }}>
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
        {/* Down at the tableau end of the zone, where the old band used to be, so
            a stuck player reads it without looking away from their own cards -
            and so it never lands on top of the grid. */}
        {(props.stuck || props.snapping) && (
          <span className="drop-note">
            {props.stuck ? 'No moves left — waiting for the others' : 'drop anywhere here → nearest space'}
          </span>
        )}
        </div>
      </div>
      <DoneRail runs={right} />
    </div>
  );
}
