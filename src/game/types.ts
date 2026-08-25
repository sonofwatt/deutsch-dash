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

export interface CenterSpace { stack: Card[]; history: Card[][] }

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
}

import type { BadgeId } from './badges';
export interface PlayerInfo {
  name: string; badgeId: BadgeId; joinedAt: number; connected: boolean;
  stuckAt: number | null; score: number;
}

export interface RoundScore { centerCount: number; blitzLeft: number; delta: number }

export interface RoundState {
  spaces: CenterSpace[]; tableaus: Record<string, Tableau>;
  blitzedBy: string | null; scores: Record<string, RoundScore> | null;
  stuckRounds: number; startedAt: number;
}

export interface Room { meta: RoomMeta; players: Record<string, PlayerInfo>; round: RoundState | null }
