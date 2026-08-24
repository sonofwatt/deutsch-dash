import type { Rng } from '../game/deck';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(rng: Rng = Math.random): string {
  return Array.from({ length: 6 },
    () => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join('');
}
