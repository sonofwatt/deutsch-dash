/**
 * Which phone this is, for the two places the OS itself takes a swipe off the
 * edge of the screen before the page ever sees it.
 *
 * This is deliberately NOT a preference and NOT a room setting: it is a fact
 * about the device, and getting it wrong costs a player their round. iOS takes
 * an upward swipe from the bottom edge as "go home", and Android takes an
 * inward swipe from either side edge as "back" - which, from the board, is the
 * lobby. Both were reported from real tables: a thumb starting a drag on the
 * wood or Blitz pile is a thumb near an edge.
 */
export type Platform = 'ios' | 'android' | 'other';

/**
 * Pure so it can be tested without a browser. Order matters: an Android tablet
 * can carry "Linux" and a Mac string, and iPadOS 13+ lies outright.
 */
export function detectPlatform(ua: string, touchPoints = 0): Platform {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  // iPadOS 13+ reports itself as a desktop Mac and is only told apart by having
  // a touchscreen at all - no Mac has one. maxTouchPoints > 1 rather than > 0
  // because a Mac with a trackpad can report 1.
  if (/macintosh|mac os x/i.test(ua) && touchPoints > 1) return 'ios';
  return 'other';
}

/**
 * Stamped on <html> once at startup, the same way the theme is, so the guards
 * live in CSS beside the rules they adjust rather than being threaded through
 * every component. `other` writes no attribute at all, so the plain rules are
 * what a desktop gets and neither guard costs anything there.
 *
 * The absence of the attribute is load-bearing twice over: it is also how the CSS
 * asks "is this a desktop" for the motion override below.
 */
export function applyPlatform(): void {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return;
  const p = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  if (p === 'other') document.documentElement.removeAttribute('data-platform');
  else document.documentElement.setAttribute('data-platform', p);
}

/**
 * Whether the OS's reduced-motion preference gets the final say on this device.
 *
 * On a PHONE it does, and the whole reduced-motion path stays as it was. On a
 * desktop it does not, and the animations run regardless.
 *
 * That is a deliberate override of a stated preference, so the reason matters.
 * Windows exposes this as Settings > Accessibility > Visual effects > Animation
 * effects, which is a general polish-and-performance switch that plenty of people
 * turn off for reasons that have nothing to do with motion sensitivity - and
 * Chromium reports it as `prefers-reduced-motion: reduce` all the same. That false
 * positive is what took the wood flip and the falling emojis off a Windows desktop
 * while the player was asking where they had gone. A phone's reduced-motion
 * setting sits in Accessibility and means what it says, so it is left alone.
 *
 * Reads the stamped attribute rather than the user agent, so it cannot disagree
 * with the CSS: `[data-platform]` is a phone and its absence is everything else.
 */
export function honoursReducedMotion(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement.hasAttribute('data-platform');
}
