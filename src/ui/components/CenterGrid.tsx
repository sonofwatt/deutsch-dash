import { CardView } from './CardView';
import { depthLayers } from './PileStack';
import { cardId, type Card, type CenterSpace } from '../../game/types';
import type { BadgeId } from '../../game/badges';

/**
 * Columns for a board of `count` spaces (4 x players, capped - see
 * spaceCountForPlayers). Holds the board at four rows for every game size and
 * grows sideways instead: two players get 4x2, four get 4x4, six or more get
 * 6x4. Height is the scarce axis on a phone - the opponent strip and the whole
 * tableau live below this.
 */
export function gridColumns(count: number): number {
  return Math.max(4, Math.ceil(count / 4));
}

/** At most this many chips per rail before the overflow marker takes over. */
const RAIL_CAP = 8;

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
}) {
  const done = props.spaces.flatMap(s => s.history);
  // split alternately so both rails grow together rather than one filling first
  const left = done.filter((_, i) => i % 2 === 0);
  const right = done.filter((_, i) => i % 2 === 1);

  return (
    <div className="board">
      <DoneRail runs={left} />
      <div className="grid-wrap">
        <div className="game-grid"
          style={{ ['--cols' as string]: String(gridColumns(props.spaces.length)) }}>
          {props.spaces.map((s, i) => {
            const top = s.stack[s.stack.length - 1];
            // Capped at two: the peek only has the grid gap to grow into, and the
            // card's own number already says how deep a centre pile is.
            const layers = depthLayers(s.stack.length, 2);
            return (
              <div key={i} data-drop={`space:${i}`} onClick={() => props.onTap(i)}
                className={`pile-space${props.highlight.includes(i) ? ' glow' : ''}`}>
                {Array.from({ length: layers }, (_, k) => (
                  <div key={k} className="slot-layer" style={{ ['--k' as string]: String(layers - k) }} />
                ))}
                {top && (
                  <CardView key={cardId(top)} card={top} badgeId={props.badgeOf(top.owner)} layoutId={cardId(top)} />
                )}
              </div>
            );
          })}
        </div>
        {/* Drop a card anywhere along here and it snaps to the nearest space it
            can legally land in - which for an Ace is simply the closest free one. */}
        <div className={`snap-band${props.snapping ? ' on' : ''}`} data-drop="nearest"
          onClick={props.onSnapTap}>
          <span>drop here → nearest space</span>
        </div>
      </div>
      <DoneRail runs={right} />
    </div>
  );
}
