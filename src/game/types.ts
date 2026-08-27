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
