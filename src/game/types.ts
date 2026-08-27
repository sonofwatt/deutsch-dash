export type Suit = 'red' | 'blue' | 'green' | 'yellow';
export type FaceGroup = 'boy' | 'girl';

export interface Card { v: number; suit: Suit; owner: string }

export function cardId(c: Card): string { return `${c.owner}:${c.suit}:${c.v}`; }

export type PlaySource =
  | { kind: 'blitz' }
  | { kind: 'wood' }
  | { kind: 'post'; index: number };

/** Last array element = top, everywhere. */
export interface Tableau { blitz: Card[]; post: Card[][]; wood: Card[]; woodIndex: number }

/**
 * `suit` is the orderly-grid constraint: only that colour may ever start or build
 * here. It lives ON the space, not derived from its index, because centerPlayTxn
 * is a transaction against `round/spaces/$i` and sees only that one node - it has
 * no idea which index it is. Absent on an ordinary board, and absent means "any".
 */
export interface CenterSpace { stack: Card[]; history: Card[][]; suit?: Suit }

export type Phase = 'lobby' | 'playing' | 'roundEnd' | 'gameOver';

export interface RoomMeta {
  createdAt: number; hostId: string;
  // The room's creator: host whenever present, source of truth for reclaim (see store.ts's
  // onSnapshot watchdog). Always populated - normalizeRoom defaults a missing value (rooms
  // written before this field existed) to hostId, so downstream code never sees it absent.
  creatorId: string;
  targetScore: number; phase: Phase; roundNumber: number;
  // Optional: rooms created before this field existed (and ad-hoc test fixtures) omit it.
  // rooms.ts keeps it in sync with the actual player count - see MAX_PLAYERS in net/rooms.ts.
  playerCount?: number;
  // Host options, both optional for the same reason as playerCount, and both
  // absent meaning off. hintsOn is room-wide rather than a device preference so
  // that everybody is playing the same game - bot difficulty was tuned against a
  // human without hints. See game/hint.ts.
  hintsOn?: boolean;
  orderlyGrid?: boolean;
  /**
   * Card faces on a light ground whatever each player's theme is doing. A host
   * option and not a device preference because it changes how the CARDS read,
   * and two players describing the same board to each other should be looking at
   * the same thing. In a light theme it is already true, so the switch only does
   * anything for the players who are in dark mode. See `.pale-cards`.
   */
  paleCards?: boolean;
  /**
   * The lobby countdown: 3, 2, 1, then 0 which reads "GO!", then absent again.
   *
   * A NUMBER the host writes, not a deadline every client races its own clock
   * to. Two phones do not agree on the time - the same reason `awayAt` is only
   * ever tested against null - so the host's own timer is the single clock and
   * everybody else simply renders whatever digit is currently in here. A tick
   * arrives a few tens of milliseconds late on the other phones, which over
   * three seconds nobody can see. Absent means no countdown is running.
   */
  countdown?: number | null;
}

import type { BadgeId } from './badges';
import type { BotLevel } from './bot';
export interface PlayerInfo {
  name: string; badgeId: BadgeId; joinedAt: number; connected: boolean;
  stuckAt: number | null; score: number;
  /**
   * "Present on the network, but not at the table." Written by the player's own
   * client off its own clock (see AWAY_MS in state/store.ts), never by anybody
   * else's, so no two devices' clocks are ever compared here - the value is a
   * marker, and only ever tested against null. Bots are never away: they are
   * driven by the host and either act or are stuck.
   */
  awayAt: number | null;
  /**
   * "I am ready to start." Written only by the player's own client for its own
   * uid, which `players/$uid`'s existing rule already allows - no rules change.
   * Absent means not ready, so rooms and fixtures written before this field
   * existed simply read as a lobby nobody has readied in yet.
   *
   * Bots are born ready: they have no client to press anything with.
   * `startRound` clears every flag, so the lobby a rematch returns to is blank.
   */
  ready?: boolean;
  /**
   * "Deal me out." Written only by the player's own client for its own uid, like
   * `ready` and `awayAt`. Absent means playing.
   *
   * It takes effect IMMEDIATELY: `setSittingOut` deletes the player's tableau in
   * the same write, so they leave the round in progress rather than the next one.
   * While it is set they are skipped by `startRound` (no tableau at all), are not
   * required to be ready, and cannot hold up the all-stuck rotation. With no
   * tableau they score no delta, so their total simply stands still - leaving
   * mid-round forfeits that round's arithmetic in both directions.
   */
  sittingOut?: boolean;
  // AI players. Absent on humans. A bot has no auth identity of its own: the
  // host owns its record and plays its hand (see the bot driver in store.ts).
  isBot?: boolean; botLevel?: BotLevel;
}

export interface RoundScore { centerCount: number; blitzLeft: number; delta: number }

/**
 * "I lost the race for this space." Written by the LOSER, keyed by space index,
 * so every client can work out the winner from data it already holds: whoever's
 * card is on top of that space now. `at` is only ever a nonce - it marks a fresh
 * race, and is never compared across devices, whose clocks do not agree.
 */
export interface RaceRecord { by: string; at: number }

export interface RoundState {
  spaces: CenterSpace[]; tableaus: Record<string, Tableau>;
  blitzedBy: string | null; scores: Record<string, RoundScore> | null;
  races: Record<string, RaceRecord> | null;
  // How often each player lost a space to each other player this round, loser
  // first: duels[loser][winner]. Only the commentary reads it.
  duels: Record<string, Record<string, number>> | null;
  stuckRounds: number; startedAt: number;
  // Stamped when the host commits the scores, so the round has a length.
  endedAt: number | null;
}

import type { GameStats } from './stats';
export interface Room {
  meta: RoomMeta; players: Record<string, PlayerInfo>; round: RoundState | null;
  // Accumulated across the game by the host and cleared on a rematch. Optional
  // for the same reason as meta.playerCount: rooms created before this field
  // existed (and ad-hoc test fixtures) simply do not have it. normalizeRoom
  // always sets it, so nothing downstream sees it absent.
  stats?: GameStats | null;
}
