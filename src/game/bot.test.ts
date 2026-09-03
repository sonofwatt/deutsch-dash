import { describe, it, expect } from 'vitest';
import { BOT_PROFILES, botDelay, botId, botMoves, chooseBotAction, isBotId, rankMove,
  type BotLevel } from './bot';
import type { Card, CenterSpace, Suit, Tableau } from './types';

const c = (v: number, suit: Suit, owner = 'bot'): Card => ({ v, suit, owner });
const tab = (p: Partial<Tableau> = {}): Tableau =>
  ({ dash: [], post: [[], [], []], wood: [], woodIndex: 0, ...p });
const spaces = (n = 2, stacks: Record<number, Card[]> = {}): CenterSpace[] =>
  Array.from({ length: n }, (_, i) => ({ stack: stacks[i] ?? [], history: [] }));
/** rng that walks a fixed script, so "random" choices are assertable */
const scripted = (...values: number[]) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

describe('botMoves', () => {
  it('finds centre plays and post builds, never a post onto itself', () => {
    const t = tab({ dash: [c(1, 'red')], post: [[c(8, 'red')], [c(7, 'green')], []] });
    const moves = botMoves(t, spaces(2));
    expect(moves).toContainEqual({ kind: 'center', source: { kind: 'dash' }, space: 0 });
    expect(moves).toContainEqual({ kind: 'post', source: { kind: 'post', index: 1 }, post: 0 });
    expect(moves.some(m => m.kind === 'post' && m.source.kind === 'post' && m.source.index === m.post)).toBe(false);
  });
  it('reuses a space whose pile was cleared away', () => {
    const cleared: CenterSpace = { stack: [], history: [Array.from({ length: 10 }, (_, i) => c(i + 1, 'blue'))] };
    expect(botMoves(tab({ dash: [c(1, 'red')] }), [cleared]))
      .toEqual([{ kind: 'center', source: { kind: 'dash' }, space: 0 }]);
  });
});

describe('rankMove', () => {
  it('rates emptying the Dash pile above everything else', () => {
    const t = tab({ dash: [c(1, 'red')], post: [[c(2, 'blue')], [], []], wood: [c(1, 'green')], woodIndex: 1 });
    const fromDash = rankMove(t, { kind: 'center', source: { kind: 'dash' }, space: 0 });
    const fromWood = rankMove(t, { kind: 'center', source: { kind: 'wood' }, space: 0 });
    expect(fromDash).toBeGreaterThan(fromWood);
  });
  it('rates emptying a post above a deeper one, because the Dash pile refills it', () => {
    const t = tab({ dash: [c(9, 'red')], post: [[c(1, 'blue')], [c(1, 'green'), c(2, 'green')], []] });
    const frees = rankMove(t, { kind: 'center', source: { kind: 'post', index: 0 }, space: 0 });
    const deep = rankMove(t, { kind: 'center', source: { kind: 'post', index: 1 }, space: 0 });
    expect(frees).toBeGreaterThan(deep);
  });
});

describe('chooseBotAction', () => {
  const t = tab({ dash: [c(1, 'red')], post: [[c(1, 'blue')], [], []], wood: [c(1, 'green')], woodIndex: 1 });

  it('a hard bot takes the best move on the board', () => {
    const a = chooseBotAction(t, spaces(2), 'hard', scripted(0.99));
    expect(a).toEqual({ kind: 'center', source: { kind: 'dash' }, space: 0 });
  });
  it('a sloppy roll still only ever returns a legal move', () => {
    const legal = botMoves(t, spaces(2));
    for (const r of [0, 0.3, 0.5, 0.9]) {
      const a = chooseBotAction(t, spaces(2), 'easy', scripted(0.99, 0.0, r, r));
      if (a && a.kind !== 'flip') expect(legal).toContainEqual(a);
    }
  });
  it('fumbles a whole turn far more often on easy than on hard', () => {
    // a roll of 0.2 is inside easy's dither band and well outside hard's
    expect(chooseBotAction(t, spaces(2), 'easy', scripted(0.2))).toBeNull();
    expect(chooseBotAction(t, spaces(2), 'hard', scripted(0.2))).not.toBeNull();
  });
  it('turns wood over when nothing is playable, and gives up when there is none', () => {
    // explicit rng: every level can dither now, so Math.random would make this flaky
    const stuck = tab({ dash: [c(9, 'red')], wood: [c(9, 'blue')], woodIndex: 1 });
    expect(chooseBotAction(stuck, spaces(1, { 0: [c(1, 'red')] }), 'hard', scripted(0.99)))
      .toEqual({ kind: 'flip' });
    const bare = tab({ dash: [c(9, 'red')] });
    expect(chooseBotAction(bare, spaces(1, { 0: [c(1, 'red')] }), 'hard', scripted(0.99))).toBeNull();
  });
});

describe('difficulty is mostly speed', () => {
  it('each level draws its delay from its own band, fastest to slowest', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const p = BOT_PROFILES[level];
      expect(botDelay(level, () => 0)).toBe(p.minDelay);
      expect(botDelay(level, () => 1)).toBe(p.maxDelay);
    }
    expect(BOT_PROFILES.hard.maxDelay).toBeLessThan(BOT_PROFILES.medium.maxDelay);
    expect(BOT_PROFILES.medium.maxDelay).toBeLessThan(BOT_PROFILES.easy.maxDelay);
  });

  it('every handicap moves the same way, so the levels cannot cross over', () => {
    const [easy, medium, hard] = [BOT_PROFILES.easy, BOT_PROFILES.medium, BOT_PROFILES.hard];
    for (const knob of ['sloppiness', 'dither', 'distracted'] as const) {
      expect(easy[knob]).toBeGreaterThan(medium[knob]);
      expect(medium[knob]).toBeGreaterThan(hard[knob]);
    }
  });

  it('every level is slower than the first cut, which beat a casual human on easy', () => {
    // effective seconds per action = mean delay / (1 - dither); previously 3.3 / 1.3 / 0.5
    const rate = (l: 'easy' | 'medium' | 'hard') => {
      const p = BOT_PROFILES[l];
      return (p.minDelay + p.maxDelay) / 2 / 1000 / (1 - p.dither);
    };
    expect(rate('easy')).toBeGreaterThan(4);
    expect(rate('medium')).toBeGreaterThan(2);
    expect(rate('hard')).toBeGreaterThan(1);
  });
});

describe('bot ids', () => {
  it('are derived from the badge, which is unique per room', () => {
    expect(botId('star')).toBe('bot_star');
    expect(isBotId('bot_star')).toBe(true);
    expect(isBotId('kR3xAbC')).toBe(false);
  });
});

describe('the difficulty ladder', () => {
  // The whole ladder moved down: medium inherited easy's settings and hard
  // inherited medium's, because Easy was still beating a casual human. Pinned as
  // an ORDER rather than as numbers, so the next retune cannot accidentally put a
  // level out of sequence.
  const rate = (l: BotLevel) => {
    const p = BOT_PROFILES[l];
    return ((p.minDelay + p.maxDelay) / 2) / (1 - p.dither);
  };

  it('gets strictly faster the harder it gets', () => {
    expect(rate('easy')).toBeGreaterThan(rate('medium'));
    expect(rate('medium')).toBeGreaterThan(rate('hard'));
    expect(rate('hard')).toBeGreaterThan(rate('genius'));
  });

  it('gets strictly more attentive the harder it gets', () => {
    const levels: BotLevel[] = ['easy', 'medium', 'hard', 'genius'];
    for (let i = 1; i < levels.length; i++) {
      expect(BOT_PROFILES[levels[i]].sloppiness).toBeLessThan(BOT_PROFILES[levels[i - 1]].sloppiness);
      expect(BOT_PROFILES[levels[i]].dither).toBeLessThanOrEqual(BOT_PROFILES[levels[i - 1]].dither);
    }
  });

  it('makes Genius about twice the bot Hard used to be', () => {
    // Hard was ~1.1s per action before the ladder moved; Genius is the level that
    // was asked for as "twice as good as the current Hard".
    expect(rate('genius')).toBeGreaterThan(400);
    expect(rate('genius')).toBeLessThan(700);
  });

  it('never dithers or wanders as Genius - it simply takes the best move', () => {
    const t = tab({ dash: [c(1, 'red')] });
    const spaces = [{ stack: [], history: [] }];
    // rng at its most unhelpful: any sloppiness or dither would show here.
    const action = chooseBotAction(t, spaces, 'genius', () => 0.5);
    expect(action).toEqual({ kind: 'center', source: { kind: 'dash' }, space: 0 });
  });
});

describe('botLevelOf', () => {
  it('drives at medium when the record carries a level that does not exist', async () => {
    // BOT_PROFILES[level] on an unknown value is undefined and throws from inside
    // the snapshot handler, on the host - the one client that drives the bots.
    const { botLevelOf } = await import('./bot');
    expect(botLevelOf('genius')).toBe('genius');
    expect(botLevelOf('impossible')).toBe('medium');
    expect(botLevelOf('hasOwnProperty')).toBe('medium');
    expect(botLevelOf(undefined)).toBe('medium');
  });
});
