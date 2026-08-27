import { describe, it, expect } from 'vitest';
import { pickNextHost, allConnectedStuck } from './plays';
import type { PlayerInfo } from '../game/types';

const p = (joinedAt: number, connected: boolean, stuckAt: number | null = null,
           awayAt: number | null = null): PlayerInfo =>
  ({ name: 'x', badgeId: 'tulip', joinedAt, connected, stuckAt, awayAt, score: 0 });
const bot = (joinedAt: number, stuckAt: number | null = null): PlayerInfo =>
  ({ ...p(joinedAt, true, stuckAt), isBot: true, botLevel: 'medium' });

describe('pickNextHost', () => {
  it('picks the connected player with the earliest join', () => {
    expect(pickNextHost({ a: p(200, true), b: p(100, true), c: p(50, false) })).toBe('b');
  });
  it('breaks joinedAt ties by uid, returns null when nobody is connected', () => {
    expect(pickNextHost({ b: p(100, true), a: p(100, true) })).toBe('a');
    expect(pickNextHost({ a: p(100, false) })).toBeNull();
  });
  it('never hands the room to a bot, however early it joined', () => {
    // A bot's connected flag is written once and never cleared, so without the
    // isBot filter it would always look like the longest-present live player -
    // and it has no client to actually run the room with.
    expect(pickNextHost({ bot_star: bot(1), human: p(500, true) })).toBe('human');
    // the only "connected" player being a bot means there is nobody to promote
    expect(pickNextHost({ bot_star: bot(1), human: p(500, false) })).toBeNull();
  });
});

describe('allConnectedStuck', () => {
  it('true only when every connected player is stuck', () => {
    expect(allConnectedStuck({ a: p(1, true, 5), b: p(2, true, 9) })).toBe(true);
    expect(allConnectedStuck({ a: p(1, true, 5), b: p(2, true) })).toBe(false);
    expect(allConnectedStuck({ a: p(1, false, null), b: p(2, true, 3) })).toBe(true); // disconnected ignored
    expect(allConnectedStuck({ a: p(1, false) })).toBe(false); // nobody connected
  });

  it('ignores an away player exactly as it ignores a disconnected one', () => {
    // The hang this fixes: an idle player has legal moves, so is quite correctly
    // never stuck, and the table waits on them forever.
    const away = p(2, true, null, 7000);
    expect(allConnectedStuck({ a: p(1, true, 5), b: away })).toBe(true);
    // Away AND stuck is still just away - one flag is enough to skip them.
    expect(allConnectedStuck({ a: p(1, true, 5), b: p(2, true, 3, 7000) })).toBe(true);
  });

  it('is false when everybody is away - an empty table has nothing to rotate for', () => {
    expect(allConnectedStuck({ a: p(1, true, 5, 7000), b: p(2, true, null, 7100) })).toBe(false);
  });

  it('still waits on a player who is present and not stuck', () => {
    expect(allConnectedStuck({ a: p(1, true, 5), b: p(2, true), c: p(3, true, 9, 7000) })).toBe(false);
  });
});
