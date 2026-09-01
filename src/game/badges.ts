export type BadgeId =
  | 'tulip' | 'clover' | 'star' | 'bell' | 'clownfish' | 'anchor' | 'acorn' | 'boat'
  // Retired, and still BadgeIds on purpose - see BADGES.
  | 'bicycle' | 'kite';

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

/**
 * Every badge that can be DRAWN, including retired ones.
 *
 * A retired badge stays in here for as long as a room might still hold it. Every
 * render site indexes this by the id a player is carrying, and a room dealt before
 * the badge went would otherwise look up `undefined` and take the whole screen
 * down over a missing glyph. `BADGE_IDS` below is what a player can actually pick,
 * and that is the list with the retired ones taken out.
 */
export const BADGES: Record<BadgeId, Badge> = {
  tulip:   { id: 'tulip',   label: 'Tulip',   color: '#db2777', glyph: '\u{1F337}' + EMOJI },
  clover:  { id: 'clover',  label: 'Clover',  color: '#4d7c0f', glyph: '\u{1F340}' + EMOJI },
  star:    { id: 'star',    label: 'Star',    color: '#7c3aed', glyph: '⭐' + EMOJI },
  bell:    { id: 'bell',    label: 'Bell',    color: '#ea580c', glyph: '\u{1F514}' + EMOJI },
  // The kite's indigo sat a shade away from --suit-blue, and CardView puts the
  // badge plate and the suit on the SAME card. Deep reef water instead: nowhere
  // near a suit, nowhere near the anchor's cyan, and an orange fish reads on it.
  // Labelled for what the phones actually DRAW. There is no clownfish emoji, and
  // both Noto and Apple render U+1F420 as a yellow-and-blue tropical fish, so a
  // Clownfish label was describing a picture nobody was looking at. Tropical Fish
  // was the first attempt and read as two words doing one word's work. The id
  // keeps the original name because it is a live key under `badges/$badgeId`.
  clownfish: { id: 'clownfish', label: 'Fish', color: '#155e75', glyph: '\u{1F420}' + EMOJI },
  anchor:  { id: 'anchor',  label: 'Anchor',  color: '#0891b2', glyph: '⚓' + EMOJI },
  acorn:   { id: 'acorn',   label: 'Acorn',   color: '#92400e', glyph: '\u{1F330}' + EMOJI },
  boat:    { id: 'boat',    label: 'Boat',    color: '#475569', glyph: '⛵' + EMOJI },
  // Retired 2026-08-31, replaced by the clover. Not offered, still drawable.
  bicycle: { id: 'bicycle', label: 'Bicycle', color: '#0d9488', glyph: '\u{1F6B2}' + EMOJI },
  // Retired 2026-08-31, replaced by the clownfish. Not offered, still drawable.
  kite:    { id: 'kite',    label: 'Kite',    color: '#4f46e5', glyph: '\u{1FA81}' + EMOJI },
};

/**
 * The badges a player can choose, and the practical player ceiling: eight of
 * them, which is why MAX_PLAYERS is eight. Written out rather than taken from
 * BADGES, because BADGES carries retired ids that must never be offered.
 */
export const BADGE_IDS: BadgeId[] =
  ['tulip', 'clover', 'star', 'bell', 'clownfish', 'anchor', 'acorn', 'boat'];
