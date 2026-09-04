import {
  get, increment, onDisconnect, onValue, ref, serverTimestamp, set, update,
} from 'firebase/database';
import { db, ensureSignedIn } from './firebase';
import { makeRoomCode } from './roomCodes';
import type { BadgeId } from '../game/badges';
import { botId, type BotLevel } from '../game/bot';
import type { PlayerInfo, Room, RoomMeta, RoundState } from '../game/types';
import { normalizeSpaces, normalizeTableau } from '../game/center';
import { MAX_SPACES, postCountForPlayers, spaceCountForPlayers } from '../game/rules';
import { normalizeStats } from '../game/stats';

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
// Mirrored in database.rules.json's rooms/$code/meta/playerCount .validate
// rule (the literal 8 there) - keep the two in sync.
export const MAX_PLAYERS = 8;
/** The join forms cap a name here; normalizeRoom holds every name to it too. */
export const MAX_NAME_LENGTH = 14;
/** The most posts a hand can hold: five at two players (postCountForPlayers). */
const MAX_POSTS = 5;

/**
 * Defensive reads of a room, for the same reason as isCard in game/center.ts:
 * every field arrived from some client, and several from any authed client. A
 * number that is not a number turns totals into NaN, and a count that is not a
 * count is worse - normalizeSpaces and normalizeTableau build arrays of that
 * length, so a forged spaceCount of a billion was a RangeError on every client
 * in the room, on every snapshot, until the round was replaced.
 */
const finite = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const count = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined;
const record = <T>(v: unknown): T | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as T : null);

export type JoinResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'not-found' | 'expired' | 'full' | 'badge-taken' | 'started' | 'race' | 'offline' };

const roomRef = (code: string) => ref(db, `rooms/${code}`);

export function normalizeRoom(raw: unknown): Room | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as {
    meta?: RoomMeta; players?: Record<string, PlayerInfo>; round?: unknown; stats?: unknown;
  };
  if (!r.meta || !r.players) return null;
  const players: Record<string, PlayerInfo> = {};
  for (const [uid, p] of Object.entries(r.players)) {
    if (!p || typeof p !== 'object') continue;
    players[uid] = {
      ...p,
      name: typeof p.name === 'string' ? p.name.slice(0, MAX_NAME_LENGTH) : '',
      joinedAt: finite(p.joinedAt, 0),
      stuckAt: p.stuckAt ?? null, awayAt: p.awayAt ?? null,
      connected: p.connected === true, score: finite(p.score, 0),
    };
  }
  // Both of these default ON rather than off, which is the opposite of every
  // other host option here. They are what the table wants by default - flinging
  // is simply the faster way to play, and pale cards is the fix for a real
  // legibility complaint in dark mode - so a room that predates either field
  // should come up with it. `false` is stored as false, never absent, so turning
  // one off survives; only genuine absence reads as on.
  const meta: RoomMeta = {
    ...r.meta,
    creatorId: r.meta.creatorId ?? r.meta.hostId,
    flingOn: r.meta.flingOn ?? true,
    paleCards: r.meta.paleCards ?? true,
    targetScore: finite(r.meta.targetScore, 75),
    roundNumber: finite(r.meta.roundNumber, 0),
    countdown: typeof r.meta.countdown === 'number' && Number.isFinite(r.meta.countdown) ? r.meta.countdown : null,
  };
  const playerCount = Object.keys(players).length;
  const orderly = meta.orderlyGrid ?? false;
  let round: RoundState | null = null;
  if (r.round && typeof r.round === 'object') {
    const rr = r.round as Partial<RoundState> & { tableaus?: Record<string, unknown> };
    // The shape this round was DEALT with, not the shape the room implies now.
    // Deriving it from the live player count renormalized every hand the moment
    // somebody walked in - five posts to three at a two-player table, which drops
    // cards off the end of everybody's tableau.
    // Both counts are held to what a real deal can produce before anything
    // allocates on them - see `count` above for what a forged one did.
    const spaceCount = count(rr.spaceCount, 1, MAX_SPACES);
    const postCount = count(rr.postCount, 1, MAX_POSTS);
    const tableaus = record<Record<string, unknown>>(rr.tableaus) ?? {};
    round = {
      // The size this round was dealt with, not the size the room implies now: a
      // spectator arriving mid-round must not grow the board under everybody.
      spaces: normalizeSpaces(
        rr.spaces, spaceCount ?? spaceCountForPlayers(playerCount, orderly), orderly),
      tableaus: Object.fromEntries(
        Object.entries(tableaus).map(([uid, t]) => [uid, normalizeTableau(t, postCount ?? postCountForPlayers(playerCount))]),
      ),
      dashedBy: typeof rr.dashedBy === 'string' ? rr.dashedBy : null,
      scores: record(rr.scores),
      races: record(rr.races),
      duels: record(rr.duels),
      spaceCount,
      postCount,
      seats: Array.isArray(rr.seats) ? rr.seats.filter((s): s is string => typeof s === 'string') : undefined,
      stuckRounds: finite(rr.stuckRounds, 0),
      startedAt: finite(rr.startedAt, 0),
      endedAt: typeof rr.endedAt === 'number' ? rr.endedAt : null,
    };
  }
  return { meta, players, round, stats: normalizeStats(r.stats) };
}

function playerRecord(name: string, badgeId: BadgeId): Omit<PlayerInfo, 'joinedAt'> & { joinedAt: object } {
  return { name, badgeId, joinedAt: serverTimestamp(), connected: true, stuckAt: null, awayAt: null, score: 0 };
}

export async function createRoom(name: string, badgeId: BadgeId): Promise<string> {
  const uid = await ensureSignedIn();
  const code = makeRoomCode();
  const meta: Omit<RoomMeta, 'createdAt'> & { createdAt: object } = {
    createdAt: serverTimestamp(), hostId: uid, creatorId: uid, targetScore: 75, phase: 'lobby', roundNumber: 0,
    playerCount: 1,
  };
  // One atomic multi-path write. This was two sequential ones, held apart by a
  // comment that outlived its rule: the players/$uid .validate used to read
  // meta/phase to gate joins, and that cross-reference only worked against data
  // already committed. Nothing reads meta/phase from the rules any more - it has
  // its own validate and nothing else - because the lobby-only gate went when
  // spectators were admitted mid-round. The merge is legal because `root` is
  // evaluated against the PRE-write tree, where this room has no players yet:
  // that is the branch hostId and creatorId's validate take (`!players.exists()`),
  // and badges only ever checks the writer's own uid. Worth doing for the round
  // trip, and worth more because a create can no longer be interrupted between
  // the two and leave a meta behind with no players in it.
  await update(roomRef(code), {
    meta,
    [`players/${uid}`]: playerRecord(name, badgeId),
    [`badges/${badgeId}`]: uid,
  });
  startPresence(code, uid);
  return code;
}

export async function joinRoom(code: string, name: string, badgeId: BadgeId): Promise<JoinResult> {
  const uid = await ensureSignedIn();
  const snap = await get(roomRef(code));
  const room = normalizeRoom(snap.val());
  if (!room) return { ok: false, reason: 'not-found' };
  const rejoining = uid in room.players;
  // Expiry is for newcomers. This is the one comparison of this device's clock
  // with the server's left in the app (the handoff says why awayAt and the
  // countdown avoid it), and it used to run first, so it gated every reload and
  // every resume after a phone slept: a member whose clock was a day ahead, or
  // whose room had a forged createdAt, was told their own room had expired. The
  // rules make createdAt write-once, so the forgery is gone; the skew remains
  // for a newcomer, and only for one whose clock is a whole day out.
  if (!rejoining && Date.now() - room.meta.createdAt > ROOM_TTL_MS) return { ok: false, reason: 'expired' };
  if (!rejoining) {
    // A game in progress is no longer a closed door. Somebody arriving mid-round
    // is admitted as a spectator: they get a player record and no tableau, watch
    // the board live, and startRound deals them in with everybody else at the
    // next deal. The rules file dropped its lobby-only validate to allow it - the
    // 8-seat cap is untouched, because that was never what enforced it.
    if (Object.keys(room.players).length >= MAX_PLAYERS) return { ok: false, reason: 'full' };
    if (Object.values(room.players).some(p => p.badgeId === badgeId)) {
      return { ok: false, reason: 'badge-taken' };
    }
    // Atomic: the player record, the badge claim, and the playerCount bump
    // must land together, and the checks above are only a fast/friendly
    // pre-check - database.rules.json enforces the 8-player cap and badge
    // uniqueness for real, so a rejection here means another
    // client won the race (see database.rules.json for why playerCount is a
    // tracked counter rather than a live child count).
    //
    // playerCount uses the increment() sentinel, NOT `currentCount + 1`
    // computed from the snapshot read above: that read can be stale by the
    // time this write lands, so two racing joins at count 7 would both
    // compute and send the literal value 8, and both satisfy the rule's
    // "<= 8 and non-decreasing" validate (each sees data.val() go 7 -> 8
    // once, then the second racer's *own* 8 >= 8 also passes) - a real,
    // confirmed race that lets a 9th player in while the counter stays
    // wedged at 8. increment(1) instead asks the server to add 1 to
    // whatever value is actually committed at write time, so the second
    // racer's write is resolved against the FIRST racer's already-committed
    // 8, producing 9, which the <= 8 bound genuinely rejects.
    try {
      await update(roomRef(code), {
        [`players/${uid}`]: playerRecord(name, badgeId),
        [`badges/${badgeId}`]: uid,
        'meta/playerCount': increment(1),
      });
    } catch {
      return { ok: false, reason: 'race' };
    }
  } else {
    // Not awaited, on purpose. `startPresence` on the next line writes exactly
    // this value again the moment `.info/connected` reports true, so awaiting it
    // only serialized another round trip onto the resume path - which is how this
    // app is usually entered, by a reload, a phone waking, or a tab coming back
    // from sending the invite. A failure costs nothing for the same reason.
    void update(ref(db, `rooms/${code}/players/${uid}`), { connected: true }).catch(() => {});
  }
  startPresence(code, uid);
  return { ok: true, code };
}

export function watchRoom(code: string, cb: (room: Room | null) => void): () => void {
  return onValue(roomRef(code), snap => cb(normalizeRoom(snap.val())));
}

export async function peekRoom(code: string): Promise<Room | null> {
  await ensureSignedIn();
  const snap = await get(roomRef(code));
  return normalizeRoom(snap.val());
}

/**
 * Add an AI player. The host owns the record outright: bots have no auth identity,
 * so `players/$botId` is written under the host's rules grant.
 *
 * Two deliberate choices:
 * - The badge is claimed with the HOST's uid as the value, not the bot's. The
 *   badges/$badgeId .validate rule only accepts `newData.val() === auth.uid`, and
 *   claiming it this way still blocks a human from taking the same badge - which
 *   is the whole point of that node - with no rules change to deploy.
 * - meta/playerCount is left alone. It is the server-side cap on HUMAN joins, and
 *   its validate rule forbids ever decreasing it, so counting bots there would
 *   permanently eat a seat every time one was removed. The 8-seat total is held
 *   on the client instead (see MAX_PLAYERS at the call site).
 */
export async function addBot(code: string, badgeId: BadgeId, level: BotLevel, name: string): Promise<string> {
  const uid = await ensureSignedIn();
  const id = botId(badgeId);
  await update(roomRef(code), {
    [`players/${id}`]: {
      name, badgeId, joinedAt: serverTimestamp(), connected: true,
      // awayAt stays null for the life of a bot: it has no client to notice it has
    // wandered off, and the host either plays its hand or marks it stuck.
    // ready is true for the same reason - there is nothing to press it with.
    stuckAt: null, awayAt: null, score: 0, ready: true, isBot: true, botLevel: level,
    },
    [`badges/${badgeId}`]: uid,
  });
  return id;
}

export function removeBot(code: string, id: string, badgeId: BadgeId): Promise<void> {
  return update(roomRef(code), { [`players/${id}`]: null, [`badges/${badgeId}`]: null });
}

export function setTargetScore(code: string, target: number): Promise<void> {
  return set(ref(db, `rooms/${code}/meta/targetScore`), target);
}

/** "I am ready." Own record, own uid - already covered by players/$uid's rule. */
export function setReady(code: string, uid: string, on: boolean): Promise<void> {
  return set(ref(db, `rooms/${code}/players/${uid}/ready`), on ? true : null);
}

/**
 * "Deal me out" / "deal me back in."
 *
 * Sitting out takes the player OUT OF THE ROUND IN PROGRESS, but **their hand is
 * kept**, so clearing the flag puts them straight back into the round they left
 * rather than making them wait for the next deal.
 *
 * The hand is deliberately not deleted, and re-dealing one on return would be
 * worse than it sounds: `buildDeck` is per-player and every card carries its
 * owner, so a fresh deck would mint duplicates of the cards this player already
 * has sitting in the middle - same `cardId`, same layout id, playable twice.
 * Keeping the hand sidesteps that entirely and restores exactly what they put
 * down.
 *
 * The flag is therefore what every other rule reads, not the absence of a
 * tableau: `startRound` skips them, `allConnectedStuck` skips them, `tableReady`
 * skips them, and `commitScores` leaves them out of the scoring - so a round
 * played without them moves their total not at all, in either direction.
 *
 * Cards they already played to the centre stay there regardless. They are part
 * of piles other people are building on and cannot be taken back off the table.
 *
 * `ready` and `stuckAt` are cleared with it: a player who is not in the round
 * cannot meaningfully be ready for it or stuck in it, and either flag left set
 * would go on speaking for them - `tableReady` would count them on the way back
 * in without their having said so.
 *
 * Every path is the player's own, so this needs no rules change and no host.
 */
export function setSittingOut(code: string, uid: string, on: boolean): Promise<void> {
  return update(ref(db, `rooms/${code}/players/${uid}`), on
    ? { sittingOut: true, ready: null, stuckAt: null }
    : { sittingOut: null });
}

/**
 * The lobby countdown digit. Host-by-convention like the other lobby controls -
 * meta is writable by any authed client (see database.rules.json and the trust
 * model), and only the host's client ever drives it. See RoomMeta.countdown.
 */
export function setCountdown(code: string, n: number | null): Promise<void> {
  return set(ref(db, `rooms/${code}/meta/countdown`), n);
}

/**
 * Change your own name and/or badge from the lobby.
 *
 * One atomic update, and the badge RELEASE is the whole reason it has to be:
 * `badges/$badgeId` is how the room stops two players wearing the same one, so
 * claiming a new badge without giving the old one back would block it for
 * everybody for the life of the room. Both halves are already permitted -
 * the claim by the validate rule (`newData.val() === auth.uid` against a badge
 * that is free), the release because RTDB does not run validate rules on a
 * delete and `badges/$badgeId`'s .write is only `auth != null`.
 *
 * Atomic also means a race is safe: if somebody else takes the badge first, the
 * claim fails its validate, the whole update is refused, and the player keeps
 * the name AND badge they already had rather than being left holding neither.
 */
export function setIdentity(
  code: string, uid: string, name: string, badgeId: BadgeId, wasBadgeId: BadgeId,
): Promise<void> {
  const patch: Record<string, unknown> = {
    [`players/${uid}/name`]: name,
    [`players/${uid}/badgeId`]: badgeId,
  };
  if (badgeId !== wasBadgeId) {
    patch[`badges/${badgeId}`] = uid;
    patch[`badges/${wasBadgeId}`] = null;
  }
  return update(roomRef(code), patch);
}

// Host options. Host-by-convention like the other lobby controls: meta is
// writable by any authed client (see database.rules.json and the trust model).
export function setHints(code: string, on: boolean): Promise<void> {
  return set(ref(db, `rooms/${code}/meta/hintsOn`), on);
}

export function setOrderly(code: string, on: boolean): Promise<void> {
  return set(ref(db, `rooms/${code}/meta/orderlyGrid`), on);
}

/**
 * Flinging, on or off for the whole table. Written as a literal false rather than
 * removed, because normalizeRoom reads ABSENT as on - see there for why.
 */
export function setFling(code: string, on: boolean): Promise<void> {
  return set(ref(db, `rooms/${code}/meta/flingOn`), on);
}

/** The stuck-table rescue: one card per wood turn instead of three. */
export function setSingleFlip(code: string, on: boolean): Promise<void> {
  return set(ref(db, `rooms/${code}/meta/singleFlip`), on ? true : null);
}

export function setPaleCards(code: string, on: boolean): Promise<void> {
  return set(ref(db, `rooms/${code}/meta/paleCards`), on);
}

let stopPresence: (() => void) | null = null;

export function startPresence(code: string, uid: string): () => void {
  stopPresenceNow(); // never leave a zombie presence writer from a previous room/session
  const connectedRef = ref(db, '.info/connected');
  const myConnected = ref(db, `rooms/${code}/players/${uid}/connected`);
  const off = onValue(connectedRef, snap => {
    if (snap.val() === true) {
      onDisconnect(myConnected).set(false);
      set(myConnected, true);
    }
  });
  const teardown = () => {
    off();
    onDisconnect(myConnected).cancel().catch(() => {});
    set(myConnected, false).catch(() => {});
  };
  stopPresence = teardown;
  return teardown;
}

export function stopPresenceNow(): void {
  const t = stopPresence;
  stopPresence = null;
  t?.();
}
