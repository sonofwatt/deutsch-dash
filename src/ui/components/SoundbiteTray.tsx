import { SOUNDBITES, SOUNDBITE_IDS, type SoundbiteId } from '../../game/soundbites';

/**
 * The eight buttons, shared by the lobby's tray and the board's menu so a player
 * is pressing the same grid in both places.
 *
 * `data-sb` on each button is what the board's press-and-hold reads: it hit-tests
 * the pointer against these rects rather than against `elementFromPoint`, because
 * the menu sits under a dismiss backdrop and a hit test through the backdrop would
 * find the backdrop. See `hitSoundbite`.
 */
export function SoundbiteGrid(
  { onSay, armed }: { onSay(id: SoundbiteId): void; armed?: SoundbiteId | null },
) {
  return (
    <div className="soundbite-grid">
      {SOUNDBITE_IDS.map(id => (
        <button key={id} className={`soundbite${armed === id ? ' armed' : ''}`}
          data-sb={id} onClick={() => onSay(id)}
          aria-label={`Send ${SOUNDBITES[id].label}`}>
          {/* The glyph is decoration over the label, not a substitute for it: the
              label is right there underneath, so a screen reader saying both
              would say everything twice. */}
          <span className="soundbite-glyph" aria-hidden="true">{SOUNDBITES[id].glyph}</span>
          <span className="soundbite-label">{SOUNDBITES[id].label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The lobby's tray: the player's own switch, and the grid behind it.
 *
 * **The grid is only there when sound is on for this phone.** Turning it off is a
 * player saying they do not want any of this, so leaving eight buttons behind
 * would be leaving the feature on screen for somebody who has just switched it
 * off. It also keeps the switch honest: what it shows is exactly what it does.
 *
 * The lobby's tray is deliberately NOT gated on the host's `meta.soundsOn`. That
 * option governs the board. The lobby is where a table finds out these exist and
 * what they sound like, and a room that has not switched them on for play is
 * exactly the room that needs to hear them first.
 */
export interface SoundbiteTrayProps {
  on: boolean;
  onToggle(): void;
  onSay(id: SoundbiteId): void;
}

export function SoundbiteTray(props: SoundbiteTrayProps) {
  return (
    <div className="soundbites">
      <div className="row">
        <label className="muted">Sounds</label>
        <span className="spacer" />
        {/* aria-pressed rather than a checkbox, to match the wood-side and theme
            buttons either side of it. The label spells out that it is this
            device, because that is the whole of what it controls. */}
        <button className="btn btn-slim" onClick={props.onToggle} aria-pressed={props.on}
          aria-label={`Sounds are ${props.on ? 'on' : 'off'} for this phone. Turn them ${props.on ? 'off' : 'on'}.`}>
          {props.on ? 'On for this phone' : 'Off for this phone'}
        </button>
      </div>
      {props.on && <SoundbiteGrid onSay={props.onSay} />}
    </div>
  );
}
