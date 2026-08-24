import { describe, it, expect } from 'vitest';
import { pickNextHost, allConnectedStuck } from './plays';
import type { PlayerInfo } from '../game/types';

const p = (joinedAt: number, connected: boolean, stuckAt: number | null = null): PlayerInfo =>
  ({ name: 'x', badgeId: 'tulip', joinedAt, connected, stuckAt, score: 0 });

describe('pickNextHost', () => {
  it('picks the connected player with the earliest join', () => {
    expect(pickNextHost({ a: p(200, true), b: p(100, true), c: p(50, false) })).toBe('b');
  });
  it('breaks joinedAt ties by uid, returns null when nobody is connected', () => {
    expect(pickNextHost({ b: p(100, true), a: p(100, true) })).toBe('a');
    expect(pickNextHost({ a: p(100, false) })).toBeNull();
  });
});

describe('allConnectedStuck', () => {
  it('true only when every connected player is stuck', () => {
    expect(allConnectedStuck({ a: p(1, true, 5), b: p(2, true, 9) })).toBe(true);
    expect(allConnectedStuck({ a: p(1, true, 5), b: p(2, true) })).toBe(false);
    expect(allConnectedStuck({ a: p(1, false, null), b: p(2, true, 3) })).toBe(true); // disconnected ignored
    expect(allConnectedStuck({ a: p(1, false) })).toBe(false); // nobody connected
  });
});
