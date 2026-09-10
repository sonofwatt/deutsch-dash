import { scoreRound } from '../game/scoring';
import { statsFor, type GameStats } from '../game/stats';
import type { CenterSpace, PlayerInfo, Tableau } from '../game/types';

/** What falls on this particular viewer, and what falls alongside it. */
export type SplashBase = 'glitter' | 'poo' | 'crying' | 'relief' | 'toilet';
export interface Splash { base: SplashBase; trophy: boolean; fire: boolean }

/**
 * The dasher gets the celebration. Everyone else gets told what the round just
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
 * round, because leading and not dashing is a real thing to feel two ways about.
 * The dasher never needs it: they already have the glitter.
 *
 * **🔥 falls with the glitter** when the dasher has now ended two or more rounds
 * in a row. It used to be a third of the celebration every single time, which
 * made it wallpaper - it said "you dashed" alongside two glyphs already saying
 * that. Kept back for a run, it says something the board does not.
 *
 * Every glyph here is about the VIEWER, which is what decides who sees the fire:
 * the glitter is you dashing, the toilet is you dropping, the trophy is you
 * leading, so the fire is YOUR run and nobody else's. Only the dasher can be on
 * one at the moment they dash, so it never leaves the celebration.
 *
 * **Both the standings and the streak are PROJECTED**, for the same reason: the
 * splash fires the moment dash is announced, which is before the host has
 * committed anything. So `player.score` is still last round's total while
 * "dropped into last" is a question about THIS round, and `dashStreak` is the
 * run as it stood BEFORE this dash. `scoreRound` is the same pure function the
 * host is about to run on the same board, so the standings are the host's
 * arithmetic done early rather than a guess; the streak needs no arithmetic at
 * all, only the offset by one that the test below spells out. Either can differ
 * only where a play is still being reconciled.
 *
 * Stats are a best-effort write whose failure is swallowed (see `commitScores`),
 * so a lost one shows a fire a round late or not at all. That is the right way
 * for this to fail: it decorates a celebration, and nothing that only decorates
 * a round may cost it anything.
 */
export function splashVariant(
  players: Record<string, PlayerInfo>, dashedBy: string, uid: string | null,
  round?: { spaces: CenterSpace[]; tableaus: Record<string, Tableau> } | null,
  stats?: GameStats | null,
): Splash {
  if (uid === dashedBy) {
    // >= 1 and not >= 2: the dash on screen is not in the stored run yet.
    const fire = statsFor(stats, dashedBy).dashStreak >= 1;
    return { base: 'glitter', trophy: false, fire };
  }
  const me = uid ? players[uid] : undefined;
  if (!me) return { base: 'crying', trophy: false, fire: false };

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
  if (nowLast && !wasLast) return { base: 'toilet', trophy, fire: false };
  if (wasLast && !nowLast) return { base: 'relief', trophy, fire: false };
  if (nowLast && ids.length > 2) return { base: 'poo', trophy, fire: false };
  return { base: 'crying', trophy, fire: false };
}
