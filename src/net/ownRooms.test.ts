import { describe, it, expect } from 'vitest';
import { dueForSweep } from './ownRooms';

describe('dueForSweep', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const rooms = [
    { code: 'OLD1', at: 1_000 },
    { code: 'OLD2', at: 2_000 },
    { code: 'FRESH', at: 10 * DAY },
  ];

  it('offers only the rooms past the expiry the rule enforces', () => {
    // The rule admits a stranger's delete at createdAt + 24h. Asking earlier is
    // simply refused, so the client asks for nothing it cannot have.
    expect(dueForSweep(rooms, 10 * DAY, DAY)).toEqual(['OLD1', 'OLD2']);
  });

  it('leaves a room alone on the boundary, and takes it a millisecond later', () => {
    // Strictly past, matching the rule's own `<`, so the two cannot disagree
    // about a room that is exactly a day old.
    expect(dueForSweep([{ code: 'EDGE', at: 0 }], DAY, DAY)).toEqual([]);
    expect(dueForSweep([{ code: 'EDGE', at: 0 }], DAY + 1, DAY)).toEqual(['EDGE']);
  });

  it('sweeps nothing from an empty or brand-new device', () => {
    expect(dueForSweep([], Date.now(), DAY)).toEqual([]);
    expect(dueForSweep([{ code: 'NEW', at: Date.now() }], Date.now(), DAY)).toEqual([]);
  });
});
