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
  createdAt: number; hostId: string; targetScore: number; phase: Phase; roundNumber: number;
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
