import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { BadgeId } from '../game/badges';
import type { Card, CenterSpace, PlayerInfo, PlaySource, Room, Tableau } from '../game/types';
import { canBuildOnPost, canPlayToSpace, isStuck, placeOnPost, sourceTop, takeCard } from '../game/rules';
import { flipWood, rotateWood } from '../game/wood';
import { reconcileTableau } from '../game/center';
import { botDelay, chooseBotAction, type BotLevel } from '../game/bot';
import * as netRooms from '../net/rooms';
import * as netPlays from '../net/plays';
import type { PlayResult } from '../net/plays';
import { pickNextHost, allConnectedStuck } from '../net/plays';
import { reconnect, watchConnected } from '../net/firebase';
import type { JoinResult } from '../net/rooms';

// How long the host may stay disconnected in the watchdog below before a stand-in claims
// host. Long enough that a quick app-switch (e.g. the native share sheet for "Invite
// friends") usually does not churn host; cheap when it does anyway, because the true
// creator reclaims host immediately on return (see onSnapshot) rather than waiting this out.
export const HOST_AWAY_MS = 30000;

// How long a player may touch nothing before their own client marks them away, so
// the rest of the table stops waiting on them (see allConnectedStuck). A played
// round runs about two minutes, so three quarters of a minute of nothing is
// already unusual - and being away costs the player nothing unless everybody else
// is stuck, which is why a flat timer is enough. Being away is a fact about you,
// not about the table.
export const AWAY_MS = 45000;

export interface Deps {
  ensureSignedIn(): Promise<string>;
  watchRoom(code: string, cb: (room: Room | null) => void): () => void;
  joinRoom(code: string, name: string, badgeId: BadgeId): Promise<JoinResult>;
  createRoom(name: string, badgeId: BadgeId): Promise<string>;
  setTargetScore(code: string, n: number): Promise<void>;
  setReady(code: string, uid: string, on: boolean): Promise<void>;
  setCountdown(code: string, n: number | null): Promise<void>;
  setIdentity(code: string, uid: string, name: string, badgeId: BadgeId, wasBadgeId: BadgeId): Promise<void>;
  setHints(code: string, on: boolean): Promise<void>;
  setOrderly(code: string, on: boolean): Promise<void>;
  startRound(code: string, room: Room): Promise<void>;
  playToCenter(code: string, space: number, card: Card): Promise<PlayResult>;
  reportRace(code: string, space: number, loser: string, winner: string | null): Promise<void>;
  persistTableau(code: string, uid: string, t: Tableau): Promise<void>;
  declareStuck(code: string, uid: string): Promise<void>;
  clearStuck(code: string, uid: string): Promise<void>;
  markAway(code: string, uid: string): Promise<void>;
  clearAway(code: string, uid: string): Promise<void>;
  announceBlitz(code: string, uid: string): Promise<void>;
  endRoundStalled(code: string): Promise<void>;
  incrementStuckRounds(code: string): Promise<number>;
  commitScores(code: string, room: Room): Promise<void>;
  nextRound(code: string, room: Room): Promise<void>;
  rematch(code: string, room: Room): Promise<void>;
  claimHost(code: string, uid: string): Promise<unknown>;
  addBot(code: string, badgeId: BadgeId, level: BotLevel, name: string): Promise<string>;
  removeBot(code: string, id: string, badgeId: BadgeId): Promise<void>;
  stopPresence: () => void;
}

export interface GameStore {
  uid: string | null;
  code: string | null;
  room: Room | null;
  tableau: Tableau | null;
  selection: PlaySource | null;
  lastRejected: { card: Card; at: number; space: number } | null;
  joinPhase: 'idle' | 'joining' | 'in-room';
  joinError: string | null;
  // Hands of the AI players this client is driving. Only ever populated on the
  // host, which owns every bot's record and plays its cards (see driveBot).
  botTableaus: Record<string, Tableau>;
  // A host action (start / next round / rematch / bot management) that was
  // rejected or dropped. These used to be fire-and-forget, so a failed write
  // left the button looking dead with nothing on screen to explain it.
  actionError: string | null;
  online: boolean;
  setOnline(v: boolean): void;
  hostRoom(name: string, badgeId: BadgeId): Promise<string>;
  enterRoom(code: string, name: string, badgeId: BadgeId): Promise<JoinResult>;
  leave(): void;
  select(source: PlaySource): void;
  playTo(target: { space: number } | { post: number }): Promise<void>;
  flip(): void;
  markStuck(): void;
  /** Any sign of life from the player: clears the away flag and restarts its timer. */
  noteActivity(): void;
  /** The tab was hidden or shown. In the LOBBY that is exactly what away means. */
  noteVisible(visible: boolean): void;
  setTarget(n: number): void;
  setReady(on: boolean): void;
  setIdentity(name: string, badgeId: BadgeId): void;
  setHints(on: boolean): void;
  setOrderly(on: boolean): void;
  start(): void;
  next(): void;
  again(): void;
  addBot(badgeId: BadgeId, level: BotLevel, name: string): void;
  removeBot(id: string, badgeId: BadgeId): void;
}

export function legalTargets(
  t: Tableau, source: PlaySource, spaces: CenterSpace[],
): { spaces: number[]; posts: number[] } {
  const card = sourceTop(t, source);
  if (!card) return { spaces: [], posts: [] };
  return {
    spaces: spaces.flatMap((s, i) => (canPlayToSpace(card, s) ? [i] : [])),
    posts: t.post.flatMap((s, i) =>
      source.kind === 'post' && source.index === i ? [] : canBuildOnPost(card, s) ? [i] : []),
  };
}

export function isHost(s: { uid: string | null; room: Room | null }): boolean {
  return !!s.uid && s.room?.meta.hostId === s.uid;
}

export function myPlayer(s: { uid: string | null; room: Room | null }): PlayerInfo | null {
  return (s.uid && s.room?.players[s.uid]) || null;
}

/** How long "GO!" is on screen before the cards land. */
export const GO_MS = 700;

/**
 * Is the table ready to be counted down?
 *
 * Bots are ready by definition. An away or disconnected player blocks it even
 * with their flag set, and that is the point: away here means the tab is hidden
 * (see `noteVisible`), so starting would deal a hand to somebody who is not
 * looking at their phone. They readied, they wandered off, the table waits - and
 * the moment they come back the countdown starts by itself. The host's "Start
 * anyway" is the way past a player whose phone has died for good.
 */
export function tableReady(room: Room): boolean {
  const players = Object.values(room.players);
  if (players.length < 2) return false;
  return players.every(p => p.isBot || (p.ready === true && p.awayAt == null && p.connected));
}

export function createGameStore(deps: Deps): StoreApi<GameStore> {
  let unwatch: (() => void) | null = null;
  let hostTimer: ReturnType<typeof setTimeout> | null = null;
  let awayTimer: ReturnType<typeof setTimeout> | null = null;
  let inSnapshot = false;
  // One pending turn per bot. botBusy covers the gap between a timer firing and
  // its follow-up being scheduled, so a snapshot arriving mid-turn cannot start
  // a second loop for the same bot.
  const botTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const botBusy = new Set<string>();
  // Wood flips since each player last actually played a card. isStuck needs it to
  // tell "no move right now" (flip and try again) from "been through the whole
  // pile and there is nothing" - see isStuck in rules.ts.
  const flips = new Map<string, number>();
  // `<code>/<roundNumber>` of a score commit that was REJECTED, so it is attempted
  // once per round and not once per snapshot. A rejected write is rolled back out
  // of the local cache, which raises a fresh snapshot, which used to re-enter the
  // commit - a tight loop that hammered the database for as long as the round
  // stayed on screen. Cleared when the connection comes back, because "offline" is
  // the one cause a retry can actually fix.
  let commitFailedFor: string | null = null;
  // The lobby countdown's one and only clock. Host-side; every other client just
  // renders meta.countdown. See RoomMeta.countdown for why it is a digit rather
  // than a deadline.
  let countdownTimer: ReturnType<typeof setTimeout> | null = null;

  const store = createStore<GameStore>((set, get) => {

    async function persist(t: Tableau) {
      const { code, uid } = get();
      if (code && uid) await deps.persistTableau(code, uid, t);
    }

    /**
     * Declare or withdraw a player's stuck claim to match the board. Replaces the
     * old "I'm stuck" button: the player never has to notice or press anything,
     * and the claim is withdrawn the moment somebody else's play frees them.
     * Writes only on a transition, so a steady state costs nothing.
     */
    function syncStuck(id: string, t: Tableau | null | undefined) {
      const { room, code, online } = get();
      if (!room || !code || !t || !online) return;
      if (room.meta.phase !== 'playing' || !room.round) return;
      const p = room.players[id];
      if (!p) return;
      const stuck = isStuck(t, room.round.spaces, flips.get(id) ?? 0);
      if (stuck && p.stuckAt == null) void deps.declareStuck(code, id);
      else if (!stuck && p.stuckAt != null) void deps.clearStuck(code, id);
    }

    /** Re-check everyone this client is responsible for: me, plus my bots. */
    function syncAllStuck() {
      const s = get();
      if (!s.uid) return;
      syncStuck(s.uid, s.tableau);
      if (!isHost(s) || !s.room) return;
      for (const [id, p] of Object.entries(s.room.players)) {
        if (p.isBot) syncStuck(id, s.botTableaus[id]);
      }
    }

    /**
     * The away flag, in three parts.
     *
     * `armAway` only ever STARTS a clock that is not already running - it must not
     * restart one. Snapshots are the only thing that calls it, and a snapshot is
     * somebody else's activity, not mine; a table full of busy players would
     * otherwise keep an idle one looking present forever. It also means a reload
     * starts the clock rather than clearing it, which is the point: a tab that
     * reloads itself every so often must still be able to go away.
     *
     * `noteActivity` is the other half - the reset - and is wired to plays, flips
     * and a pointerdown anywhere on the game screen. Thinking hard for a minute is
     * being present, so it takes real input rather than a successful play.
     */
    function armAway() {
      if (awayTimer) return;
      const { uid, room } = get();
      if (uid && room?.players[uid]?.awayAt != null) return; // already away: nothing left to time
      awayTimer = setTimeout(() => {
        awayTimer = null;
        const { code, uid, room, online } = get();
        if (!code || !uid || !online) return;
        if (room?.meta.phase !== 'playing') return;
        if (room.players[uid]?.awayAt != null) return; // already marked - a reload re-armed this
        void deps.markAway(code, uid);
      }, AWAY_MS);
    }

    function disarmAway() {
      if (awayTimer) clearTimeout(awayTimer);
      awayTimer = null;
    }

    function noteActivity() {
      disarmAway();
      const { code, uid, room } = get();
      if (!code || !uid || !room) return;
      // Withdrawn on any activity in any phase - somebody tapping "next round" is
      // plainly back - but only a live round has anything to be away from.
      if (room.players[uid]?.awayAt != null) void deps.clearAway(code, uid);
      if (room.meta.phase === 'playing') armAway();
    }

    /** Run a host action, surfacing a rejected write instead of dropping it. */
    function hostAction(work: Promise<unknown>, whatFailed: string) {
      set({ actionError: null });
      work.catch(() => set({ actionError: `Could not ${whatFailed}. Check your connection and try again.` }));
    }

    function stopCountdown() {
      if (countdownTimer) clearTimeout(countdownTimer);
      countdownTimer = null;
    }

    /**
     * One second of the countdown, on the host. Re-checks the table every tick,
     * so somebody un-readying (or backgrounding their tab) at 2 stops it dead
     * rather than dealing a hand they did not agree to.
     */
    function tickCountdown() {
      countdownTimer = null;
      const s = get();
      const { code, room } = s;
      if (!code || !room || !isHost(s) || room.meta.phase !== 'lobby') return;
      if (!tableReady(room)) { void deps.setCountdown(code, null); return; }
      const n = room.meta.countdown ?? 0;
      if (n > 1) {
        void deps.setCountdown(code, n - 1);
        countdownTimer = setTimeout(tickCountdown, 1000);
        return;
      }
      if (n === 1) {
        void deps.setCountdown(code, 0);          // 0 renders as GO!
        countdownTimer = setTimeout(tickCountdown, GO_MS);
        return;
      }
      // startRound clears the digit in the same write that deals, so there is no
      // window where a client holds a countdown over a board.
      hostAction(deps.startRound(code, room), 'start the game');
    }

    /** Start or cancel the countdown to match the lobby we are looking at. */
    function syncCountdown(room: Room) {
      const s = get();
      if (!s.code || !isHost({ uid: s.uid, room }) || room.meta.phase !== 'lobby') {
        stopCountdown();
        return;
      }
      if (tableReady(room)) {
        // Guarded on the timer as well as the digit: writing 3 raises a snapshot
        // synchronously, and that snapshot must not start a second chain.
        if (room.meta.countdown == null && !countdownTimer) {
          void deps.setCountdown(s.code, 3);
          countdownTimer = setTimeout(tickCountdown, 1000);
        }
        return;
      }
      stopCountdown();
      if (room.meta.countdown != null) void deps.setCountdown(s.code, null);
    }

    function stopBots() {
      for (const t of botTimers.values()) clearTimeout(t);
      botTimers.clear();
    }

    function setBotTableau(id: string, t: Tableau) {
      set({ botTableaus: { ...get().botTableaus, [id]: t } });
    }

    /**
     * Play one bot turn. Bots have no client of their own, so the host plays
     * their hands; keeping the hand in local state (rather than re-reading the
     * room each tick) mirrors how a human's own tableau is handled, and the host
     * is the only writer of a bot's tableau so it cannot go stale underneath us.
     */
    async function driveBot(id: string) {
      const s0 = get();
      const { room, code } = s0;
      if (!room || !code || !s0.online) return;
      if (room.meta.phase !== 'playing' || !room.round) return;
      if (!isHost(s0)) return; // exactly one client drives the bots: whoever is host
      const p = room.players[id];
      if (!p?.isBot) return;
      const level: BotLevel = p.botLevel ?? 'medium';

      let t = get().botTableaus[id];
      if (!t) {
        const dealt = room.round.tableaus[id];
        if (!dealt) return; // not dealt in yet, or host changed mid-round
        t = reconcileTableau(dealt, room.round.spaces);
        setBotTableau(id, t);
      }

      const action = chooseBotAction(t, room.round.spaces, level);
      if (!action) { syncStuck(id, t); return; } // nothing to do, and maybe nothing possible

      const commit = (next: Tableau) => {
        setBotTableau(id, next);
        void deps.persistTableau(code, id, next);
        flips.set(id, 0);
        if (p.stuckAt != null) void deps.clearStuck(code, id);
        if (next.blitz.length === 0) void deps.announceBlitz(code, id);
      };

      if (action.kind === 'flip') {
        const next = flipWood(t);
        setBotTableau(id, next);
        void deps.persistTableau(code, id, next);
        flips.set(id, (flips.get(id) ?? 0) + 1);
        syncStuck(id, next);
        return;
      }
      if (action.kind === 'post') {
        const next = placeOnPost(t, action.source, action.post);
        if (next) commit(next);
        return;
      }
      const card = sourceTop(t, action.source);
      const space = room.round.spaces[action.space];
      if (!card || !space || !canPlayToSpace(card, space)) return;
      const taken = takeCard(t, action.source);
      if (!taken) return;
      // Not optimistic, unlike a human's play: a bot has no rejection animation
      // to roll back, and losing the race just means it retries next tick.
      const res = await deps.playToCenter(code, action.space, card);
      if (get().code !== code) return; // room changed mid-flight
      if (res.committed) commit(taken.next);
      // A bot losing a race is still a race: the human who beat it earned the halo.
      else void deps.reportRace(code, action.space, id, res.winner).catch(() => {});
    }

    function scheduleBot(id: string, level: BotLevel) {
      if (botTimers.has(id) || botBusy.has(id)) return;
      const fire = () => {
        botTimers.delete(id);
        botBusy.add(id);
        void driveBot(id).catch(() => {}).finally(() => {
          botBusy.delete(id);
          const s = get();
          const p = s.room?.players[id];
          if (p?.isBot && s.online && s.room?.meta.phase === 'playing' && isHost(s)) {
            scheduleBot(id, p.botLevel ?? 'medium');
          }
        });
      };
      botTimers.set(id, setTimeout(fire, botDelay(level)));
    }

    /** Start or stop the bot loops to match the room we are looking at. */
    function syncBots(room: Room) {
      const s = get();
      const shouldRun = room.meta.phase === 'playing' && isHost({ uid: s.uid, room }) && s.online;
      if (!shouldRun) { stopBots(); return; }
      for (const [id, p] of Object.entries(room.players)) {
        if (p.isBot) scheduleBot(id, p.botLevel ?? 'medium');
      }
    }

    function onSnapshot(room: Room | null) {
      const s = get();
      set({ room });
      if (!room || !s.uid) return;
      // Firebase raises local onValue events SYNCHRONOUSLY from inside set()/update(),
      // so the side effects below can re-enter this handler before it returns.
      // Re-entrant snapshots still update state (above) but must not re-run side effects.
      if (inSnapshot) return;
      inSnapshot = true;
      try {
        const me = s.uid;
        const phase = room.meta.phase;

        // (1) adopt tableau on (re)join
        if (phase === 'playing' && !get().tableau && room.round?.tableaus[me]) {
          const adopted = reconcileTableau(room.round.tableaus[me], room.round.spaces);
          set({ tableau: adopted });
          void persist(adopted);
        }
        if (phase !== 'playing' && get().tableau) set({ tableau: null, selection: null });
        // (2) AI players. Bot hands belong to a single round, exactly like ours.
        if (phase !== 'playing') { if (Object.keys(get().botTableaus).length) set({ botTableaus: {} }); flips.clear(); }
        syncBots(room);
        syncCountdown(room); // somebody readied, un-readied, joined or wandered off
        syncAllStuck(); // the centre moved: someone may have just been freed, or trapped
        if (phase === 'playing') armAway(); else disarmAway();

        // (3) all-stuck rotation.
        //
        // The `me` half of this guard used to be free: if every connected player
        // was stuck and I am connected, then I was stuck too. Skipping away
        // players broke that implication, and it broke it in exactly the shape
        // that hangs a table - one away human hosting two stuck bots would see
        // allConnectedStuck() come back true and then decline to act on it,
        // because the away player is the one client still running and it is not
        // itself stuck. So an away player rotates on the table's behalf, and its
        // own wood rotates with everyone else's: a rotation is a table-wide
        // event, and the away note is there to explain the board on return.
        const meP = room.players[me];
        const partOfIt = meP != null && (meP.stuckAt != null || meP.awayAt != null);
        if (phase === 'playing' && partOfIt && allConnectedStuck(room.players)) {
          // clear first: a snapshot raised synchronously by the writes below must not see me still stuck
          if (meP.stuckAt != null) void deps.clearStuck(get().code!, me);
          flips.set(me, 0); // a rotation changes which third of the pile is reachable
          const t = get().tableau;
          if (t) {
            const rotated = rotateWood(t);
            set({ tableau: rotated });
            void persist(rotated);
          }
          if (isHost({ uid: me, room })) {
            // Nobody else will rotate the bots' piles - the host owns their hands.
            for (const [id, p] of Object.entries(room.players)) {
              if (!p.isBot) continue;
              void deps.clearStuck(get().code!, id);
              flips.set(id, 0);
              const bt = get().botTableaus[id];
              if (bt) {
                const rotated = rotateWood(bt);
                setBotTableau(id, rotated);
                void deps.persistTableau(get().code!, id, rotated);
              }
            }
            void deps.incrementStuckRounds(get().code!).then(n => {
              if (n >= 3) void deps.endRoundStalled(get().code!);
            });
          }
        }

        // (4) host commits scores once
        //
        // Once per ROUND, not once per snapshot, and loudly when it fails. This
        // is the write the whole round end hangs off: no scores means no sheet
        // for anybody (RoundEndOverlay renders nothing without them) and no
        // running totals, and it used to fail in complete silence.
        const commitKey = `${get().code}/${room.meta.roundNumber}`;
        if (isHost({ uid: me, room }) && phase === 'roundEnd' && room.round && !room.round.scores
            && commitFailedFor !== commitKey) {
          deps.commitScores(get().code!, room).catch(() => {
            commitFailedFor = commitKey;
            set({ actionError: 'Could not save this round\'s scores. Check your connection and try again.' });
          });
        }

        // (5) creator reclaim: the creator is host whenever present, no timer needed.
        // Not gated on players[me].connected - this code executing at all means the
        // creator (me) is present; my own presence write may simply not have landed
        // yet. claimHost aborts when the caller is already host, so this cannot loop.
        if (room.meta.creatorId === me && room.meta.hostId !== me) {
          void deps.claimHost(get().code!, me);
        }

        // (6) stand-in transfer watchdog: while the host is away (including in the
        // lobby - a dead host there must be recoverable too), the longest-present
        // connected player stands in after HOST_AWAY_MS. A creator reclaim above
        // resolves this quickly when the creator returns; this covers the case
        // where they don't.
        const hostP = room.players[room.meta.hostId];
        if (hostP && !hostP.connected) {
          hostTimer ??= setTimeout(() => {
            hostTimer = null;
            const cur = get().room;
            if (!cur) return;
            const curHost = cur.players[cur.meta.hostId];
            if (curHost && !curHost.connected && pickNextHost(cur.players) === me) {
              void deps.claimHost(get().code!, me);
            }
          }, HOST_AWAY_MS);
        } else if (hostTimer) {
          clearTimeout(hostTimer);
          hostTimer = null;
        }
      } finally {
        inSnapshot = false;
      }
    }

    function watch(code: string, uid: string) {
      unwatch?.();
      unwatch = deps.watchRoom(code, onSnapshot);
      set({ code, uid, joinPhase: 'in-room' });
    }

    return {
      uid: null, code: null, room: null, tableau: null, selection: null,
      lastRejected: null, joinPhase: 'idle', joinError: null, online: true,
      botTableaus: {}, actionError: null,

      setOnline(v) {
        set({ online: v });
        // A dropped socket is the one reason a rejected score commit is worth
        // retrying, so coming back re-arms it. A rules rejection will simply fail
        // again on the next snapshot and re-latch.
        if (v) commitFailedFor = null;
        const room = get().room;
        if (room) syncBots(room); // bots idle while we are offline, resume when back
      },

      // Both of these used to let a rejection escape with joinPhase still set to
      // 'joining', which disables every join/create button on screen for good.
      // A dead socket - coming back to the tab after the phone slept, say - makes
      // Firebase's get()/update() reject exactly like that, so the wedge was
      // reachable from the most ordinary thing a phone does.
      async hostRoom(name, badgeId) {
        set({ joinPhase: 'joining', joinError: null });
        try {
          const uid = await deps.ensureSignedIn();
          const code = await deps.createRoom(name, badgeId);
          watch(code, uid);
          return code;
        } catch (e) {
          set({ joinPhase: 'idle', joinError: 'offline' });
          throw e; // the caller still needs to know not to navigate
        }
      },

      async enterRoom(code, name, badgeId) {
        set({ joinPhase: 'joining', joinError: null });
        try {
          const uid = await deps.ensureSignedIn();
          const res = await deps.joinRoom(code, name, badgeId);
          if (res.ok) watch(code, uid);
          else set({ joinPhase: 'idle', joinError: res.reason });
          return res;
        } catch {
          set({ joinPhase: 'idle', joinError: 'offline' });
          return { ok: false, reason: 'offline' };
        }
      },

      leave() {
        unwatch?.();
        unwatch = null;
        if (hostTimer) { clearTimeout(hostTimer); hostTimer = null; }
        disarmAway();
        stopBots();
        stopCountdown();
        flips.clear();
        commitFailedFor = null;
        deps.stopPresence();
        set({ code: null, room: null, tableau: null, selection: null, joinPhase: 'idle',
              botTableaus: {}, actionError: null });
      },

      select(source) {
        const cur = get().selection;
        set({ selection: JSON.stringify(cur) === JSON.stringify(source) ? null : source });
      },

      async playTo(target) {
        if (!get().online) return; // spec §8: no plays while disconnected
        // The board stays on screen under the blitz splash for over a second after
        // the round ends, and the splash does not take pointer events.
        if (get().room?.meta.phase !== 'playing') return;
        const { tableau, selection, code, uid, room } = get();
        if (!tableau || !selection || !code || !uid) return;
        noteActivity();
        set({ selection: null });

        if ('post' in target) {
          const next = placeOnPost(tableau, selection, target.post);
          if (!next) return;
          set({ tableau: next });
          void persist(next);
          flips.set(uid, 0); // progress: the wood cycle counts from here again
          void deps.clearStuck(code, uid);
          if (next.blitz.length === 0) void deps.announceBlitz(code, uid);
          return;
        }

        const card = sourceTop(tableau, selection);
        const spaceState = room?.round?.spaces[target.space];
        if (!card || !spaceState || !canPlayToSpace(card, spaceState)) return;
        const taken = takeCard(tableau, selection);
        if (!taken) return;
        set({ tableau: taken.next }); // optimistic
        const res = await deps.playToCenter(code, target.space, card);
        if (get().code !== code) return; // session changed mid-flight (leave/rejoin) - drop the stale continuation
        if (!res.committed) {
          set({ tableau, lastRejected: { card, at: Date.now(), space: target.space } }); // rollback
          void deps.reportRace(code, target.space, uid, res.winner).catch(() => {});
          return;
        }
        void persist(taken.next);
        flips.set(uid, 0);
        void deps.clearStuck(code, uid);
        if (taken.next.blitz.length === 0) void deps.announceBlitz(code, uid);
      },

      flip() {
        if (!get().online) return;
        const { tableau: t, uid } = get();
        if (!t || !uid) return;
        noteActivity();
        const next = flipWood(t);
        set({ tableau: next, selection: null });
        void persist(next);
        flips.set(uid, (flips.get(uid) ?? 0) + 1);
        syncStuck(uid, next); // one more flip may be the one that proves it
      },

      markStuck() {
        if (!get().online) return;
        const { code, uid, tableau, room } = get();
        if (!code || !uid || !tableau || !room?.round) return;
        // The button is a claim; hold it to the same bar the automatic check uses.
        if (!isStuck(tableau, room.round.spaces, flips.get(uid) ?? 0)) return;
        void deps.declareStuck(code, uid);
      },

      noteActivity,

      /**
       * Away, in the lobby, means "not looking at this tab" - and unlike the
       * 45-second idle timer that owns `awayAt` during a round, that is a thing
       * the browser tells us the instant it happens. The two never run at once:
       * this returns immediately outside the lobby, and `armAway` only arms
       * inside a round, so `awayAt` still has exactly one writer per phase.
       */
      noteVisible(visible) {
        const { code, uid, room } = get();
        if (!code || !uid || room?.meta.phase !== 'lobby') return;
        const me = room.players[uid];
        if (!me) return;
        if (!visible && me.awayAt == null) void deps.markAway(code, uid);
        else if (visible && me.awayAt != null) void deps.clearAway(code, uid);
      },

      setTarget(n) { const c = get().code; if (c) void deps.setTargetScore(c, n); },
      setReady(on) {
        const { code, uid } = get();
        if (code && uid) hostAction(deps.setReady(code, uid, on), 'change your ready state');
      },
      setIdentity(name, badgeId) {
        const { code, uid, room } = get();
        const me = uid ? room?.players[uid] : null;
        if (!code || !uid || !me) return;
        // Only in the lobby, and only before readying: the badge is how every
        // other screen colours this player's cards, so it cannot move under a
        // hand that has already been dealt.
        if (room!.meta.phase !== 'lobby' || me.ready) return;
        const trimmed = name.trim().slice(0, 14) || me.name;
        if (trimmed === me.name && badgeId === me.badgeId) return;
        hostAction(deps.setIdentity(code, uid, trimmed, badgeId, me.badgeId),
          badgeId === me.badgeId ? 'change your name' : 'change your badge');
      },
      setHints(on) { const c = get().code; if (c) void deps.setHints(c, on); },
      setOrderly(on) { const c = get().code; if (c) void deps.setOrderly(c, on); },
      start() {
        const { code, room } = get();
        if (code && room) hostAction(deps.startRound(code, room), 'start the game');
      },
      next() {
        const { code, room } = get();
        if (code && room) hostAction(deps.nextRound(code, room), 'start the next round');
      },
      again() {
        const { code, room } = get();
        if (code && room) hostAction(deps.rematch(code, room), 'start a rematch');
      },
      addBot(badgeId, level, name) {
        const code = get().code;
        if (code) hostAction(deps.addBot(code, badgeId, level, name), 'add an AI player');
      },
      removeBot(id, badgeId) {
        const code = get().code;
        if (code) hostAction(deps.removeBot(code, id, badgeId), 'remove that AI player');
      },
    };
  });

  return store;
}

const realDeps: Deps = {
  ensureSignedIn: () => import('../net/firebase').then(m => m.ensureSignedIn()),
  watchRoom: netRooms.watchRoom,
  joinRoom: netRooms.joinRoom,
  createRoom: netRooms.createRoom,
  setTargetScore: netRooms.setTargetScore,
  setReady: netRooms.setReady,
  setCountdown: netRooms.setCountdown,
  setIdentity: netRooms.setIdentity,
  setHints: netRooms.setHints,
  setOrderly: netRooms.setOrderly,
  startRound: netPlays.startRound,
  playToCenter: netPlays.playToCenter,
  reportRace: netPlays.reportRace,
  persistTableau: netPlays.persistTableau,
  declareStuck: netPlays.declareStuck,
  clearStuck: netPlays.clearStuck,
  markAway: netPlays.markAway,
  clearAway: netPlays.clearAway,
  announceBlitz: netPlays.announceBlitz,
  endRoundStalled: netPlays.endRoundStalled,
  incrementStuckRounds: netPlays.incrementStuckRounds,
  commitScores: netPlays.commitScores,
  nextRound: netPlays.nextRound,
  rematch: netPlays.rematch,
  claimHost: netPlays.claimHost,
  addBot: netRooms.addBot,
  removeBot: netRooms.removeBot,
  stopPresence: netRooms.stopPresenceNow,
};

export const gameStore = createGameStore(realDeps);
try {
  watchConnected(ok => gameStore.getState().setOnline(ok));
  // Coming back from another app is exactly when the socket is most likely to be
  // dead. Nudge it on return, then again shortly after: .info/connected can still
  // read true for a moment because the frozen tab has not yet processed the drop,
  // and we must not flap presence for everyone else by reconnecting when fine.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      const visible = document.visibilityState === 'visible';
      // Both directions, unlike the reconnect nudge below: the lobby's Away
      // state is the leaving half, and it has to land while the tab still can.
      gameStore.getState().noteVisible(visible);
      if (!visible) return;
      const nudgeIfDown = () => { if (!gameStore.getState().online) reconnect(); };
      nudgeIfDown();
      setTimeout(nudgeIfDown, 2500);
    });
  }
} catch {
  // module side effect: fine to skip when no Firebase backend is reachable (tests)
}
export function useGameStore<T>(selector: (s: GameStore) => T): T {
  return useStore(gameStore, selector);
}
