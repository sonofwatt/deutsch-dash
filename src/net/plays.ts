import { ref, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import { db } from './firebase';
import type { Card, PlayerInfo, Room, Tableau } from '../game/types';
import { buildDeck, deal, shuffle, type Rng } from '../game/deck';
import { postCountForPlayers } from '../game/rules';
import { centerPlayTxn } from '../game/center';
import { scoreRound, winnerIds } from '../game/scoring';

const r = (code: string, path = '') => ref(db, `rooms/${code}${path ? '/' + path : ''}`);

export function pickNextHost(players: Record<string, PlayerInfo>): string | null {
  const connected = Object.entries(players).filter(([, p]) => p.connected);
  if (connected.length === 0) return null;
  connected.sort(([ua, a], [ub, b]) => a.joinedAt - b.joinedAt || (ua < ub ? -1 : 1));
  return connected[0][0];
}

export function allConnectedStuck(players: Record<string, PlayerInfo>): boolean {
  const connected = Object.values(players).filter(p => p.connected);
  return connected.length > 0 && connected.every(p => p.stuckAt != null);
}

export async function startRound(code: string, room: Room, rng?: Rng): Promise<void> {
  const uids = Object.keys(room.players);
  const postCount = postCountForPlayers(uids.length);
  const tableaus: Record<string, Tableau> = {};
  for (const uid of uids) tableaus[uid] = deal(shuffle(buildDeck(uid), rng), postCount);
  const patch: Record<string, unknown> = {
    round: { tableaus, stuckRounds: 0, blitzedBy: null, scores: null, startedAt: serverTimestamp() },
    'meta/phase': 'playing',
    'meta/roundNumber': room.meta.roundNumber + 1,
  };
  for (const uid of uids) patch[`players/${uid}/stuckAt`] = null;
  await update(r(code), patch);
}

export async function playToCenter(code: string, spaceIndex: number, card: Card): Promise<boolean> {
  const result = await runTransaction(
    r(code, `round/spaces/${spaceIndex}`), centerPlayTxn(card), { applyLocally: false },
  );
  if (result.committed) set(r(code, 'round/stuckRounds'), 0).catch(() => {}); // best-effort reset; a lost reset only delays the stall counter
  return result.committed;
}

export function persistTableau(code: string, uid: string, t: Tableau): Promise<void> {
  return set(r(code, `round/tableaus/${uid}`), t);
}

export function declareStuck(code: string, uid: string): Promise<void> {
  return set(r(code, `players/${uid}/stuckAt`), serverTimestamp());
}

export function clearStuck(code: string, uid: string): Promise<void> {
  return set(r(code, `players/${uid}/stuckAt`), null);
}

export function announceBlitz(code: string, uid: string): Promise<void> {
  return update(r(code), { 'round/blitzedBy': uid, 'meta/phase': 'roundEnd' });
}

// Called by the host client by convention; not security-enforced (casual trust model, see database.rules.json).
export function endRoundStalled(code: string): Promise<void> {
  return update(r(code), { 'round/blitzedBy': null, 'meta/phase': 'roundEnd' });
}

// Called by the host client by convention; not security-enforced (casual trust model, see database.rules.json).
export async function incrementStuckRounds(code: string): Promise<number> {
  const res = await runTransaction(r(code, 'round/stuckRounds'), (n: number | null) => (n ?? 0) + 1);
  return (res.snapshot.val() as number) ?? 0;
}

export async function commitScores(code: string, room: Room): Promise<void> {
  if (!room.round || room.round.scores) return; // idempotent
  const scores = scoreRound(room.round.spaces, room.round.tableaus);
  const patch: Record<string, unknown> = { 'round/scores': scores };
  const totals: Record<string, number> = {};
  for (const [uid, p] of Object.entries(room.players)) {
    totals[uid] = p.score + (scores[uid]?.delta ?? 0);
    patch[`players/${uid}/score`] = totals[uid];
  }
  if (winnerIds(totals, room.meta.targetScore).length > 0) patch['meta/phase'] = 'gameOver';
  await update(r(code), patch);
}

export function nextRound(code: string, room: Room): Promise<void> {
  return startRound(code, room);
}

export async function rematch(code: string, room: Room): Promise<void> {
  const patch: Record<string, unknown> = {
    'meta/phase': 'lobby', 'meta/roundNumber': 0, round: null,
  };
  for (const uid of Object.keys(room.players)) patch[`players/${uid}/score`] = 0;
  await update(r(code), patch);
}

export function claimHost(code: string, uid: string): Promise<unknown> {
  return runTransaction(r(code, 'meta/hostId'), (current: string | null) =>
    current === uid ? undefined : uid,
  );
}
