import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { CardBack, CardView } from './CardView';
import { PileStack, depthLayers } from './PileStack';
import type { BadgeId } from '../../game/badges';
import type { WoodSide } from '../prefs';
import { WOOD_STEP } from '../../game/wood';

/**
 * How long the flipped pile takes to travel back onto the draw pile, and how long
 * the three cards of that turn wait before they deal in on top of it. Defined
 * once, here, and handed to the stylesheet as `--collect-ms` so the animation and
 * the timer that clears it cannot drift apart.
 */
const COLLECT_MS = 180;
import { cardId, type Card, type PlaySource, type Tableau } from '../../game/types';

export function TableauView(props: {
  t: Tableau; badgeId: BadgeId; selection: PlaySource | null; postHighlight: number[];
  onSelect: (s: PlaySource) => void; onFlip: () => void; onTapPost: (i: number) => void;
  startDrag: (e: React.PointerEvent, card: Card, source: PlaySource) => void;
  /**
   * What is currently in the air, if anything. EVERY pile acts on it: a card being
   * dragged is already under the finger, so leaving a copy of it on the pile it
   * came from draws the same card twice and reads as the drag having failed.
   * Reported from a table as exactly that, off the Dash pile.
   *
   * The play has not happened yet - it commits on the drop - so the pile still
   * HOLDS the card and still counts it on its label. This is only what the player
   * would see if it were gone, which is the thing they are trying to look at.
   * Optional, like every prop here - render.test.ts builds these as complete
   * literals and tsc -b typechecks it.
   */
  dragging?: PlaySource | null;
  /** This player has no move. Optional, like every prop here. */
  stuck?: boolean;
  /** Offered a few seconds after that: send the face-up wood card to the bottom. */
  onSinkWood?: () => void;
  /** Optional: which end the wood pile sits at. Defaults to the right thumb. */
  woodSide?: WoodSide;
  /**
   * When the wood pile last turned over, from the store. A nonce: every new value
   * plays the collect once. It comes from `flip` rather than being worked out
   * here, because it cannot be worked out here - the face-down count does not
   * reliably change across a turn-over (a five-card pile reads 2 both sides of
   * one), and a reordered pile looks exactly like a sunk card from the outside.
   */
  collectedAt?: number | null;
}) {
  const { t, badgeId } = props;
  const woodTop = t.woodIndex > 0 ? t.wood[t.woodIndex - 1] : null;
  const dashTop = t.dash[t.dash.length - 1] ?? null;
  const sel = JSON.stringify(props.selection);
  const isSel = (s: PlaySource) => sel === JSON.stringify(s);

  const faceDown = t.wood.length - t.woodIndex; // still to be turned over
  const faceUp = t.woodIndex;                   // already turned over, top is playable
  // The cards this turn brought over, oldest first, with the playable one last.
  // Capped at WOOD_STEP because that is the most a turn can ever deal. A turn that
  // takes the pile over rotates it and lands the index back on three, so its three
  // cards are the face-up prefix here like any other turn's - the last card of the
  // pile and the two that followed it round. Fewer only when the pile is shorter
  // than a turn, or under the host's single-card rescue.
  const dealt = t.wood.slice(Math.max(0, t.woodIndex - WOOD_STEP), t.woodIndex);
  // The same run without its top card: what the pile looks like with the card the
  // player is holding taken off it.
  const beneath = dealt.slice(0, -1);
  const draggingWood = props.dragging?.kind === 'wood';
  const draggingDash = props.dragging?.kind === 'dash';
  // What is under the card in the air, for a pile that shows only its top card.
  // Null when it was the last one, and then the slot is simply empty.
  const under = (stack: Card[]) => stack[stack.length - 2] ?? null;
  // Every wood card has been turned over at least once: the next flip recycles the
  // pile from the start and deals 3 again (or whatever is left, see flipWood).
  // Tapping the empty draw slot is the recycle. It carries no glyph: a ↻ on the
  // card was in the way, and a ↻ in the slot was still one more thing on a board
  // that has enough on it. The slot going solid is the cue.
  const canRecycle = faceDown === 0 && t.wood.length > 0;

  // The turn that takes the pile over puts every card that was already face up
  // back under the draw pile, and that move used to be invisible: the flipped
  // pile simply held different cards a frame later. `collecting` runs the outline
  // of the old pile up to the draw slot and holds the new three edge-on until it
  // lands, so the turn reads as collect-then-deal rather than as a jump.
  //
  // Driven by `collectedAt` from the store rather than by anything visible here:
  // see the prop.
  const [collecting, setCollecting] = useState(false);
  const seen = useRef(props.collectedAt ?? null);
  useEffect(() => {
    const at = props.collectedAt ?? null;
    if (at === null || at === seen.current) return; // nothing new; a remount does not replay it
    seen.current = at;
    setCollecting(true);
    const id = setTimeout(() => setCollecting(false), COLLECT_MS);
    return () => clearTimeout(id);
  }, [props.collectedAt]);

  // Wood is the pile a player touches most - every flip of three is another tap -
  // so it sits under a thumb, and which thumb is a preference (see prefs.ts).
  // Only the two ends trade places: the posts stay in the middle, because moving
  // them would shuffle four positions to fix one.
  const dashGroup = (
      <div key="dash">
        <PileStack layers={depthLayers(t.dash.length)}>
          {/* Nothing to grab while one is already in the air, and no layoutId: the
              card revealed underneath is not moving anywhere. */}
          {draggingDash
            ? (under(t.dash)
                ? <CardView key={cardId(under(t.dash)!)} card={under(t.dash)!} badgeId={badgeId} />
                : <div className="pile-space" />)
            : dashTop ? (
            <div onClick={() => props.onSelect({ kind: 'dash' })}
              onPointerDown={e => props.startDrag(e, dashTop, { kind: 'dash' })}>
              <CardView key={cardId(dashTop)} card={dashTop} badgeId={badgeId} selected={isSel({ kind: 'dash' })} layoutId={cardId(dashTop)} />
            </div>
          ) : <div className="pile-space" />}
        </PileStack>
        {/* The count used to be a bubble pinned to the card's corner, over the
            card art. Every pile now says how many cards it holds in the same
            place, in the same way: on the label underneath. */}
        <div className="pile-label">dash {t.dash.length}</div>
      </div>
  );

  const postGroups = t.post.map((stack, i) => {
        const top = stack[stack.length - 1] ?? null;
        const source: PlaySource = { kind: 'post', index: i };
        const lifted = props.dragging?.kind === 'post' && props.dragging.index === i;
        const shown = lifted ? under(stack) : top;
        return (
          <div key={i}>
            <PileStack layers={depthLayers(stack.length)} data-drop={`post:${i}`}
              onClick={() => props.onTapPost(i)}>
              <div className={`pile-space${props.postHighlight.includes(i) ? ' glow' : ''}`}>
                {/* Same as the Dash pile: while this post's card is in the air, show
                    what is under it, with nothing to grab and no layoutId. */}
                {lifted ? (shown &&
                  <CardView key={cardId(shown)} card={shown} badgeId={badgeId} />
                ) : top && (
                  <div onClick={e => { e.stopPropagation(); props.onSelect(source); }}
                    onPointerDown={e => props.startDrag(e, top, source)}>
                    <CardView key={cardId(top)} card={top} badgeId={badgeId} selected={isSel(source)} layoutId={cardId(top)} />
                  </div>
                )}
              </div>
            </PileStack>
            {/* The whole pile, not the hidden remainder: "+1" under a 2-card post
                was asking the player to add. An empty post has nothing to count. */}
            <div className="pile-label">{stack.length > 0 ? String(stack.length) : ' '}</div>
          </div>
    );
  });

  const woodGroup = (
      <div key="wood">
        <div className="wood-col" style={{ '--collect-ms': `${COLLECT_MS}ms` } as React.CSSProperties}>
          <PileStack layers={depthLayers(faceDown)}>
            {faceDown > 0
              ? <div onClick={props.onFlip}><CardBack badgeId={badgeId} /></div>
              : <div className={`pile-space${canRecycle ? ' recycle-slot' : ''}`}
                  onClick={props.onFlip} title={canRecycle ? 'Recycle wood' : undefined} />}
          </PileStack>
          <PileStack layers={Math.min(2, faceUp - 1)}>
            {/* The pile that has just gone back under, on its way to the draw
                slot. Inside this stack on purpose: `--pile-step` is defined here,
                and the distance to travel is this card's own height plus the peek
                and the column gap, so the geometry stays in one place. */}
            {collecting && <div className="wood-collect" aria-hidden="true" />}
            {/* No recycle button on the face-up card. It sat on top of the card the
                thumb reaches for, covering .card-badge entirely at every card size,
                and the empty draw slot beside it already carries the ↻. */}
            {woodTop && !draggingWood ? (
              <div className={`wood-deal${collecting ? ' collecting' : ''}`}
                onClick={() => props.onSelect({ kind: 'wood' })}
                onPointerDown={e => props.startDrag(e, woodTop, { kind: 'wood' })}>
                {/* A turn brings three cards over, so it should look like three
                    cards being dealt - not one card flipping. They are stacked in
                    the same place and animate in one after another, which is what
                    dealing onto a spot looks like. Keyed by the card, so only the
                    ones that just arrived animate: the two under the top card sit
                    still if a later turn brought fewer.
                    The last is the one that is playable, and the only one that
                    ever wears the selection ring. */}
                {dealt.map((card, i) => (
                  <CardView key={cardId(card)} card={card} badgeId={badgeId}
                    selected={i === dealt.length - 1 && isSel({ kind: 'wood' })} />
                ))}
              </div>
            /* While the wood top is in the air, show what is UNDER it rather than a
               second copy of the card already following the finger. The play has
               not happened yet - it commits on the drop - so the pile still holds
               the card; this is only what the player would see if it were gone,
               which is what they are trying to look at. `beneath` is empty when the
               turn brought a single card, and then the slot is simply empty. */
            ) : draggingWood ? (
              beneath.length > 0 ? (
                <div className="wood-deal">
                  {beneath.map(card => (
                    <CardView key={cardId(card)} card={card} badgeId={badgeId} />
                  ))}
                </div>
              ) : <div className="pile-space" />
            ) : <div className="pile-space" />}
          </PileStack>
        </div>
        <div className="pile-label">wood {t.wood.length}</div>
      </div>
  );

  const ends = props.woodSide === 'left'
    ? [woodGroup, ...postGroups, dashGroup]
    : [dashGroup, ...postGroups, woodGroup];
  // The pile count and its gap are set on .game (Game.tsx), because --hand-card
  // is defined there - the drag ghost is a sibling of this and needs the same one.
  // data-hand marks where the player's own cards start. useDrag reads it to
  // decide what counts as letting go "into the middle": everything above this
  // row is board as far as the player is concerned, whether or not the drop
  // zone element reaches that far.
  return (
    <div className={`tableau-zone wood-${props.woodSide}`} data-hand>
      {/* The piles are their own row inside the zone. The zone centres it and
          carries the edge guards; the row is exactly as wide as the piles, which
          is what the note below is positioned against. */}
      <div className="tableau-row">
      {ends}
      {/* The stuck note lives HERE, in the band above the post piles that the
          wood column's two-card height leaves empty. It is absolutely positioned
          INSIDE the pile row, so it costs no layout at all and it is measured
          against the piles rather than the zone - the zone is as wide as the
          screen and the row is only as wide as the cards, and positioning this
          against the zone put it straight over the wood pile on any window wider
          than the row. Inset from whichever end the wood is on, because that is
          the one column the band does not span. */}
      {props.stuck ? (
        props.onSinkWood
          ? <button className="wood-note" onClick={props.onSinkWood}>
              No moves left - Send top wood card to bottom
            </button>
          : <span className="wood-note quiet">No moves left</span>
      ) : (
        /* With nothing to say, the band is a target instead. It is the nearest
           empty space to a thumb coming off the wood or the Dash pile, so a
           throw that barely leaves the hand lands in it - and data-drop is all
           that takes, because parseDrop walks up from whatever is under the
           finger. Invisible, and it covers no card (see .wood-note's geometry). */
        <div className="wood-note drop-band" data-drop="nearest" aria-hidden="true" />
      )}
      </div>
    </div>
  );
}
