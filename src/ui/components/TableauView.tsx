import type React from 'react';
import { CardBack, CardView } from './CardView';
import type { BadgeId } from '../../game/badges';
import { cardId, type Card, type PlaySource, type Tableau } from '../../game/types';

export function TableauView(props: {
  t: Tableau; badgeId: BadgeId; selection: PlaySource | null; postHighlight: number[];
  onSelect: (s: PlaySource) => void; onFlip: () => void; onTapPost: (i: number) => void;
  startDrag: (e: React.PointerEvent, card: Card, source: PlaySource) => void;
}) {
  const { t, badgeId } = props;
  const woodTop = t.woodIndex > 0 ? t.wood[t.woodIndex - 1] : null;
  const blitzTop = t.blitz[t.blitz.length - 1] ?? null;
  const sel = JSON.stringify(props.selection);
  const isSel = (s: PlaySource) => sel === JSON.stringify(s);

  return (
    <div className="tableau-zone">
      <div>
        <div style={{ position: 'relative' }} onClick={props.onFlip}>
          {t.wood.length > t.woodIndex ? <CardBack badgeId={badgeId} /> : <div className="pile-space" />}
          {woodTop && (
            <div style={{ position: 'absolute', inset: 0 }}
              onClick={e => { e.stopPropagation(); props.onSelect({ kind: 'wood' }); }}
              onPointerDown={e => props.startDrag(e, woodTop, { kind: 'wood' })}>
              <CardView card={woodTop} badgeId={badgeId} selected={isSel({ kind: 'wood' })} flipKey={t.woodIndex} />
            </div>
          )}
        </div>
        <div className="pile-label">wood {t.wood.length}</div>
      </div>

      {t.post.map((stack, i) => {
        const top = stack[stack.length - 1] ?? null;
        const source: PlaySource = { kind: 'post', index: i };
        return (
          <div key={i}>
            <div data-drop={`post:${i}`} onClick={() => props.onTapPost(i)}
              className={`pile-space${props.postHighlight.includes(i) ? ' glow' : ''}`}>
              {top && (
                <div onClick={e => { e.stopPropagation(); props.onSelect(source); }}
                  onPointerDown={e => props.startDrag(e, top, source)}>
                  <CardView card={top} badgeId={badgeId} selected={isSel(source)} layoutId={cardId(top)} />
                </div>
              )}
            </div>
            <div className="pile-label">{stack.length > 1 ? `+${stack.length - 1}` : ' '}</div>
          </div>
        );
      })}

      <div>
        <div style={{ position: 'relative' }}>
          {blitzTop ? (
            <div onClick={() => props.onSelect({ kind: 'blitz' })}
              onPointerDown={e => props.startDrag(e, blitzTop, { kind: 'blitz' })}>
              <CardView card={blitzTop} badgeId={badgeId} selected={isSel({ kind: 'blitz' })} layoutId={cardId(blitzTop)} />
              <span className="count-bubble">{t.blitz.length}</span>
            </div>
          ) : <div className="pile-space" />}
        </div>
        <div className="pile-label">blitz</div>
      </div>
    </div>
  );
}
