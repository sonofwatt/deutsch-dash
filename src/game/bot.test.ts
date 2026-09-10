import { describe, it, expect } from 'vitest';
import { BOT_PROFILES, botDelay, botId, botMoves, botReachStep, botWoodStep, chooseBotAction,
  dashPlanBonus, hasCenterPlay, HESITATE_CHANCE, HESITATE_MS, isBotId, rankMove, rewindMoves,
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
    // space 1, not space 0: the move is chosen on its merits and then aimed at the
    // lowest space that will take the card. See lowestSpaceFor.
    const a = chooseBotAction(t, spaces(2), 'hard', scripted(0.99));
    expect(a).toEqual({ kind: 'center', source: { kind: 'dash' }, space: 1 });
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
    // Two rolls now, in this order: the band, then whether to hesitate. A high
    // second roll is the turn that does NOT hesitate, which is the band on its own.
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const p = BOT_PROFILES[level];
      expect(botDelay(level, scripted(0, 1))).toBe(p.minDelay);
      expect(botDelay(level, scripted(1, 1))).toBe(p.maxDelay);
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

describe('the hesitation', () => {
  // "I play a 5 from my wood pile, I also have a 6 on one of my middle piles. I
  // don't have time to go for that 6 before the bot has already placed their 6."
  // That moment is what the game is about, and a bot answering it instantly takes
  // it away rather than contesting it.
  it('adds 800ms to the turn when the roll says hesitate', () => {
    const p = BOT_PROFILES.hard;
    expect(botDelay('hard', scripted(0, 0))).toBe(p.minDelay + HESITATE_MS);
    expect(botDelay('hard', scripted(1, 0))).toBe(p.maxDelay + HESITATE_MS);
  });

  it('leaves the turn alone when it does not', () => {
    // "It's fine if they're that fast on occasion" - so a third of the time the
    // bot is exactly as quick as it always was.
    const p = BOT_PROFILES.hard;
    expect(botDelay('hard', scripted(0, 0.99))).toBe(p.minDelay);
  });

  it('hesitates about two turns in three, over a real run of rolls', () => {
    // The rate itself, measured rather than read off the constant, so a change to
    // how the roll is taken cannot quietly move it.
    //
    // The BAND roll is pinned to zero and only the hesitation roll varies, which
    // is what makes the two outcomes tellable apart at all: `min + 800` is still
    // inside the band for every level, so a delay alone says nothing.
    let seed = 12345;
    let call = 0;
    const rng = () => {
      call++;
      if (call % 2 === 1) return 0; // the band: always its floor
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const floor = BOT_PROFILES.medium.minDelay;
    const runs = 4000;
    let slow = 0;
    for (let i = 0; i < runs; i++) if (botDelay('medium', rng) > floor) slow++;
    expect(slow / runs).toBeGreaterThan(HESITATE_CHANCE - 0.05);
    expect(slow / runs).toBeLessThan(HESITATE_CHANCE + 0.05);
  });

  it('applies at every level, because it is not a difficulty knob', () => {
    // The complaint is about a human having time to reach for a card they have
    // already seen, and that is the same length of time whoever they are playing.
    for (const level of ['easy', 'medium', 'hard', 'genius'] as const) {
      const p = BOT_PROFILES[level];
      expect(botDelay(level, scripted(0, 0))).toBe(p.minDelay + HESITATE_MS);
    }
  });

  it('never makes a bot slower than the level below it was already', () => {
    // The ladder still has to be a ladder: the whole point of a hesitation
    // everybody gets is that it moves nobody's place in it.
    const worst = (l: BotLevel) => BOT_PROFILES[l].maxDelay + HESITATE_MS;
    const best = (l: BotLevel) => BOT_PROFILES[l].minDelay;
    for (const [faster, slower] of [['genius', 'hard'], ['hard', 'medium'], ['medium', 'easy']] as const) {
      expect(worst(faster)).toBeLessThan(worst(slower));
      expect(best(faster)).toBeLessThan(best(slower));
    }
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

describe('where on the board a bot puts its card', () => {
  // Asked for on 2026-09-10: bots opening spaces along the top row put their cards
  // as far from the eye as the board allows, which on a big screen is a long way
  // from the hand the player is watching. Every level, because it is not a
  // handicap in either direction - nothing about the play changes but where it
  // lands.
  it('takes the lowest space that would have the card, not the first', () => {
    const t = tab({ dash: [c(1, 'red')] });
    expect(chooseBotAction(t, spaces(4), 'hard', scripted(0.99)))
      .toEqual({ kind: 'center', source: { kind: 'dash' }, space: 3 });
  });

  it('does it on a sloppy roll too, which is most rolls at the bottom of the ladder', () => {
    // dither missed, sloppiness hit, no wood to be distracted by, first move drawn
    const t = tab({ dash: [c(1, 'red')] });
    expect(chooseBotAction(t, spaces(4), 'easy', scripted(0.99, 0, 0)))
      .toEqual({ kind: 'center', source: { kind: 'dash' }, space: 3 });
  });

  it('only moves down to a space that would ACTUALLY take the card', () => {
    // a red 2 has one home on this board however far down the empty ones go
    const t = tab({ dash: [c(2, 'red')] });
    expect(chooseBotAction(t, spaces(4, { 0: [c(1, 'red')] }), 'hard', scripted(0.99)))
      .toEqual({ kind: 'center', source: { kind: 'dash' }, space: 0 });
  });

  it('picks the lower of two piles that would both continue the run', () => {
    const t = tab({ dash: [c(2, 'red')] });
    const board = spaces(4, { 0: [c(1, 'red')], 2: [c(1, 'red')] });
    expect(chooseBotAction(t, board, 'hard', scripted(0.99)))
      .toEqual({ kind: 'center', source: { kind: 'dash' }, space: 2 });
  });
});

describe('the Genius cheats', () => {
  /** Nothing playable, nothing buildable, and an Ace one turn back up the wood. */
  const turnedPast = tab({
    dash: [c(9, 'red')],
    post: [[c(9, 'blue')], [c(9, 'green')], [c(9, 'yellow')]],
    wood: [c(5, 'red'), c(6, 'red'), c(1, 'blue'), c(7, 'red'), c(8, 'red'), c(4, 'green')],
    woodIndex: 6,
  });

  it('deals the wood one card at a time on every third lap, and only for Genius', () => {
    expect([0, 1, 2, 3, 4, 5].map(l => botWoodStep('genius', l))).toEqual([3, 3, 1, 3, 3, 1]);
    expect([0, 1, 2, 3].map(l => botWoodStep('hard', l))).toEqual([3, 3, 3, 3]);
  });

  it('never turns more of the pile than the table is turning', () => {
    // the host's deadlock rescue is already a card at a time for everybody, and
    // the cheat may only ever make a pile more reachable, never less
    expect(botWoodStep('genius', 0, 1)).toBe(1);
    expect(botWoodStep('genius', 2, 1)).toBe(1);
  });

  it('is judged on what a one-card lap reaches, because it gets one', () => {
    expect(botReachStep('genius')).toBe(1);
    expect(botReachStep('hard')).toBe(3);
    expect(botReachStep('easy')).toBe(3);
  });

  it('steps back to a card it turned past; every other level turns three more', () => {
    expect(chooseBotAction(turnedPast, spaces(2), 'genius', () => 0.99))
      .toEqual({ kind: 'rewind', turns: 1 });
    expect(chooseBotAction(turnedPast, spaces(2), 'hard', () => 0.99))
      .toEqual({ kind: 'flip' });
  });

  it('offers a rewind only for a card it could put on the BOARD', () => {
    // a full board with the blue Ace already down: nothing back up the pile is
    // worth going back for any more
    expect(rewindMoves(turnedPast, spaces(2), 3)).toEqual([{ kind: 'rewind', turns: 1 }]);
    expect(rewindMoves(turnedPast, spaces(1, { 0: [c(1, 'blue')] }), 3)).toEqual([]);
  });

  it('never rewinds past a card it could play this instant', () => {
    const holding = { ...turnedPast, dash: [c(1, 'red')] };
    expect(chooseBotAction(holding, spaces(2), 'genius', () => 0.99))
      .toEqual({ kind: 'center', source: { kind: 'dash' }, space: 1 });
  });

  it('rewinds rather than shuffle cards between posts, which wins nothing', () => {
    const shuffling = { ...turnedPast, post: [[c(9, 'blue')], [c(8, 'green')], []] };
    expect(chooseBotAction(shuffling, spaces(2), 'genius', () => 0.99))
      .toEqual({ kind: 'rewind', turns: 1 });
    // the same hand at Hard: the post build is the only move it can see
    expect(chooseBotAction(shuffling, spaces(2), 'hard', () => 0.99))
      .toEqual({ kind: 'post', source: { kind: 'post', index: 1 }, post: 0 });
  });

  it('plays off the whole Dash pile, not just the card on top of it', () => {
    // Two Aces to choose from. Freeing a post outranks a wood play for anybody who
    // can only see the top of their Dash pile - but the green Ace is what lets the
    // buried green 2 out, and only Genius knows the green 2 is there.
    const buried = tab({
      dash: [c(2, 'green'), c(9, 'blue')],
      post: [[c(1, 'red')], [c(9, 'yellow')], [c(8, 'blue')]],
      wood: [c(1, 'green')], woodIndex: 1,
    });
    expect(chooseBotAction(buried, spaces(3), 'hard', () => 0.99))
      .toEqual({ kind: 'center', source: { kind: 'post', index: 0 }, space: 2 });
    expect(chooseBotAction(buried, spaces(3), 'genius', () => 0.99))
      .toEqual({ kind: 'center', source: { kind: 'wood' }, space: 2 });
  });

  it('rates a buried card by how soon it comes up, and never above the Dash pile itself', () => {
    const t = tab({ dash: [c(2, 'red'), c(9, 'blue')], wood: [c(1, 'red')], woodIndex: 1 });
    const deep = tab({ dash: [c(2, 'red'), c(8, 'blue'), c(9, 'blue')], wood: [c(1, 'red')], woodIndex: 1 });
    const play = { kind: 'center' as const, source: { kind: 'wood' as const }, space: 0 };
    expect(dashPlanBonus(t, play)).toBeGreaterThan(dashPlanBonus(deep, play));
    // a wood play plus the best plan there is still loses to playing off the Dash
    const best = Math.max(...[t, deep].map(h => rankMove(h, play) + dashPlanBonus(h, play)));
    expect(best).toBeLessThan(rankMove(t, { kind: 'center', source: { kind: 'dash' }, space: 0 }));
  });

  it('is worth nothing on a move that opens nothing, and nothing to a bot that cannot cheat', () => {
    const t = tab({ dash: [c(2, 'red'), c(9, 'blue')], wood: [c(1, 'green')], woodIndex: 1 });
    expect(dashPlanBonus(t, { kind: 'center', source: { kind: 'wood' }, space: 0 })).toBe(0);
  });
});

describe('hasCenterPlay', () => {
  // What the race edge is armed on: only the board is shared, so only a centre
  // play is a thing two players can be racing for.
  it('counts a card that could go on the board, and not a post build', () => {
    const onBoard = tab({ dash: [c(1, 'red')] });
    const postOnly = tab({ dash: [c(8, 'green')], post: [[c(9, 'blue')], [], []] });
    expect(hasCenterPlay(onBoard, spaces(2))).toBe(true);
    expect(hasCenterPlay(postOnly, spaces(2))).toBe(false);
  });
});
