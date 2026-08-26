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
import { pickNextHost, allConnectedStuck } from '../net/plays';
import { reconnect, watchConnected } from '../net/firebase';
import type { JoinResult } from '../net/rooms';

// How long the host may stay disconnected in the watchdog below before a stand-in claims
// host. Long enough that a quick app-switch (e.g. the native share sheet for "Invite
// friends") usually does not churn host; cheap when it does anyway, because the true
// creator reclaims host immediately on return (see onSnapshot) rather than waiting this out.
export const HOST_AWAY_MS = 30000;

export interface Deps {
  ensureSignedIn(): Promise<string>;
  watchRoom(code: string, cb: (room: Room | null) => void): () => void;
  joinRoom(code: string, name: string, badgeId: BadgeId): Promise<JoinResult>;
  createRoom(name: string, badgeId: BadgeId): Promise<string>;
  setTargetScore(code: string, n: number): Promise<void>;
  startRound(code: string, room: Room): Promise<void>;
  playToCenter(code: string, space: number, card: Card): Promise<boolean>;
  reportRace(code: string, space: number, uid: string): Promise<void>;
  persistTableau(code: string, uid: string, t: Tableau): Promise<void>;
  declareStuck(code: string, uid: string): Promise<void>;
  clearStuck(code: string, uid: string): Promise<void>;
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
  setTarget(n: number): void;
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

export function createGameStore(deps: Deps): StoreApi<GameStore> {
  let unwatch: (() => void) | null = null;
  let hostTimer: ReturnType<typeof setTimeout> | null = null;
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

    /** Run a host action, surfacing a rejected write instead of dropping it. */
    function hostAction(work: Promise<unknown>, whatFailed: string) {
      set({ actionError: null });
      work.catch(() => set({ actionError: `Could not ${whatFailed}. Check your connection and try again.` }));
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
      const committed = await deps.playToCenter(code, action.space, card);
      if (get().code !== code) return; // room changed mid-flight
      if (committed) commit(taken.next);
      // A bot losing a race is still a race: the human who beat it earned the halo.
      else void deps.reportRace(code, action.space, id).catch(() => {});
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
        syncAllStuck(); // the centre moved: someone may have just been freed, or trapped

        // (3) all-stuck rotation
        const meP = room.players[me];
        if (phase === 'playing' && meP?.stuckAt != null && allConnectedStuck(room.players)) {
          // clear first: a snapshot raised synchronously by the writes below must not see me still stuck
          void deps.clearStuck(get().code!, me);
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
        if (isHost({ uid: me, room }) && phase === 'roundEnd' && room.round && !room.round.scores) {
          void deps.commitScores(get().code!, room);
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
        stopBots();
        flips.clear();
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
        const committed = await deps.playToCenter(code, target.space, card);
        if (get().code !== code) return; // session changed mid-flight (leave/rejoin) - drop the stale continuation
        if (!committed) {
          set({ tableau, lastRejected: { card, at: Date.now(), space: target.space } }); // rollback
          void deps.reportRace(code, target.space, uid).catch(() => {});
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

      setTarget(n) { const c = get().code; if (c) void deps.setTargetScore(c, n); },
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
  startRound: netPlays.startRound,
  playToCenter: netPlays.playToCenter,
  reportRace: netPlays.reportRace,
  persistTableau: netPlays.persistTableau,
  declareStuck: netPlays.declareStuck,
  clearStuck: netPlays.clearStuck,
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
      if (document.visibilityState !== 'visible') return;
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
