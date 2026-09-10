import { spaceOwner } from '../game/center';
import type { CenterSpace, RaceRecord } from '../game/types';

export type RaceKind = 'angry' | 'angel';
/** `n` is how many faces to draw: one scowl, or one halo per player who lost. */
export interface RaceFlash { kind: RaceKind; at: number; n: number }

/**
 * Who gets a face over which centre space, from this viewer's seat.
 *
 * A race has exactly one observer that knows it happened: the loser, whose
 * transaction aborted. A winning transaction is indistinguishable from an
 * uncontested play, so the loser writes `round/races/<space>` and every client
 * reads the winner off the board - whoever's card is on top of that space now.
 *
 * The loser's own scowl comes from local state rather than that record, so it
 * lands immediately and survives a failed write.
 *
 * `at` is a nonce for the view, not a clock: it keys the element so a fresh race
 * remounts and replays the animation.
 *
 * **The winner gets one halo per opponent who went for it**, from `lost`, which
 * every loser adds their own name to. `window` is what keeps that about THIS
 * race: a space is contested more than once in a round - a pile finishing on a 10
 * empties it and the whole fight starts again - and `lost` accumulates for the
 * round, so entries older than the latest report by more than the grace period
 * belonged to an earlier scrap and are not counted. It is the caller's
 * RACE_GRACE_MS, passed in rather than imported, so this file stays a pure
 * function of its arguments.
 *
 * A record with no `lost` at all is a room that was mid-round when this shipped:
 * one halo, exactly as before.
 */
export function raceFlashes(args: {
  races?: Record<string, RaceRecord> | null;
  spaces: CenterSpace[];
  uid: string | null;
  lastRejected?: { space: number; at: number } | null;
  /** How long a race lasts, for grouping `lost`. The store's RACE_GRACE_MS. */
  window: number;
}): Record<number, RaceFlash> {
  const out: Record<number, RaceFlash> = {};
  if (args.uid) {
    for (const [key, rec] of Object.entries(args.races ?? {})) {
      const i = Number(key);
      if (!Number.isInteger(i) || !rec || rec.by === args.uid) continue;
      if (spaceOwner(args.spaces[i]) !== args.uid) continue;
      const losers = Object.entries(rec.lost ?? {})
        .filter(([id, at]) => id !== args.uid && at >= rec.at - args.window);
      out[i] = { kind: 'angel', at: rec.at, n: Math.max(1, losers.length) };
    }
  }
  // Last, so that losing a space I earlier won shows the scowl, not the halo.
  if (args.lastRejected) {
    out[args.lastRejected.space] = { kind: 'angry', at: args.lastRejected.at, n: 1 };
  }
  return out;
}

/**
 * Where the f-th of n faces sits, as a percentage of the slot.
 *
 * They overlap on purpose. A face is about 62% of a slot wide, so laying several
 * out without touching would need a step that big and the fan would run over the
 * neighbouring spaces - which it did at 58%, badly enough that three haloes on one
 * slot reached across two others. Overlapping like a fanned hand reads as several
 * faces at a glance, which is the whole message, and the spread is CAPPED so that
 * seven losers at an eight-player table stay in roughly the room three take.
 */
export function faceOffset(f: number, n: number): number {
  if (n <= 1) return 0;
  const step = Math.min(30, 90 / (n - 1));
  return (f - (n - 1) / 2) * step;
}
