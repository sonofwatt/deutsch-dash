import {
  get, onDisconnect, onValue, ref, serverTimestamp, set, update,
} from 'firebase/database';
import { db, ensureSignedIn } from './firebase';
import { makeRoomCode } from './roomCodes';
import type { BadgeId } from '../game/badges';
import type { PlayerInfo, Room, RoomMeta, RoundState } from '../game/types';
import { normalizeSpaces, normalizeTableau } from '../game/center';
import { postCountForPlayers } from '../game/rules';

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_PLAYERS = 8;

export type JoinResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'not-found' | 'expired' | 'full' | 'badge-taken' | 'started' };

const roomRef = (code: string) => ref(db, `rooms/${code}`);

export function normalizeRoom(raw: unknown): Room | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { meta?: RoomMeta; players?: Record<string, PlayerInfo>; round?: unknown };
  if (!r.meta || !r.players) return null;
  const players: Record<string, PlayerInfo> = {};
  for (const [uid, p] of Object.entries(r.players)) {
    players[uid] = { ...p, stuckAt: p.stuckAt ?? null, connected: p.connected ?? false, score: p.score ?? 0 };
  }
  const postCount = postCountForPlayers(Object.keys(players).length);
  let round: RoundState | null = null;
  if (r.round && typeof r.round === 'object') {
    const rr = r.round as Partial<RoundState> & { tableaus?: Record<string, unknown> };
    round = {
      spaces: normalizeSpaces(rr.spaces),
      tableaus: Object.fromEntries(
        Object.entries(rr.tableaus ?? {}).map(([uid, t]) => [uid, normalizeTableau(t, postCount)]),
      ),
      blitzedBy: rr.blitzedBy ?? null,
      scores: rr.scores ?? null,
      stuckRounds: rr.stuckRounds ?? 0,
      startedAt: rr.startedAt ?? 0,
    };
  }
  return { meta: r.meta, players, round };
}

function playerRecord(name: string, badgeId: BadgeId): Omit<PlayerInfo, 'joinedAt'> & { joinedAt: object } {
  return { name, badgeId, joinedAt: serverTimestamp(), connected: true, stuckAt: null, score: 0 };
}

export async function createRoom(name: string, badgeId: BadgeId): Promise<string> {
  const uid = await ensureSignedIn();
  const code = makeRoomCode();
  const meta: Omit<RoomMeta, 'createdAt'> & { createdAt: object } = {
    createdAt: serverTimestamp(), hostId: uid, targetScore: 75, phase: 'lobby', roundNumber: 0,
  };
  await set(roomRef(code), { meta, players: { [uid]: playerRecord(name, badgeId) } });
  startPresence(code, uid);
  return code;
}

export async function joinRoom(code: string, name: string, badgeId: BadgeId): Promise<JoinResult> {
  const uid = await ensureSignedIn();
  const snap = await get(roomRef(code));
  const room = normalizeRoom(snap.val());
  if (!room) return { ok: false, reason: 'not-found' };
  if (Date.now() - room.meta.createdAt > ROOM_TTL_MS) return { ok: false, reason: 'expired' };
  const rejoining = uid in room.players;
  if (!rejoining) {
    if (room.meta.phase !== 'lobby') return { ok: false, reason: 'started' };
    if (Object.keys(room.players).length >= MAX_PLAYERS) return { ok: false, reason: 'full' };
    if (Object.values(room.players).some(p => p.badgeId === badgeId)) {
      return { ok: false, reason: 'badge-taken' };
    }
    await set(ref(db, `rooms/${code}/players/${uid}`), playerRecord(name, badgeId));
  } else {
    await update(ref(db, `rooms/${code}/players/${uid}`), { connected: true });
  }
  startPresence(code, uid);
  return { ok: true, code };
}

export function watchRoom(code: string, cb: (room: Room | null) => void): () => void {
  return onValue(roomRef(code), snap => cb(normalizeRoom(snap.val())));
}

export function setTargetScore(code: string, target: number): Promise<void> {
  return set(ref(db, `rooms/${code}/meta/targetScore`), target);
}

export function startPresence(code: string, uid: string): void {
  const connectedRef = ref(db, '.info/connected');
  const myConnected = ref(db, `rooms/${code}/players/${uid}/connected`);
  onValue(connectedRef, snap => {
    if (snap.val() === true) {
      onDisconnect(myConnected).set(false);
      set(myConnected, true);
    }
  });
}
