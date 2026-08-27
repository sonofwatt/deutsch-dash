import type React from 'react';
import { CardBack, CardView } from './CardView';
import { PileStack, depthLayers } from './PileStack';
import type { BadgeId } from '../../game/badges';
import type { WoodSide } from '../prefs';
import { cardId, type Card, type PlaySource, type Tableau } from '../../game/types';

export function TableauView(props: {
  t: Tableau; badgeId: BadgeId; selection: PlaySource | null; postHighlight: number[];
  onSelect: (s: PlaySource) => void; onFlip: () => void; onTapPost: (i: number) => void;
  startDrag: (e: React.PointerEvent, card: Card, source: PlaySource) => void;
  /** Optional: which end the wood pile sits at. Defaults to the right thumb. */
  woodSide?: WoodSide;
}) {
  const { t, badgeId } = props;
  const woodTop = t.woodIndex > 0 ? t.wood[t.woodIndex - 1] : null;
  const blitzTop = t.blitz[t.blitz.length - 1] ?? null;
  const sel = JSON.stringify(props.selection);
  const isSel = (s: PlaySource) => sel === JSON.stringify(s);

  const faceDown = t.wood.length - t.woodIndex; // still to be turned over
  const faceUp = t.woodIndex;                   // already turned over, top is playable
  // Every wood card has been turned over at least once: the next flip recycles the
  // pile from the start and deals 3 again (or whatever is left, see flipWood).
  // Tapping the empty draw slot is the recycle. It carries no glyph: a ↻ on the
  // card was in the way, and a ↻ in the slot was still one more thing on a board
  // that has enough on it. The slot going solid is the cue.
  const canRecycle = faceDown === 0 && t.wood.length > 0;

  // Wood is the pile a player touches most - every flip of three is another tap -
  // so it sits under a thumb, and which thumb is a preference (see prefs.ts).
  // Only the two ends trade places: the posts stay in the middle, because moving
  // them would shuffle four positions to fix one.
  const blitzGroup = (
      <div key="blitz">
        <PileStack layers={depthLayers(t.blitz.length)}>
          {blitzTop ? (
            <div onClick={() => props.onSelect({ kind: 'blitz' })}
              onPointerDown={e => props.startDrag(e, blitzTop, { kind: 'blitz' })}>
              <CardView key={cardId(blitzTop)} card={blitzTop} badgeId={badgeId} selected={isSel({ kind: 'blitz' })} layoutId={cardId(blitzTop)} />
            </div>
          ) : <div className="pile-space" />}
        </PileStack>
        {/* The count used to be a bubble pinned to the card's corner, over the
            card art. Every pile now says how many cards it holds in the same
            place, in the same way: on the label underneath. */}
        <div className="pile-label">blitz {t.blitz.length}</div>
      </div>
  );

  const postGroups = t.post.map((stack, i) => {
        const top = stack[stack.length - 1] ?? null;
        const source: PlaySource = { kind: 'post', index: i };
        return (
          <div key={i}>
            <PileStack layers={depthLayers(stack.length)} data-drop={`post:${i}`}
              onClick={() => props.onTapPost(i)}>
              <div className={`pile-space${props.postHighlight.includes(i) ? ' glow' : ''}`}>
                {top && (
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <PileStack layers={depthLayers(faceDown)}>
            {faceDown > 0
              ? <div onClick={props.onFlip}><CardBack badgeId={badgeId} /></div>
              : <div className={`pile-space${canRecycle ? ' recycle-slot' : ''}`}
                  onClick={props.onFlip} title={canRecycle ? 'Recycle wood' : undefined} />}
          </PileStack>
          <PileStack layers={Math.min(2, faceUp - 1)}>
            {/* No recycle button on the face-up card. It sat on top of the card the
                thumb reaches for, covering .card-badge entirely at every card size,
                and the empty draw slot beside it already carries the ↻. */}
            {woodTop ? (
              <div onClick={() => props.onSelect({ kind: 'wood' })}
                onPointerDown={e => props.startDrag(e, woodTop, { kind: 'wood' })}>
                <CardView card={woodTop} badgeId={badgeId} selected={isSel({ kind: 'wood' })} flipKey={t.woodIndex} />
              </div>
            ) : <div className="pile-space" />}
          </PileStack>
        </div>
        <div className="pile-label">wood {t.wood.length}</div>
      </div>
  );

  const ends = props.woodSide === 'left'
    ? [woodGroup, ...postGroups, blitzGroup]
    : [blitzGroup, ...postGroups, woodGroup];
  return (
    <div className={`tableau-zone${t.post.length >= 5 ? ' tight' : ''}`}>{ends}</div>
  );
}
