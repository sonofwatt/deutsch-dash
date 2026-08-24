import { BADGES, BADGE_IDS, type BadgeId } from '../../game/badges';

export function BadgePicker(props: {
  value: BadgeId | null; onChange: (b: BadgeId) => void; taken: BadgeId[];
}) {
  return (
    <div className="badge-grid" role="radiogroup" aria-label="Pick your badge">
      {BADGE_IDS.map(id => {
        const b = BADGES[id];
        const taken = props.taken.includes(id);
        return (
          <button key={id} role="radio" aria-checked={props.value === id} disabled={taken}
            className={`badge-chip${props.value === id ? ' selected' : ''}`}
            style={{ ['--badge' as string]: b.color }}
            onClick={() => props.onChange(id)}>
            <span className="badge-glyph">{b.glyph}</span>
            <span>{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}
