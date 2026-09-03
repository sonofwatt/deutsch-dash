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
 *
 * A player sitting out is skipped for a harder reason than the others: `syncStuck`
 * returns early on the flag and never writes them a `stuckAt`, so counted as
 * present they would sit here forever as the one player the table is waiting on.
 * They still HAVE a hand - it is what they rejoin with - so the hand is no proof
 * either way. The flag is.
 */
/**
 * `tableaus`, when given, is who is actually IN this round - and it has to be
 * given wherever a round exists. A spectator who joined mid-game has a player
 * record and no hand, so they can never be stuck; counted as present they are one
 * more player the table waits on forever. This is the same trap as sitting out
 * and as being away, arriving by a third route.
 */
export function allConnectedStuck(
  players: Record<string, PlayerInfo>, tableaus?: Record<string, unknown>,
): boolean {
  const present = Object.entries(players)
    .filter(([uid, p]) => p.connected && p.awayAt == null && !p.sittingOut
      && (!tableaus || uid in tableaus))
    .map(([, p]) => p);
  return present.length > 0 && present.every(p => p.stuckAt != null);
}

export async function startRound(code: string, room: Room, rng?: Rng): Promise<void> {
  const uids = Object.keys(room.players);
  // Who is actually dealt in. A player sitting out is not, and gets no tableau -
  // which is why returning mid-round only works for somebody who left one behind.
  // Miss the deal and there is nothing to come back to until the next one.
  // A SEAT is reserved for everybody who is not sitting out; a HAND goes only to
  // those who are ready for it. On the ordinary path those are the same people,
  // because the countdown does not run until everybody is ready. On a forced
  // start they are not: the players who never readied are left behind with a seat
  // and no cards, watching, and can deal themselves in whenever they like (see
  // dealMeIn). Sizing the board on seats rather than on hands is what makes that
  // possible without the grid changing shape under everybody mid-round.
  const seats = uids.filter(uid => !room.players[uid].sittingOut);
  const dealt = seats.filter(uid => room.players[uid].isBot || room.players[uid].ready === true);
  // Sized on the WHOLE room, not on who is dealt in. The board's shape is read
  // from the player count by every client independently (normalizeRoom), and
  // somebody sitting down mid-round would otherwise resize the grid under a hand
  // already being held. A couple of spare spaces costs nothing; a board that
  // changes shape mid-round costs the round.
  const postCount = postCountForPlayers(uids.length);
  const tableaus: Record<string, Tableau> = {};
  for (const uid of dealt) tableaus[uid] = deal(shuffle(buildDeck(uid), rng), postCount);
  // An ordinary round leaves `spaces` absent and lets every client normalize the
  // same empty board into being. An orderly one has to be WRITTEN, because the
  // suit constraint is only enforceable if centerPlayTxn can read it off the node
  // it is running against - the transaction never learns its own index.
  const orderly = room.meta.orderlyGrid ?? false;
  const spaces = orderly ? orderlySpaces(spaceCountForPlayers(uids.length, true)) : null;
  const patch: Record<string, unknown> = {
    round: {
      tableaus, stuckRounds: 0, dashedBy: null, scores: null, startedAt: serverTimestamp(),
      // Fixed here rather than derived per client, because the player count can
      // change mid-round now that a game in progress admits spectators - and a
      // board that changes shape under a hand somebody is holding costs the round.
      spaceCount: spaceCountForPlayers(uids.length, orderly),
      postCount, seats,
      ...(spaces ? { spaces } : {}),
    },
    'meta/phase': 'playing',
    'meta/roundNumber': room.meta.roundNumber + 1,
    // The countdown belongs to the lobby that led here and nothing else. Cleared
    // in the same write that starts the round so no client can be left holding a
    // digit over a board.
    'meta/countdown': null,
    // The deadlock rescue belongs to the round it rescued. A fresh deal is a
    // fresh chance for everybody, so the table goes back to three a turn.
    'meta/singleFlip': null,
  };
  // Ready is a lobby fact too: cleared here so a rematch comes back to a lobby
  // nobody has readied in, rather than one that starts again immediately.
  for (const uid of uids) {
    patch[`players/${uid}/stuckAt`] = null;
    patch[`players/${uid}/ready`] = room.players[uid]?.isBot ? true : null;
  }
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

/**
 * A wood turn changes exactly one field of the hand, so it writes exactly one.
 *
 * It used to go through persistTableau: about 2 KB of cards - every one carrying
 * a 28-character owner id - to move an integer, fanned out to every client in
 * the room, on the most frequent action in the game (turning wood is what a
 * player does whenever nothing is playable). At eight players that was roughly
 * half of a round's download. The readers do not care: normalizeTableau reads
 * woodIndex on its own, and reconcileTableau only ever adjusts it.
 *
 * Every OTHER wood mutation (playing the face-up card, sinking it, the table-wide
 * rotation) changes the array as well and keeps the full write.
 */
export function persistWoodIndex(code: string, uid: string, woodIndex: number): Promise<void> {
  return update(r(code, `round/tableaus/${uid}`), { woodIndex });
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

export function announceDash(code: string, uid: string): Promise<void> {
  return update(r(code), { 'round/dashedBy': uid, 'meta/phase': 'roundEnd' });
}

// Called by the host client by convention; not security-enforced (casual trust model, see database.rules.json).
export function endRoundStalled(code: string): Promise<void> {
  return update(r(code), { 'round/dashedBy': null, 'meta/phase': 'roundEnd' });
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
  // Sitting-out players are left out of the scoring entirely - they keep their
  // hand (so they can rejoin the round) but a round they were not playing must
  // not move their total in either direction. Their cards already in the middle
  // still count towards the piles; they just earn nobody anything.
  const tableaus = Object.fromEntries(
    Object.entries(round.tableaus)
      .filter(([uid]) => !room.players[uid]?.sittingOut)
      .map(([uid, t]) => [uid, reconcileTableau(t, round.spaces)]),
  );
  const scores = scoreRound(round.spaces, tableaus);
  // Stamped here so the round has a length for the commentary to talk about.
  const patch: Record<string, unknown> = { 'round/scores': scores, 'round/endedAt': serverTimestamp() };
  const totals: Record<string, number> = {};
  for (const [uid, p] of Object.entries(room.players)) {
    totals[uid] = p.score + (scores[uid]?.delta ?? 0);
    patch[`players/${uid}/score`] = totals[uid];
  }
  // The game-long tally. Computed from the SAME pre-write snapshot as the scores
  // above, which is what keeps it idempotent: two commits racing off one snapshot
  // produce byte-identical stats, so neither can count the round twice.
  //
  // The duration is the host's own clock against a server timestamp, because
  // round/endedAt is a sentinel until this write lands - so it is thrown away
  // unless it is plausible. Only the game-record lines use it; the per-round
  // "dashed in Ns" reads endedAt - startedAt, which is server time on both ends.
  const elapsed = round.startedAt > 0 ? Date.now() - round.startedAt : 0;
  const durationMs = elapsed >= 3_000 && elapsed <= 20 * 60_000 ? elapsed : null;
  const stats = nextStats(room.stats ?? null, {
    roundNumber: room.meta.roundNumber,
    scores, duels: round.duels, dashedBy: round.dashedBy,
    durationMs, stuckRounds: round.stuckRounds, totals,
  });
  // Ties at/above target play another round (spec: game ends only when someone stands alone on top)
  if (winnerIds(totals, room.meta.targetScore).length === 1) patch['meta/phase'] = 'gameOver';
  await update(r(code), patch);
  // Stats go in a SECOND write, on purpose, and their failure is swallowed.
  //
  // They used to ride along in the patch above, and that is exactly how one
  // missing grant took a whole game's scoring down with it: `stats` was added to
  // database.rules.json in a93e7d2, the live database was still running rules
  // from before it, and because a multi-path update is atomic the denied stats
  // write rejected the scores and the totals too. The host saw a score sheet
  // anyway - RTDB applies a write to the local cache before the server answers -
  // and nobody else saw one at all. See "The first iPhone playtest" in handoff.md.
  //
  // The tally is commentary material; the scores are the game. Nothing that only
  // decorates a round is allowed to be able to lose it again.
  await update(r(code), { stats }).catch(() => {});
}

export function nextRound(code: string, room: Room): Promise<void> {
  return startRound(code, room);
}

export async function rematch(code: string, room: Room): Promise<void> {
  const patch: Record<string, unknown> = {
    // stats describe one game, and a rematch is a new one.
    'meta/phase': 'lobby', 'meta/roundNumber': 0, round: null, stats: null,
  };
  for (const [uid, p] of Object.entries(room.players)) {
    patch[`players/${uid}/score`] = 0;
    patch[`players/${uid}/ready`] = p.isBot ? true : null;
  }
  await update(r(code), patch);
}

export function claimHost(code: string, uid: string): Promise<unknown> {
  return runTransaction(r(code, 'meta/hostId'), (current: string | null) =>
    current === uid ? undefined : uid,
  );
}
