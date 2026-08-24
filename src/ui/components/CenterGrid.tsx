import { CardView } from './CardView';
import type { CenterSpace } from '../../game/types';
import type { BadgeId } from '../../game/badges';

export function CenterGrid(props: {
  spaces: CenterSpace[]; highlight: number[]; badgeOf: (owner: string) => BadgeId;
  onTap: (i: number) => void;
}) {
  return (
    <div className="game-grid">
      {props.spaces.map((s, i) => {
        const top = s.stack[s.stack.length - 1];
        return (
          <div key={i} data-drop={`space:${i}`} onClick={() => props.onTap(i)}
            className={`pile-space${props.highlight.includes(i) ? ' glow' : ''}`}>
            {top && <CardView card={top} badgeId={props.badgeOf(top.owner)} />}
          </div>
        );
      })}
    </div>
  );
}
