import { increment, ref, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import { db } from './firebase';
import type { Card, CenterSpace, PlayerInfo, Room, Tableau } from '../game/types';
import { buildDeck, deal, shuffle, type Rng } from '../game/deck';
import { postCountForPlayers, spaceCountForPlayers } from '../game/rules';
import { centerPlayTxn, orderlySpaces, reconcileTableau, spaceOwner } from '../game/center';
import { scoreRound, winnerIds } from '../game/scoring';
import { nextStats } from '../game/stats';

const r = (code: string, path = '') => ref(db, `rooms/${code}${path ? '/' + path : ''}`);

export function pickNextHost(players: Record<string, PlayerInfo>): string | null {
  // Bots are always "connected" but have no client to run the room - the host
  // drives them - so they can never stand in as host.
  const connected = Object.entries(players).filter(([, p]) => p.connected && !p.isBot);
  if (connected.length === 0) return null;
  connected.sort(([ua, a], [ub, b]) => a.joinedAt - b.joinedAt || (ua < ub ? -1 : 1));
  return connected[0][0];
}

/**
 * Is the table waiting on nobody? Away players are skipped exactly the way
 * disconnected ones are: a player who is present but not at the table blocks the
 * round forever otherwise, because an idle player usually has a legal move and so
 * is quite correctly never marked stuck. If everyone is away this is false and
 * nothing happens, which is right - an empty table has nothing to rotate for.
 */
export function allConnectedStuck(players: Record<string, PlayerInfo>): boolean {
  const present = Object.values(players).filter(p => p.connected && p.awayAt == null);
  return present.length > 0 && present.every(p => p.stuckAt != null);
}

export async function startRound(code: string, room: Room, rng?: Rng): Promise<void> {
  const uids = Object.keys(room.players);
  const postCount = postCountForPlayers(uids.length);
  const tableaus: Record<string, Tableau> = {};
  for (const uid of uids) tableaus[uid] = deal(shuffle(buildDeck(uid), rng), postCount);
  // An ordinary round leaves `spaces` absent and lets every client normalize the
  // same empty board into being. An orderly one has to be WRITTEN, because the
  // suit constraint is only enforceable if centerPlayTxn can read it off the node
  // it is running against - the transaction never learns its own index.
  const orderly = room.meta.orderlyGrid ?? false;
  const spaces = orderly ? orderlySpaces(spaceCountForPlayers(uids.length, true)) : null;
  const patch: Record<string, unknown> = {
    round: {
      tableaus, stuckRounds: 0, blitzedBy: null, scores: null, startedAt: serverTimestamp(),
      ...(spaces ? { spaces } : {}),
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

/**
 * The away flag. Only ever written by the player's own client for its own uid -
 * `players/$uid` is already writable by its owner, so this needs no rules change.
 * The timestamp is a marker, never compared: see PlayerInfo.awayAt.
 */
export function markAway(code: string, uid: string): Promise<void> {
  return set(r(code, `players/${uid}/awayAt`), serverTimestamp());
}

export function clearAway(code: string, uid: string): Promise<void> {
  return set(r(code, `players/${uid}/awayAt`), null);
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
  // The game-long tally, in the same idempotent write as the scores, so no round
  // can ever be counted into it twice.
  //
  // The duration is the host's own clock against a server timestamp, because
  // round/endedAt is a sentinel until this write lands - so it is thrown away
  // unless it is plausible. Only the game-record lines use it; the per-round
  // "blitzed in Ns" reads endedAt - startedAt, which is server time on both ends.
  const elapsed = round.startedAt > 0 ? Date.now() - round.startedAt : 0;
  const durationMs = elapsed >= 3_000 && elapsed <= 20 * 60_000 ? elapsed : null;
  patch.stats = nextStats(room.stats ?? null, {
    roundNumber: room.meta.roundNumber,
    scores, duels: round.duels, blitzedBy: round.blitzedBy,
    durationMs, stuckRounds: round.stuckRounds, totals,
  });
  // Ties at/above target play another round (spec: game ends only when someone stands alone on top)
  if (winnerIds(totals, room.meta.targetScore).length === 1) patch['meta/phase'] = 'gameOver';
  await update(r(code), patch);
}

export function nextRound(code: string, room: Room): Promise<void> {
  return startRound(code, room);
}

export async function rematch(code: string, room: Room): Promise<void> {
  const patch: Record<string, unknown> = {
    // stats describe one game, and a rematch is a new one.
    'meta/phase': 'lobby', 'meta/roundNumber': 0, round: null, stats: null,
  };
  for (const uid of Object.keys(room.players)) patch[`players/${uid}/score`] = 0;
  await update(r(code), patch);
}

export function claimHost(code: string, uid: string): Promise<unknown> {
  return runTransaction(r(code, 'meta/hostId'), (current: string | null) =>
    current === uid ? undefined : uid,
  );
}
