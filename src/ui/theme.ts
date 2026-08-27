import { useCallback, useEffect, useState } from 'react';

/**
 * Three states, not two. `system` is the default and is what the app did before
 * there was a control at all: follow the phone, including its automatic switch at
 * sunset. The other two are a deliberate choice this player has made, which the
 * device is not allowed to override.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];
const KEY = 'bz.theme';

/** What the page is actually painted as right now, choice and device combined. */
export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  if (typeof matchMedia === 'undefined') return 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readTheme(): ThemeChoice {
  if (typeof localStorage === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Device-local, exactly like the wood side: it is about the phone in your hand,
 * and two players at one table can want opposite answers. Nothing about it goes
 * near the room.
 *
 * `system` writes NO attribute rather than writing `data-theme="system"`, so the
 * media query in theme.css is left to do its own job - including switching by
 * itself while the app is open, which an attribute would have frozen.
 */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  // The browser's own chrome is told separately: index.html declares one
  // theme-color per media query, and a media query cannot see an override. Left
  // to itself Safari would paint its bars for the device's theme while the page
  // painted the player's.
  const bg = resolveTheme(choice) === 'dark' ? '#171613' : '#f4f2ec';
  for (const el of document.querySelectorAll('meta[name="theme-color"]')) {
    el.setAttribute('content', bg);
    el.removeAttribute('media');
  }
}

export function useTheme(): [ThemeChoice, () => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  useEffect(() => { applyTheme(choice); }, [choice]);
  const cycle = useCallback(() => {
    setChoice(prev => {
      const next = THEME_ORDER[(THEME_ORDER.indexOf(prev) + 1) % THEME_ORDER.length];
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, next);
      } catch {
        // A private window will not remember it. It still works for this game.
      }
      return next;
    });
  }, []);
  return [choice, cycle];
}
