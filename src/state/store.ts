import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { BadgeId } from '../game/badges';
import type { Card, CenterSpace, PlayerInfo, PlaySource, Room, Tableau } from '../game/types';
import { canBuildOnPost, canPlayToCenter, hasLegalMove, placeOnPost, sourceTop, takeCard } from '../game/rules';
import { flipWood, rotateWood } from '../game/wood';
import { reconcileTableau } from '../game/center';
import * as netRooms from '../net/rooms';
import * as netPlays from '../net/plays';
import { pickNextHost, allConnectedStuck } from '../net/plays';
import { watchConnected } from '../net/firebase';
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
  stopPresence: () => void;
}

export interface GameStore {
  uid: string | null;
  code: string | null;
  room: Room | null;
  tableau: Tableau | null;
  selection: PlaySource | null;
  lastRejected: { card: Card; at: number } | null;
  joinPhase: 'idle' | 'joining' | 'in-room';
  joinError: string | null;
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
}

export function legalTargets(
  t: Tableau, source: PlaySource, spaces: CenterSpace[],
): { spaces: number[]; posts: number[] } {
  const card = sourceTop(t, source);
  if (!card) return { spaces: [], posts: [] };
  return {
    spaces: spaces.flatMap((s, i) => (canPlayToCenter(card, s.stack) ? [i] : [])),
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

  const store = createStore<GameStore>((set, get) => {

    async function persist(t: Tableau) {
      const { code, uid } = get();
      if (code && uid) await deps.persistTableau(code, uid, t);
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

        // (3) all-stuck rotation
        const meP = room.players[me];
        if (phase === 'playing' && meP?.stuckAt != null && allConnectedStuck(room.players)) {
          // clear first: a snapshot raised synchronously by the writes below must not see me still stuck
          void deps.clearStuck(get().code!, me);
          const t = get().tableau;
          if (t) {
            const rotated = rotateWood(t);
            set({ tableau: rotated });
            void persist(rotated);
          }
          if (isHost({ uid: me, room })) {
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

      setOnline(v) { set({ online: v }); },

      async hostRoom(name, badgeId) {
        set({ joinPhase: 'joining', joinError: null });
        const uid = await deps.ensureSignedIn();
        const code = await deps.createRoom(name, badgeId);
        watch(code, uid);
        return code;
      },

      async enterRoom(code, name, badgeId) {
        set({ joinPhase: 'joining', joinError: null });
        const uid = await deps.ensureSignedIn();
        const res = await deps.joinRoom(code, name, badgeId);
        if (res.ok) watch(code, uid);
        else set({ joinPhase: 'idle', joinError: res.reason });
        return res;
      },

      leave() {
        unwatch?.();
        unwatch = null;
        if (hostTimer) { clearTimeout(hostTimer); hostTimer = null; }
        deps.stopPresence();
        set({ code: null, room: null, tableau: null, selection: null, joinPhase: 'idle' });
      },

      select(source) {
        const cur = get().selection;
        set({ selection: JSON.stringify(cur) === JSON.stringify(source) ? null : source });
      },

      async playTo(target) {
        if (!get().online) return; // spec §8: no plays while disconnected
        const { tableau, selection, code, uid, room } = get();
        if (!tableau || !selection || !code || !uid) return;
        set({ selection: null });

        if ('post' in target) {
          const next = placeOnPost(tableau, selection, target.post);
          if (!next) return;
          set({ tableau: next });
          void persist(next);
          void deps.clearStuck(code, uid);
          if (next.blitz.length === 0) void deps.announceBlitz(code, uid);
          return;
        }

        const card = sourceTop(tableau, selection);
        const spaceState = room?.round?.spaces[target.space];
        if (!card || !spaceState || !canPlayToCenter(card, spaceState.stack)) return;
        const taken = takeCard(tableau, selection);
        if (!taken) return;
        set({ tableau: taken.next }); // optimistic
        const committed = await deps.playToCenter(code, target.space, card);
        if (get().code !== code) return; // session changed mid-flight (leave/rejoin) - drop the stale continuation
        if (!committed) {
          set({ tableau, lastRejected: { card, at: Date.now() } }); // rollback
          return;
        }
        void persist(taken.next);
        void deps.clearStuck(code, uid);
        if (taken.next.blitz.length === 0) void deps.announceBlitz(code, uid);
      },

      flip() {
        if (!get().online) return;
        const t = get().tableau;
        if (!t) return;
        const next = flipWood(t);
        set({ tableau: next, selection: null });
        void persist(next);
      },

      markStuck() {
        if (!get().online) return;
        const { code, uid, tableau, room } = get();
        if (!code || !uid || !tableau || !room?.round) return;
        if (hasLegalMove(tableau, room.round.spaces)) return; // button is a claim; verify it
        void deps.declareStuck(code, uid);
      },

      setTarget(n) { const c = get().code; if (c) void deps.setTargetScore(c, n); },
      start() { const { code, room } = get(); if (code && room) void deps.startRound(code, room); },
      next() { const { code, room } = get(); if (code && room) void deps.nextRound(code, room); },
      again() { const { code, room } = get(); if (code && room) void deps.rematch(code, room); },
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
  stopPresence: netRooms.stopPresenceNow,
};

export const gameStore = createGameStore(realDeps);
try {
  watchConnected(ok => gameStore.getState().setOnline(ok));
} catch {
  // module side effect: fine to skip when no Firebase backend is reachable (tests)
}
export function useGameStore<T>(selector: (s: GameStore) => T): T {
  return useStore(gameStore, selector);
}
