import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { CardBack, CardView } from './CardView';
import { PileStack, depthLayers } from './PileStack';
import type { BadgeId } from '../../game/badges';
import type { WoodSide } from '../prefs';
import { WOOD_STEP } from '../../game/wood';

import { cardId, type Card, type PlaySource, type Tableau } from '../../game/types';
import type { WoodTurnover } from '../../state/store';

/**
 * The clock of a wood turn, in milliseconds. All of it is defined here and handed
 * to the stylesheet as custom properties, because the delays below are ARITHMETIC
 * on these numbers and the timer that ends the move has to add up to the same
 * total: a duration living in the stylesheet and a timer living here is exactly
 * the drift `--collect-ms` was introduced to stop.
 *
 * Tuned by the table, and the numbers have moved twice in a day:
 *
 *  - 200 / 200 / 180 originally, each card clear of the next.
 *  - 400 / 400 / 180 on 2026-09-10, when the flipping was asked to take twice as
 *    long.
 *  - 300 / 250 / 250 the same day, having watched it at half speed.
 *  - 300 / 200 / 250, another 50ms off the step, having watched that.
 *
 * `gap` is not a card at all. It is the 100ms the TOP spot sits visibly empty
 * between the last card of a short final deal landing and the pile being gathered
 * back onto it (2026-09-11). See dealTimeline.
 *
 * **`step` is now SHORTER than `flip`, so the cards overlap by 100ms** - the next
 * one starts turning a third of the way into the one before it. Overlap was
 * tried once before and reported as hard to watch, and that is worth knowing
 * rather than repeating: the version that failed CROSS-FADED, so two
 * half-transparent cards sat on top of each other. These are fully opaque, which
 * is what makes a small overlap read as a dealing hand rather than as a smear.
 * Asked for in those terms.
 *
 * Nothing below assumes any relationship between the three. An earlier cut had
 * `collectAt` as `before * step`, which is "when the last card ahead of the gather
 * lands" only while `step` and `flip` are equal - and they no longer are.
 */
export const WOOD_TIMING = { flip: 300, step: 200, collect: 250, gap: 100 } as const;
const { flip: FLIP_MS, step: DEAL_STEP_MS, collect: COLLECT_MS, gap: GAP_MS } = WOOD_TIMING;

/**
 * When each card of a turn starts turning over, and when the gather runs.
 *
 * A turn that takes the pile over used to gather first and then deal all three.
 * The table asked for what actually happens with cards in a hand (2026-09-10):
 * the draw pile deals out the one or two it has LEFT, then the cards underneath
 * are gathered up onto the draw pile, then the rest of the turn is dealt off those
 * to complete the three.
 *
 * So the gather sits in the middle of the deal rather than in front of it. `before`
 * is how many cards came off the pile first - `WoodTurnover.dealtBefore`, which
 * only the store can know. At zero (a recycle of a pile already all face up, or the
 * host's single-card rescue) this collapses to the old gather-then-deal, which is
 * right: there was nothing left to deal first.
 *
 * The two joins are written out rather than folded into one multiplication,
 * because they are the two places the move has to be honest about itself: the
 * gather waits for the last card ahead of it to LAND (not merely to start), and
 * the cards behind it wait for the gather to FINISH. Cards overlap each other by
 * design; nothing overlaps the gather.
 */
export function dealTimeline(count: number, before: number) {
  const first = Math.max(0, Math.min(before, count));
  // `before >= count` is a turn with NO gather in it - an ordinary turn of three
  // off a pile that had them. Every card then deals straight through and nothing
  // reads `collectAt`, because the outline is not rendered at all.
  const gathers = first < count;
  // The cards the pile had left, dealt at the ordinary rate.
  const ahead = Array.from({ length: first }, (_, i) => i * DEAL_STEP_MS);
  // The gather starts when the last of them has landed - a flip after the last
  // one started, not a step - and then a GAP more. Dealing out the last one or two
  // cards EMPTIES the top pile, and the table asked to see it empty before the pile
  // is gathered back onto it (2026-09-11): a pile whose length is a multiple of
  // three always showed that blank spot at the end of a lap, and one that was not
  // filled it in the same instant it emptied, so half the piles never showed it.
  // No gap when nothing was left to deal (`first === 0`): that spot has already
  // been visibly empty since the last turn, for as long as the player looked at it.
  const collectAt = first === 0 ? 0 : ahead[first - 1] + FLIP_MS + GAP_MS;
  const resumeAt = collectAt + COLLECT_MS;
  const delays = Array.from({ length: count }, (_, i) =>
    i < first ? ahead[i]
      : gathers ? resumeAt + (i - first) * DEAL_STEP_MS
      : i * DEAL_STEP_MS);
  const lastLands = count > 0 ? delays[count - 1] + FLIP_MS : 0;
  return {
    /** Per card, oldest first: when it starts turning over. */
    delays,
    /** The gather waits for the cards ahead of it to land, and then the gap. */
    collectAt,
    /**
     * When the gathered pile lands on the top spot, which stops being empty. Until
     * then the draw pile shows the blank it would show if the pile had simply run
     * out - which it did. Zero on a turn with no gather, which never empties it.
     */
    drawAt: gathers ? resumeAt : 0,
    /**
     * The whole move, which is what the `collecting` class has to outlast. It used
     * to be cleared after COLLECT_MS alone, which took the class off while the
     * later cards were still sitting in their delay and pulled them forward by the
     * length of the gather - the deal never really waited for it except for the
     * first card.
     */
    total: Math.max(lastLands, gathers ? resumeAt : 0, COLLECT_MS),
  };
}

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
   * The last turn that took the wood pile over, from the store. `at` is a nonce:
   * every new value plays the move once. It comes from `flip` rather than being
   * worked out here, because it cannot be worked out here - the face-down count
   * does not reliably change across a turn-over (a five-card pile reads 2 both
   * sides of one), a reordered pile looks exactly like a sunk card from the
   * outside, and `dealtBefore` survives nowhere but the hand as it was.
   */
  turnover?: WoodTurnover | null;
  /**
   * The soundbite launcher, if the board is showing one, drawn in the band above
   * the DASH column - the empty strip the wood column's two-card height leaves.
   *
   * Handed in as a node rather than built here, because the whole gesture (the
   * hold, the slide, the dismiss backdrop) belongs to Game.tsx, which owns the
   * state it drives. This component only knows where it goes. Optional, like
   * every prop here: render.test.ts builds these as complete literals and
   * `tsc -b` typechecks it, so a required prop would break the BUILD.
   */
  soundLauncher?: React.ReactNode;
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
  //
  // `turning` holds the whole move, not just the gather: the class carries every
  // card's delay, so taking it off early re-times the cards still waiting behind
  // the gather and pulls them forward by its length.
  const [turning, setTurning] = useState<number>(0);
  const seen = useRef(props.turnover?.at ?? null);
  const at = props.turnover?.at ?? null;
  useEffect(() => {
    if (at === null || at === seen.current) return; // nothing new; a remount does not replay it
    seen.current = at;
    const before = props.turnover?.dealtBefore ?? 0;
    setTurning(before + 1); // 1-based, so 0 reads as "not turning"
    const id = setTimeout(() => setTurning(0), dealTimeline(WOOD_STEP, before).total);
    return () => clearTimeout(id);
    // `at` is the nonce and the only thing that may retrigger this: dealtBefore
    // travels with it and re-reading props here would replay nothing on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  const collecting = turning > 0;
  // The timeline this turn is being played on. A hand that is not mid-turn deals
  // its cards straight in, which is what an ordinary turn of three looks like.
  const timeline = dealTimeline(dealt.length, collecting ? turning - 1 : dealt.length);
  // The top spot is blank while a gathered pile is on its way back to it. Only
  // when there IS a draw pile to come back: a pile dealt right out has no gather.
  const blanking = collecting && timeline.drawAt > 0 && faceDown > 0;

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
        <div className="wood-col" style={{
          '--collect-ms': `${COLLECT_MS}ms`, '--flip-ms': `${FLIP_MS}ms`,
          '--collect-at': `${timeline.collectAt}ms`,
          '--draw-at': `${timeline.drawAt}ms`,
        } as React.CSSProperties}>
          {/* While a turn that took the pile over is playing, the top spot shows
              the blank a pile that has run out shows - because it did - until the
              gathered cards land back on it at `drawAt`. The card back and its
              depth stay RENDERED underneath the rule that hides them rather than
              being swapped in by a timer, so the moment the pile reappears is the
              stylesheet's clock and cannot drift from the gather that delivers
              it. See `.wood-draw.turning` in game.css. */}
          <PileStack layers={depthLayers(faceDown)} className={`wood-draw${blanking ? ' turning' : ''}`}>
            {blanking && (
              <div className="pile-space recycle-slot wood-blank" onClick={props.onFlip} aria-hidden="true" />
            )}
            {faceDown > 0
              ? <div className="wood-back" onClick={props.onFlip}><CardBack badgeId={badgeId} /></div>
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
              /* The three delays ride on the PILE rather than on each card, and
                 the stylesheet hands them to the nth-child rules that already
                 stagger a turn. The cards themselves stay exactly the elements
                 they were: `.wood-deal > *` is the card, its transform is the
                 turn, and wrapping them to carry a style would have put a second
                 transformed box between the animation and the card. */
              <div className={`wood-deal${collecting ? ' collecting' : ''}`}
                style={Object.fromEntries(
                  timeline.delays.map((ms, i) => [`--d${i}`, `${ms}ms`])) as React.CSSProperties}
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
    <div className={`tableau-zone wood-${props.woodSide}${props.soundLauncher ? ' has-sound' : ''}`} data-hand>
      {/* The piles are their own row inside the zone. The zone centres it and
          carries the edge guards; the row is exactly as wide as the piles, which
          is what the note below is positioned against. */}
      <div className="tableau-row">
      {ends}
      {/* Over the Dash column, inside the pile row so it is measured against the
          CARDS rather than the zone - the zone is as wide as the screen. The
          same reasoning that put .wood-note here. `has-sound` above is what
          shortens the stuck note so the two never sit on each other. */}
      {props.soundLauncher}
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
