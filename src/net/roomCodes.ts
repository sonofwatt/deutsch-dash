import type { Rng } from '../game/deck';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A uniform draw from the platform's random source. Nothing observable seeds the
 * code, so this is hygiene rather than a defence, but a room code is the room's
 * credential and Math.random is not meant for credentials.
 */
function secureRandom(): number {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return (word[0] ?? 0) / 2 ** 32;
}

export function makeRoomCode(rng: Rng = secureRandom): string {
  return Array.from({ length: 6 },
    () => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join('');
}
