import { resolveTheme, useTheme, type ThemeChoice } from '../theme';

const LABEL: Record<ThemeChoice, string> = {
  system: 'Theme: following your phone',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

/**
 * The button only - deliberately unpositioned, so the same component can sit in
 * the board's head pill beside the wood swap and the sit-out button, and alone
 * in the fixed corner pill on every other screen. Its caller owns where it goes.
 *
 * Three states in a cycle, and the glyph says which: the half-moon is "follow the
 * phone", the sun and the moon are a choice. A cycle rather than three buttons
 * because it is a preference somebody sets once, in a corner, with a thumb.
 */
export function ThemeToggle() {
  const [choice, cycle] = useTheme();
  const glyph = choice === 'system' ? '◐' : choice === 'light' ? '☀' : '☾';
  return (
    <button className="side-swap" onClick={cycle} aria-label={`${LABEL[choice]}. Tap to change.`}
      title={LABEL[choice]} data-resolved={resolveTheme(choice)}>
      {glyph}
    </button>
  );
}
