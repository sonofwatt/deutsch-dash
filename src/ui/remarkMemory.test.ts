import { describe, it, expect, beforeEach } from 'vitest';
import { forgetRemarks, recentRemarks, rememberRemarks, RECALL_ROUNDS } from './remarkMemory';

/**
 * "Cycle through them - don't re-use a remark from a previous round unless the
 * others aren't relevant."
 */
beforeEach(forgetRemarks);

describe('what the carousel remembers', () => {
  it('knows nothing about a round nothing has been drawn for', () => {
    expect(recentRemarks('ABCDEF', 1)).toEqual([]);
  });

  it('reads the rounds before this one, and never this one', () => {
    // The stability rule: `remarksForRoom` runs on every render of a sheet, so if
    // round 2 could see its own record the second render would answer differently
    // from the first.
    rememberRemarks('ABCDEF', 1, ['champion', 'bully']);
    rememberRemarks('ABCDEF', 2, ['stalled']);
    expect(recentRemarks('ABCDEF', 2)).toEqual(['champion', 'bully']);
    expect(recentRemarks('ABCDEF', 2)).toEqual(['champion', 'bully']); // twice, the same
  });

  it('keeps the FIRST answer for a round, so re-renders cannot rewrite it', () => {
    rememberRemarks('ABCDEF', 1, ['champion']);
    rememberRemarks('ABCDEF', 1, ['something-else']);
    expect(recentRemarks('ABCDEF', 2)).toEqual(['champion']);
  });

  it('lets a remark come back after it has sat out its rounds', () => {
    // Not "for ever": with six drawn a round, a whole-game memory goes cold after
    // three or four and every remark is equally stale, which is no memory at all.
    rememberRemarks('ABCDEF', 1, ['bully']);
    expect(recentRemarks('ABCDEF', 1 + RECALL_ROUNDS)).toContain('bully');
    expect(recentRemarks('ABCDEF', 1 + RECALL_ROUNDS + 1)).not.toContain('bully');
  });

  it('starts clean in a different room', () => {
    rememberRemarks('ABCDEF', 1, ['champion']);
    expect(recentRemarks('ZZZZZZ', 2)).toEqual([]);
    // and the new room's own memory works from there
    rememberRemarks('ZZZZZZ', 1, ['stalled']);
    expect(recentRemarks('ZZZZZZ', 2)).toEqual(['stalled']);
  });

  it('starts clean on a rematch, which counts from one again', () => {
    rememberRemarks('ABCDEF', 4, ['champion', 'bully']);
    rememberRemarks('ABCDEF', 5, ['stalled']);
    // A rematch resets roundNumber, and reading backwards from 1 finds nothing.
    expect(recentRemarks('ABCDEF', 1)).toEqual([]);
  });

  it('does not remember anything for a room that has no code yet', () => {
    rememberRemarks(null, 1, ['champion']);
    expect(recentRemarks(null, 2)).toEqual([]);
  });

  it('stays bounded, however long a game runs', () => {
    for (let r = 1; r <= 60; r++) rememberRemarks('ABCDEF', r, [`round-${r}`]);
    // Only the window is readable, and only the window is kept.
    const recent = recentRemarks('ABCDEF', 61);
    expect(recent).toHaveLength(RECALL_ROUNDS);
    expect(recent).toContain('round-60');
    expect(recent).not.toContain('round-1');
  });
});
