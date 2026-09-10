import type { CenterSpace, PlaySource, Tableau } from './types';
import { canBuildOnPost, canPlayToSpace, sourceTop } from './rules';
import { WOOD_STEP } from './wood';

export type BotLevel = 'easy' | 'medium' | 'hard' | 'genius';

export const BOT_LEVELS: BotLevel[] = ['easy', 'medium', 'hard', 'genius'];
export const BOT_LABELS: Record<BotLevel, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard', genius: 'Genius',
};

export interface BotProfile {
  /** milliseconds between actions - a bot's real difficulty is mostly its hands */
  minDelay: number; maxDelay: number;
  /** chance of taking a random legal move instead of the best one */
  sloppiness: number;
  /** chance of fumbling a turn entirely and doing nothing */
  dither: number;
  /** when being sloppy, chance of turning wood over instead of playing at all */
  distracted: number;
  /**
   * Whether this level may do things the rules do not allow. Only Genius may, and
   * everything it does with the permission is listed under CHEATS below.
   */
  cheats: boolean;
}

/**
 * Tuned down TWICE, and the second time by moving the whole ladder rather than
 * by nudging numbers. Easy was still beating a casual human after the first pass
 * (2026-08-25) and again after a real game (2026-08-29), so every level now
 * inherits the settings of the level below it: medium is the old easy, hard is
 * the old medium, and a genuinely feeble easy was written underneath them all.
 *
 * A bot punches above its settings because it never makes an ILLEGAL move and
 * never loses track of the board, so the only honest handicaps are speed and
 * attention - which is why the knobs here are all rate and distraction and none
 * of them is "plays worse cards".
 *
 * What matters is the effective rate, delay / (1 - dither):
 *   easy ~9.2s per action, medium ~4.9s, hard ~2.3s, genius ~0.5s.
 * Genius is deliberately about twice the old hard (~1.1s) and takes the best
 * move it can see nearly every time - it is meant to be unpleasant.
 */
export const BOT_PROFILES: Record<BotLevel, BotProfile> = {
  easy:   { minDelay: 4200, maxDelay: 7200, sloppiness: 0.97, dither: 0.38, distracted: 0.6,  cheats: false },
  medium: { minDelay: 2600, maxDelay: 4800, sloppiness: 0.9,  dither: 0.25, distracted: 0.45, cheats: false },
  hard:   { minDelay: 1400, maxDelay: 2600, sloppiness: 0.5,  dither: 0.12, distracted: 0.25, cheats: false },
  genius: { minDelay: 320,  maxDelay: 700,  sloppiness: 0.02, dither: 0,    distracted: 0,    cheats: true },
};

/**
 * CHEATS - Genius only, asked for on 2026-09-10 in those words: "that player
 * should be able to cheat".
 *
 * Every other level is handicapped by speed and attention alone, because a bot
 * that never makes an illegal move and never loses track of the board already
 * punches above its settings (see the comment on BOT_PROFILES). Genius goes the
 * other way, and it goes there by breaking rules rather than by getting faster:
 * the ladder's top rung was already about as quick as a rung can be before it
 * stops looking like a player at all.
 *
 * Four of them, and each is a rule a person at the table is held to:
 *
 *  1. GENIUS_SINGLE_LAP - every third lap of its wood it turns the pile over ONE
 *     card at a time, which reaches the cards a three-at-a-time cycle never
 *     shows. This is the host's deadlock rescue, granted permanently to one
 *     player and switched on by itself. See botWoodStep.
 *  2. GENIUS_REWIND_TURNS - it may put the last turn or two back face-down to
 *     reach a card it has already gone past, if the board has since made that
 *     card playable. See rewindMoves and rewindWood.
 *  3. GENIUS_RACE_EDGE_MS - it answers a change on the board in a tenth of a
 *     second, which is quicker than a person can see the change, decide and
 *     move. Applied by the bot driver in state/store.ts, which is the only place
 *     that knows when the board moved.
 *  4. dashPlanBonus - it plays off the WHOLE Dash pile rather than off the card
 *     on top of it, which is the one piece of hidden information in this game.
 *
 * Nothing here makes it a better judge of a legal move: `rankMove` is the same
 * for every level. It knows more, reaches further and answers faster, which is
 * what cheating is.
 */

/** Every third lap of the wood pile is dealt one card at a time. */
export const GENIUS_SINGLE_LAP = 3;

/** At most this many turns of the wood may be put back to reach a card. */
export const GENIUS_REWIND_TURNS = 2;

/**
 * How long after the board moves Genius takes to answer it, in milliseconds.
 *
 * A person has to see the card land, work out what it opened and get a card of
 * their own onto it. A tenth of a second is inside all of that, so Genius wins
 * essentially every race it wants - which is the point, and is why no other level
 * gets it. The driver only applies it when the board ACTUALLY moved, so it is a
 * reaction and not a second, faster clock: between board changes Genius still
 * runs at its own delay like everybody else.
 */
export const GENIUS_RACE_EDGE_MS = 100;

/**
 * Three cards a turn, except on the lap where Genius deals them one at a time.
 *
 * `base` is what the table is playing by - three normally, one while the host's
 * deadlock rescue is on - so the cheat can only ever make the pile MORE reachable
 * than the rules allow, never less. `laps` is how many times this bot has turned
 * its pile over this round.
 */
export function botWoodStep(level: BotLevel, laps: number, base: number = WOOD_STEP): number {
  if (!botCheats(level) || base <= 1) return base;
  return laps % GENIUS_SINGLE_LAP === GENIUS_SINGLE_LAP - 1 ? 1 : base;
}

/**
 * The turn size this bot's hand should be JUDGED on when asking whether it is
 * stuck, which is not the same question as how it turns its pile.
 *
 * `isStuck` asks what the wood can REACH, and Genius reaches all of it: every
 * third lap goes one card at a time (botWoodStep), so no card in its pile is
 * unreachable the way one in a three-at-a-time cycle can be. Judging it at three
 * would declare it stuck holding a card it is two laps away from turning up, and
 * a bot that has been declared stuck stops turning its pile at all - which would
 * take the single-card lap away from it before it ever got there.
 */
export function botReachStep(level: BotLevel, base: number = WOOD_STEP): number {
  return botCheats(level) ? 1 : base;
}

/** Whether this level is allowed to break the rules. See CHEATS. */
export function botCheats(level: BotLevel): boolean {
  return BOT_PROFILES[level].cheats;
}

/**
 * Has this hand a card it could put on the BOARD right now? Not `hasLegalMove`,
 * which counts post builds too: only a centre play can be raced for, because only
 * the board is shared. Used by the driver to decide whether a board that just
 * moved is a board this bot wants to answer. See GENIUS_RACE_EDGE_MS.
 */
export function hasCenterPlay(t: Tableau, spaces: CenterSpace[]): boolean {
  const sources: PlaySource[] = [
    { kind: 'dash' }, { kind: 'wood' },
    ...t.post.map((_, index) => ({ kind: 'post' as const, index })),
  ];
  return sources.some(source => {
    const card = sourceTop(t, source);
    return card != null && spaces.some(sp => canPlayToSpace(card, sp));
  });
}

export type BotAction =
  | { kind: 'center'; source: PlaySource; space: number }
  | { kind: 'post'; source: PlaySource; post: number }
  | { kind: 'flip' }
  /** Genius only. Puts `turns` turns of the wood back face-down. See rewindWood. */
  | { kind: 'rewind'; turns: number };

export type Rng = () => number;

/** Every play the tableau can legally make right now, centre plays and post builds. */
export function botMoves(t: Tableau, spaces: CenterSpace[]): BotAction[] {
  const sources: PlaySource[] = [
    { kind: 'dash' }, { kind: 'wood' },
    ...t.post.map((_, index) => ({ kind: 'post' as const, index })),
  ];
  const out: BotAction[] = [];
  for (const source of sources) {
    const card = sourceTop(t, source);
    if (!card) continue;
    spaces.forEach((sp, space) => {
      if (canPlayToSpace(card, sp)) out.push({ kind: 'center', source, space });
    });
    t.post.forEach((stack, post) => {
      if (source.kind === 'post' && source.index === post) return;
      if (canBuildOnPost(card, stack)) out.push({ kind: 'post', source, post });
    });
  }
  return out;
}

/**
 * How good a move is, in this game's terms: the only way to win a round is to
 * empty the Dash pile, so anything that takes a card off it - or empties a post
 * so the Dash pile refills it - beats an otherwise identical wood play.
 */
export function rankMove(t: Tableau, a: BotAction): number {
  if (a.kind === 'flip') return 0;
  // Below every centre play and above every post build: a rewind buys a centre
  // play (rewindMoves offers no other kind) but costs the turn it is made on, so
  // it is worth taking when the alternative is shuffling cards between posts and
  // never when there is a card to put on the board this instant.
  if (a.kind === 'rewind') return REWIND_RANK;
  const fromDash = a.source.kind === 'dash';
  // emptying a post pulls the next Dash card down into it (see refillPosts)
  const frees = a.source.kind === 'post' && t.post[a.source.index].length === 1 && t.dash.length > 0;
  const toCenter = a.kind === 'center';
  if (fromDash) return toCenter ? 100 : 90;
  if (frees) return toCenter ? 80 : 45;
  if (a.source.kind === 'wood') return toCenter ? 70 : 40;
  return toCenter ? 60 : 20;
}

const REWIND_RANK = 50;

/**
 * The turns of the wood Genius could put back to reach a card the board has since
 * made playable, cheapest first.
 *
 * Only a CENTRE play counts as a reason. A rewind costs a whole turn, and a post
 * build bought with one is worth less than the turn it cost (`rankMove` puts a
 * wood post build at 40 against this move's 50), so offering those would have the
 * bot walking its pile backwards for nothing.
 *
 * `step` is the bot's own current turn size, not the table's, so the arithmetic
 * matches the turns this hand actually took - a lap Genius dealt one card at a
 * time steps back one card at a time.
 */
export function rewindMoves(t: Tableau, spaces: CenterSpace[], step: number = WOOD_STEP): BotAction[] {
  const out: BotAction[] = [];
  for (let turns = 1; turns <= GENIUS_REWIND_TURNS; turns++) {
    const at = t.woodIndex - turns * step;
    if (at < 1) break; // nothing left face up that far back: no card to expose
    const card = t.wood[at - 1];
    if (card && spaces.some(sp => canPlayToSpace(card, sp))) out.push({ kind: 'rewind', turns });
  }
  return out;
}

/** The most a plan off the buried Dash cards may add to a move's rank. */
export const DASH_PLAN_MAX = 25;

/**
 * What this move is worth to a player who can see their whole Dash pile and not
 * just the card on top of it.
 *
 * The Dash pile is the one piece of hidden information a player holds, and
 * emptying it is the only way to win a round, so knowing what is under the top
 * card is worth exactly this: it says which of two otherwise equal moves opens
 * the way for a card already in hand. A move whose card leaves behind a top that
 * a buried Dash card can land on scores by how soon that card comes up.
 *
 * Capped below the gap between a Dash play (100) and a wood one (70), so a plan
 * can reorder moves inside a tier and can never talk the bot out of playing off
 * the Dash pile itself. Genius only - see CHEATS.
 */
export function dashPlanBonus(t: Tableau, a: BotAction): number {
  if (a.kind === 'flip' || a.kind === 'rewind') return 0;
  const card = sourceTop(t, a.source);
  if (!card) return 0;
  // Playing off the Dash pile uncovers the card under it, so that card is no
  // longer buried and the plan is about what is under IT.
  const dash = a.source.kind === 'dash' ? t.dash.slice(0, -1) : t.dash;
  for (let depth = 0; depth < dash.length; depth++) {
    const buried = dash[dash.length - 1 - depth];
    const opens = a.kind === 'center'
      ? buried.suit === card.suit && buried.v === card.v + 1
      : canBuildOnPost(buried, [card]); // the post this move is about to top
    if (opens) return Math.max(1, DASH_PLAN_MAX - depth * 2);
  }
  return 0;
}

/**
 * The same play, aimed at the LOWEST space on the board that would take the card.
 *
 * For any one card every legal space is the same kind of landing - an Ace only
 * ever opens an empty space and everything else only ever continues a run of its
 * own suit - so which one it goes to is free, and a free choice belongs to
 * whoever has to watch it. The grid fills left to right and top to bottom, so the
 * last legal index is the bottom of the board.
 *
 * Asked for on 2026-09-10: bots opening spaces along the top row put their cards
 * as far from the eye as the board allows, which on a big screen is a long way
 * from the hand the player is actually looking at. It applies at every level and
 * is not a handicap either way, because nothing about the play changes except
 * where on the board it lands.
 */
export function lowestSpaceFor(t: Tableau, spaces: CenterSpace[], a: BotAction): BotAction {
  if (a.kind !== 'center') return a;
  const card = sourceTop(t, a.source);
  if (!card) return a;
  for (let i = spaces.length - 1; i > a.space; i--) {
    if (canPlayToSpace(card, spaces[i])) return { ...a, space: i };
  }
  return a;
}

/**
 * Pick this tick's action. Difficulty is speed first (BOT_PROFILES) and judgement
 * second: a sloppy bot still only makes legal moves, it just often takes a worse
 * one, which is what a distracted human looks like from across the table.
 */
export function chooseBotAction(
  t: Tableau, spaces: CenterSpace[], level: BotLevel, rng: Rng = Math.random,
  step: number = WOOD_STEP,
): BotAction | null {
  const p = BOT_PROFILES[level];
  if (rng() < p.dither) return null;
  const moves = botMoves(t, spaces);
  // A cheat, and kept out of botMoves for that reason: that function is "every
  // play the tableau can LEGALLY make", which the bot driver, the tests and any
  // future caller are entitled to keep believing.
  if (p.cheats) moves.push(...rewindMoves(t, spaces, step));
  if (moves.length === 0) {
    // nothing playable: turn over the next three, which also recycles a spent pile
    return t.wood.length > 0 ? { kind: 'flip' } : null;
  }
  if (rng() < p.sloppiness) {
    // a distracted bot turns wood over instead of spotting the move in front of it
    if (t.wood.length > t.woodIndex && rng() < p.distracted) return { kind: 'flip' };
    return lowestSpaceFor(t, spaces, moves[Math.floor(rng() * moves.length)]);
  }
  const score = (m: BotAction) => rankMove(t, m) + (p.cheats ? dashPlanBonus(t, m) : 0);
  let best = moves[0];
  let bestScore = score(best);
  for (const m of moves.slice(1)) {
    const s = score(m);
    if (s > bestScore) { best = m; bestScore = s; }
  }
  // Last, and outside the ranking on purpose: the space a card goes to is worth
  // nothing to the bot and something to the player watching, so it is settled
  // after the move has been chosen and never competes with choosing it.
  return lowestSpaceFor(t, spaces, best);
}

/**
 * How often a bot hesitates before its turn, and for how long.
 *
 * Asked for on 2026-09-10, off a specific complaint: "I play a 5 from my wood
 * pile, I also have a 6 on one of my middle piles. I don't have time to go for
 * that 6 before the bot has already placed their 6." That is the moment this
 * game is actually about - spotting your own follow-up and getting to it - and a
 * bot that answers it instantly takes the moment away rather than contesting it.
 *
 * **Two thirds, not always**, and that was asked for in those words too: "it's
 * fine if they're that fast on occasion". A bot that always hesitated would be a
 * bot with a slower delay band, which is a thing the ladder already has four of.
 * A bot that USUALLY hesitates and occasionally does not is a bot you cannot
 * count on being slow, which is a different and better opponent - the same
 * argument the profiles make for `dither` over a flat rate.
 *
 * It is deliberately NOT a profile knob. Every level gets it, at the same rate,
 * because the complaint is not about difficulty: it is about a human having time
 * to reach for a card they have already seen, and that is the same length of time
 * whoever they are playing.
 */
export const HESITATE_CHANCE = 2 / 3;
export const HESITATE_MS = 800;

/**
 * The wait before a bot's next turn.
 *
 * Draws from the level's own band and then, two thirds of the time, adds the
 * hesitation on top. Both rolls come off the same `rng`, in that order, which is
 * what makes a scripted rng in the tests able to say "this turn hesitates".
 */
export function botDelay(level: BotLevel, rng: Rng = Math.random): number {
  const p = BOT_PROFILES[level];
  const base = Math.round(p.minDelay + rng() * (p.maxDelay - p.minDelay));
  return rng() < HESITATE_CHANCE ? base + HESITATE_MS : base;
}

/**
 * The level a bot record actually carries, held to the table. botLevel is written
 * by the host's client and read by `BOT_PROFILES[level]`, which on an unknown
 * value is undefined and throws from inside the snapshot handler - on the host,
 * which is the one client that drives the bots and commits the scores.
 */
export function botLevelOf(v: unknown): BotLevel {
  return typeof v === 'string' && Object.hasOwn(BOT_PROFILES, v) ? v as BotLevel : 'medium';
}

/** Deterministic, readable, and collision-free because badges are unique in a room. */
export function botId(badgeId: string): string { return `bot_${badgeId}`; }
export function isBotId(uid: string): boolean { return uid.startsWith('bot_'); }
