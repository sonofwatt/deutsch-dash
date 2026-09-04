import { describe, it, expect } from 'vitest';
import { BADGES, BADGE_IDS, badgeFor, isBadgeId, UNKNOWN_BADGE } from './badges';

describe('badgeFor', () => {
  // A player's badgeId is whatever their own client wrote. Indexing BADGES with
  // an unknown key and reading .color off the result used to take the whole
  // screen down for every other client in the room.
  it('draws every badge that exists, retired ones included', () => {
    for (const id of Object.keys(BADGES)) expect(badgeFor(id)).toBe(BADGES[id as keyof typeof BADGES]);
  });
  it('draws a plain grey badge for anything else', () => {
    for (const id of ['', 'unicorn', 'constructor', '__proto__', 7, null, undefined, {}]) {
      expect(badgeFor(id)).toBe(UNKNOWN_BADGE);
    }
  });
  it('only offers the badges a player can pick', () => {
    for (const id of BADGE_IDS) expect(isBadgeId(id)).toBe(true);
    expect(isBadgeId('toString')).toBe(false);
  });
});
