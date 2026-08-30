import { scoreRound } from '../game/scoring';
import type { CenterSpace, PlayerInfo, Tableau } from '../game/types';

/** What falls on this particular viewer, and whether a trophy falls with it. */
export type SplashBase = 'glitter' | 'poo' | 'crying' | 'relief' | 'toilet';
export interface Splash { base: SplashBase; trophy: boolean }

/**
 * The blitzer gets the celebration. Everyone else gets told what the round just
 * did to them, which is a more interesting question than "did you win".
 *
 * The four losing faces, in the order they are tested:
 *
 * - **🚽 toilet** - they have just DROPPED into last place. The newest bad news
 *   on the table, and it outranks simply being last.
 * - **🥹 relief** - they were last and are not any more. Also the newest good
 *   news, which is why it beats the plain tears.
 * - **💩 poo** - still holding the worst total, at three or more players. At two
 *   it is only ever one person's turn to be behind, and rubbing it in is mean.
 * - **😢 crying** - everybody else.
 *
 * **🏆 falls WITH whichever of those you got** if you lead the table after this
 * round, because leading and not blitzing is a real thing to feel two ways about.
 * The blitzer never needs it: they already have the glitter.
 *
 * The standings are PROJECTED. The splash fires the moment blitz is announced,
 * which is before the host has committed anything, so `player.score` is still
 * last round's total - and "dropped into last" is a question about this round.
 * `scoreRound` is the same pure function the host is about to run on the same
 * board, so the projection is the host's arithmetic done early rather than a
 * guess. It can differ only where a play is still being reconciled.
 */
export function splashVariant(
  players: Record<string, PlayerInfo>, blitzedBy: string, uid: string | null,
  round?: { spaces: CenterSpace[]; tableaus: Record<string, Tableau> } | null,
): Splash {
  if (uid === blitzedBy) return { base: 'glitter', trophy: false };
  const me = uid ? players[uid] : undefined;
  if (!me) return { base: 'crying', trophy: false };

  const ids = Object.keys(players);
  const deltas = round ? scoreRound(round.spaces, round.tableaus) : {};
  const before = (id: string) => players[id].score;
  const after = (id: string) => players[id].score + (deltas[id]?.delta ?? 0);

  const lowest = (at: (id: string) => number) => Math.min(...ids.map(at));
  const highest = (at: (id: string) => number) => Math.max(...ids.map(at));
  // "Last" means strictly last: on a level table nobody has dropped anywhere, and
  // handing every tied player a toilet would be a lie about a change that did not
  // happen. Same reasoning as `basement` in the commentary.
  const isLast = (at: (id: string) => number) =>
    at(uid!) === lowest(at) && lowest(at) < highest(at);

  const trophy = ids.length > 1 && after(uid!) === highest(after)
    && highest(after) > lowest(after);

  const wasLast = isLast(before);
  const nowLast = isLast(after);
  if (nowLast && !wasLast) return { base: 'toilet', trophy };
  if (wasLast && !nowLast) return { base: 'relief', trophy };
  if (nowLast && ids.length > 2) return { base: 'poo', trophy };
  return { base: 'crying', trophy };
}
