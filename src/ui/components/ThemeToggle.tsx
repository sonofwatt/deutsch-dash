import { resolveTheme, useTheme, type ThemeChoice } from '../theme';

const LABEL: Record<ThemeChoice, string> = {
  system: 'Theme: following your phone',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

/**
 * Fixed to the top right of every screen, because it has to be reachable from
 * the board as well as from the lobby and there is no shared header to hang it
 * on. The board reserves room for it (.game-head's padding) rather than letting
 * it sit over the connection pill.
 *
 * Three states in a cycle, and the glyph says which: the half-moon is "follow the
 * phone", the sun and the moon are a choice. A cycle rather than three buttons
 * because it is a preference somebody sets once, in a corner, with a thumb.
 */
export function ThemeToggle() {
  const [choice, cycle] = useTheme();
  const glyph = choice === 'system' ? '◐' : choice === 'light' ? '☀' : '☾';
  return (
    <button className="theme-toggle" onClick={cycle} aria-label={`${LABEL[choice]}. Tap to change.`}
      title={LABEL[choice]} data-resolved={resolveTheme(choice)}>
      {glyph}
    </button>
  );
}
