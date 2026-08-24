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
import type { JoinResult } from '../net/rooms';

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

  const store = createStore<GameStore>((set, get) => {

    async function persist(t: Tableau) {
      const { code, uid } = get();
      if (code && uid) await deps.persistTableau(code, uid, t);
    }

    function onSnapshot(room: Room | null) {
      const s = get();
      set({ room });
      if (!room || !s.uid) return;
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
        const t = get().tableau;
        if (t) {
          const rotated = rotateWood(t);
          set({ tableau: rotated });
          void persist(rotated);
        }
        void deps.clearStuck(get().code!, me);
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

      // (5) host transfer watchdog
      const hostP = room.players[room.meta.hostId];
      if (hostP && !hostP.connected && phase !== 'lobby') {
        hostTimer ??= setTimeout(() => {
          hostTimer = null;
          const cur = get().room;
          if (!cur) return;
          const curHost = cur.players[cur.meta.hostId];
          if (curHost && !curHost.connected && pickNextHost(cur.players) === me) {
            void deps.claimHost(get().code!, me);
          }
        }, 5000);
      } else if (hostTimer) {
        clearTimeout(hostTimer);
        hostTimer = null;
      }
    }

    function watch(code: string, uid: string) {
      unwatch?.();
      unwatch = deps.watchRoom(code, onSnapshot);
      set({ code, uid, joinPhase: 'in-room' });
    }

    return {
      uid: null, code: null, room: null, tableau: null, selection: null,
      lastRejected: null, joinPhase: 'idle', joinError: null,

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
        set({ code: null, room: null, tableau: null, selection: null, joinPhase: 'idle' });
      },

      select(source) {
        const cur = get().selection;
        set({ selection: JSON.stringify(cur) === JSON.stringify(source) ? null : source });
      },

      async playTo(target) {
        const { tableau, selection, code, uid, room } = get();
        if (!tableau || !selection || !code || !uid) return;
        set({ selection: null });

        if ('post' in target) {
          const next = placeOnPost(tableau, selection, target.post);
          if (!next) return;
          set({ tableau: next });
          void persist(next);
          void deps.clearStuck(code, uid);
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
        const t = get().tableau;
        if (!t) return;
        const next = flipWood(t);
        set({ tableau: next, selection: null });
        void persist(next);
      },

      markStuck() {
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
};

export const gameStore = createGameStore(realDeps);
export function useGameStore<T>(selector: (s: GameStore) => T): T {
  return useStore(gameStore, selector);
}
