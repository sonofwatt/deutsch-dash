export type BadgeId =
  | 'tulip' | 'bicycle' | 'star' | 'bell' | 'kite' | 'anchor' | 'acorn' | 'boat';

export interface Badge { id: BadgeId; label: string; color: string; glyph: string }

export const BADGES: Record<BadgeId, Badge> = {
  tulip:   { id: 'tulip',   label: 'Tulip',   color: '#db2777', glyph: '\u{1F337}' },
  bicycle: { id: 'bicycle', label: 'Bicycle', color: '#0d9488', glyph: '\u{1F6B2}' },
  star:    { id: 'star',    label: 'Star',    color: '#7c3aed', glyph: '⭐' },
  bell:    { id: 'bell',    label: 'Bell',    color: '#ea580c', glyph: '\u{1F514}' },
  kite:    { id: 'kite',    label: 'Kite',    color: '#4f46e5', glyph: '\u{1FA81}' },
  anchor:  { id: 'anchor',  label: 'Anchor',  color: '#0891b2', glyph: '⚓' },
  acorn:   { id: 'acorn',   label: 'Acorn',   color: '#92400e', glyph: '\u{1F330}' },
  boat:    { id: 'boat',    label: 'Boat',    color: '#475569', glyph: '⛵' },
};

export const BADGE_IDS = Object.keys(BADGES) as BadgeId[];
