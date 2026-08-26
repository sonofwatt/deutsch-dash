import { increment, ref, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import { db } from './firebase';
import type { Card, CenterSpace, PlayerInfo, Room, Tableau } from '../game/types';
import { buildDeck, deal, shuffle, type Rng } from '../game/deck';
import { postCountForPlayers } from '../game/rules';
import { centerPlayTxn, reconcileTableau, spaceOwner } from '../game/center';
import { scoreRound, winnerIds } from '../game/scoring';

const r = (code: string, path = '') => ref(db, `rooms/${code}${path ? '/' + path : ''}`);

export function pickNextHost(players: Record<string, PlayerInfo>): string | null {
  // Bots are always "connected" but have no client to run the room - the host
  // drives them - so they can never stand in as host.
  const connected = Object.entries(players).filter(([, p]) => p.connected && !p.isBot);
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
    round: {
      tableaus, stuckRounds: 0, blitzedBy: null, scores: null, startedAt: serverTimestamp(),
    },
    'meta/phase': 'playing',
    'meta/roundNumber': room.meta.roundNumber + 1,
  };
  for (const uid of uids) patch[`players/${uid}/stuckAt`] = null;
  await update(r(code), patch);
}

/**
 * `winner` is only set on a loss, and it is the whole reason this returns an
 * object rather than a boolean: an aborted transaction's snapshot holds the
 * server's value for that space, so the loser learns who beat it from the same
 * round trip that told it it lost. Guessing from the client's own room snapshot
 * would be a race against the very update that caused the loss.
 */
export interface PlayResult { committed: boolean; winner: string | null }

export async function playToCenter(code: string, spaceIndex: number, card: Card): Promise<PlayResult> {
  const result = await runTransaction(
    r(code, `round/spaces/${spaceIndex}`), centerPlayTxn(card), { applyLocally: false },
  );
  if (result.committed) {
    set(r(code, 'round/stuckRounds'), 0).catch(() => {}); // best-effort reset; a lost reset only delays the stall counter
    return { committed: true, winner: null };
  }
  return { committed: false, winner: spaceOwner(result.snapshot.val() as CenterSpace | null) };
}

/**
 * Announce a lost race so the winner's client can celebrate it. Written by the
 * loser because the loser is the only client that knows a race happened at all -
 * a winning transaction looks exactly like an uncontested play. Best-effort: a
 * failure costs a halo, nothing more.
 */
export function reportRace(
  code: string, space: number, loser: string, winner: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    [`round/races/${space}`]: { by: loser, at: serverTimestamp() },
  };
  // The running tally the commentary reads. Same write, so a rivalry can never
  // count a race the flash did not show, or the other way round.
  if (winner && winner !== loser) patch[`round/duels/${loser}/${winner}`] = increment(1);
  return update(r(code), patch);
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
  const round = room.round;
  // Score the RECONCILED tableaus: a card whose center play committed but whose
  // tableau persist hadn't landed yet must not count as both center and leftover.
  const tableaus = Object.fromEntries(
    Object.entries(round.tableaus).map(([uid, t]) => [uid, reconcileTableau(t, round.spaces)]),
  );
  const scores = scoreRound(round.spaces, tableaus);
  // Stamped here so the round has a length for the commentary to talk about.
  const patch: Record<string, unknown> = { 'round/scores': scores, 'round/endedAt': serverTimestamp() };
  const totals: Record<string, number> = {};
  for (const [uid, p] of Object.entries(room.players)) {
    totals[uid] = p.score + (scores[uid]?.delta ?? 0);
    patch[`players/${uid}/score`] = totals[uid];
  }
  // Ties at/above target play another round (spec: game ends only when someone stands alone on top)
  if (winnerIds(totals, room.meta.targetScore).length === 1) patch['meta/phase'] = 'gameOver';
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
