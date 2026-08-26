export type BadgeId =
  | 'tulip' | 'bicycle' | 'star' | 'bell' | 'kite' | 'anchor' | 'acorn' | 'boat';

export interface Badge { id: BadgeId; label: string; color: string; glyph: string }

/**
 * U+FE0F, VARIATION SELECTOR-16: "render the previous character as an emoji".
 *
 * Without it the glyph is at the mercy of font fallback, and a monochrome outline
 * from an earlier font in the chain wins for anything that also has a text form -
 * which is why ⚓ and 😇 came out as black line drawings while 💩 and ⭐ did not.
 * Redundant for codepoints that already default to emoji presentation, and
 * harmless there, so it goes on all of them rather than on a list to keep in sync.
 */
export const EMOJI = '\uFE0F';

export const BADGES: Record<BadgeId, Badge> = {
  tulip:   { id: 'tulip',   label: 'Tulip',   color: '#db2777', glyph: '\u{1F337}' + EMOJI },
  bicycle: { id: 'bicycle', label: 'Bicycle', color: '#0d9488', glyph: '\u{1F6B2}' + EMOJI },
  star:    { id: 'star',    label: 'Star',    color: '#7c3aed', glyph: '⭐' + EMOJI },
  bell:    { id: 'bell',    label: 'Bell',    color: '#ea580c', glyph: '\u{1F514}' + EMOJI },
  kite:    { id: 'kite',    label: 'Kite',    color: '#4f46e5', glyph: '\u{1FA81}' + EMOJI },
  anchor:  { id: 'anchor',  label: 'Anchor',  color: '#0891b2', glyph: '⚓' + EMOJI },
  acorn:   { id: 'acorn',   label: 'Acorn',   color: '#92400e', glyph: '\u{1F330}' + EMOJI },
  boat:    { id: 'boat',    label: 'Boat',    color: '#475569', glyph: '⛵' + EMOJI },
};

export const BADGE_IDS = Object.keys(BADGES) as BadgeId[];
