/**
 * The rooms this device created, remembered so they can be cleaned up later.
 *
 * Nothing can delete a room today, which is why this exists: `rooms/$code` now
 * grants a whole-room delete to its creator, or to anyone once it is a day old,
 * and somebody has to actually ask. The home screen does, on the way past.
 *
 * Local to the device and disposable. Losing it costs an uncollected room, not a
 * game: an expired room is deletable by ANYONE under the rule, so the next
 * device to create a room is not the only chance it will ever have.
 */
export interface OwnRoom { code: string; at: number }

const KEY = 'bz.ownRooms';
/** A cap, so a device that creates a room a day does not grow this for ever. */
const MAX = 40;

export function readOwnRooms(): OwnRoom[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((r): r is OwnRoom =>
      !!r && typeof r === 'object'
      && typeof (r as OwnRoom).code === 'string' && (r as OwnRoom).code.length > 0
      && typeof (r as OwnRoom).at === 'number' && Number.isFinite((r as OwnRoom).at));
  } catch {
    return [];
  }
}

function write(rooms: OwnRoom[]): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(rooms.slice(-MAX))); } catch { /* full or blocked */ }
}

export function rememberOwnRoom(code: string, at: number = Date.now()): void {
  write([...readOwnRooms().filter(r => r.code !== code), { code, at }]);
}

export function forgetOwnRoom(code: string): void {
  write(readOwnRooms().filter(r => r.code !== code));
}

/**
 * Which of these are old enough to sweep. Pure, so the rule can be read at a
 * glance and tested without a clock or a browser.
 *
 * `at` is THIS DEVICE's clock at the moment it created the room, while the rule
 * that admits the delete compares the SERVER's `createdAt`. That is a deliberate
 * exception to the handoff's rule against cross-device clock comparisons, and it
 * is safe because it is not a gate on anything a player can see: a fast clock
 * asks early and is refused, a slow one asks late, and either way the room is
 * swept by the next device to come past. Nothing is told it has expired.
 */
export function dueForSweep(rooms: OwnRoom[], now: number, ttlMs: number): string[] {
  return rooms.filter(r => r.at + ttlMs < now).map(r => r.code);
}
