import { spaceOwner } from '../game/center';
import type { CenterSpace, RaceRecord } from '../game/types';

export type RaceKind = 'angry' | 'angel';
export interface RaceFlash { kind: RaceKind; at: number }

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
 * remounts and replays the animation. Nothing here compares it to the time.
 */
export function raceFlashes(args: {
  races?: Record<string, RaceRecord> | null;
  spaces: CenterSpace[];
  uid: string | null;
  lastRejected?: { space: number; at: number } | null;
}): Record<number, RaceFlash> {
  const out: Record<number, RaceFlash> = {};
  if (args.uid) {
    for (const [key, rec] of Object.entries(args.races ?? {})) {
      const i = Number(key);
      if (!Number.isInteger(i) || !rec || rec.by === args.uid) continue;
      if (spaceOwner(args.spaces[i]) === args.uid) out[i] = { kind: 'angel', at: rec.at };
    }
  }
  // Last, so that losing a space I earlier won shows the scowl, not the halo.
  if (args.lastRejected) {
    out[args.lastRejected.space] = { kind: 'angry', at: args.lastRejected.at };
  }
  return out;
}
