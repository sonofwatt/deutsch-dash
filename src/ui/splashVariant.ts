import { scoreRound } from '../game/scoring';
import { statsFor, type GameStats } from '../game/stats';
import type { CenterSpace, PlayerInfo, RoundScore, Tableau } from '../game/types';

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
 * **🏆 falls WITH whatever else you got** if you lead the table after this round.
 * On a losing face that is a real thing to feel two ways about; on the dasher's
 * glitter it is the other half of the news, and the table asked for it there on
 * 2026-09-10. Dashing and leading are two different achievements and the round
 * where they land together is the one worth marking - a dasher propping up the
 * table gets the glitter and no trophy, exactly as before.
 *
 * **🔥 falls with the glitter** when the dasher has now ended two or more rounds
 * in a row. It used to be a third of the celebration every single time, which
 * made it wallpaper - it said "you dashed" alongside two glyphs already saying
 * that. Kept back for a run, it says something the board does not.
 *
 * Every glyph here is about the VIEWER, which is what decides who sees the fire:
 * the glitter is you dashing, the toilet is you dropping, the trophy is you
 * leading, so the fire is YOUR run and nobody else's. Only the dasher can be on
 * one at the moment they dash, so it never leaves the celebration. The trophy is
 * the one that can now land on any of them, dasher included - three glyphs is the
 * most anybody can get, and only by dashing, leading and being on a run at once.
 *
 * **The standings are read in one of two ways, and choosing wrong double-counts
 * the round.** On most phones the splash fires before the host has committed
 * anything, so `player.score` is still last round's total and this round has to
 * be PROJECTED - `scoreRound` is the same pure function the host is about to run
 * on the same board, so that is the host's arithmetic done early, not a guess.
 *
 * **On the host's own phone it has already happened.** `commitScores` writes
 * `round/scores` and every `players/$uid/score` in one atomic update, RTDB applies
 * it to the local cache synchronously, and the host's store runs the commit from
 * inside the very snapshot that turns the phase - so by the time the splash
 * samples the store, the totals already include this round. Projecting on top of
 * that counted the round twice: a player leading 21 to 17 read as 24 to 28, and
 * the leader was handed tears without the trophy. Reported from a table on
 * 2026-09-11, by the host, which is the one phone this always happened on.
 *
 * The discriminator is `round.scores`, and it is exact rather than a heuristic:
 * the one atomic write carries both, so if the scores are there the totals
 * include them, and if they are not the totals do not.
 *
 * `dashStreak` is the run as it stood BEFORE this dash - the stats go in a
 * SECOND write after the scores, so they are not in the sampled snapshot even on
 * the host - and needs only the offset by one that the test below spells out.
 *
 * Stats are a best-effort write whose failure is swallowed (see `commitScores`),
 * so a lost one shows a fire a round late or not at all. That is the right way
 * for this to fail: it decorates a celebration, and nothing that only decorates
 * a round may cost it anything.
 */
export function splashVariant(
  players: Record<string, PlayerInfo>, dashedBy: string, uid: string | null,
  round?: {
    spaces: CenterSpace[]; tableaus: Record<string, Tableau>;
    scores?: Record<string, RoundScore> | null;
  } | null,
  stats?: GameStats | null,
): Splash {
  const me = uid ? players[uid] : undefined;
  const ids = Object.keys(players);
  // Committed already (always, on the host's own phone): the totals include this
  // round, so they ARE the after, and the before is them less the round. Not yet:
  // the totals are last round's, and this round is projected on top. See above -
  // doing the second when the first is true counts the round twice.
  const committed = round?.scores ?? null;
  const deltas = committed ?? (round ? scoreRound(round.spaces, round.tableaus) : {});
  const before = (id: string) =>
    players[id].score - (committed ? committed[id]?.delta ?? 0 : 0);
  const after = (id: string) =>
    players[id].score + (committed ? 0 : deltas[id]?.delta ?? 0);

  const lowest = (at: (id: string) => number) => Math.min(...ids.map(at));
  const highest = (at: (id: string) => number) => Math.max(...ids.map(at));

  /**
   * Leading the table on the round's FINAL score, which is what the table asked
   * the trophy to mean. Projected like everything else here - the splash fires
   * when the dash is announced, before the host has committed anything - so this
   * is the host's own arithmetic run early rather than last round's standings.
   *
   * Computed above the dasher's branch so it can reach them too. It needs `me`,
   * because a viewer with no seat has no standing to lead from; the short-circuit
   * is what keeps `after(uid!)` from reading a player who is not there.
   *
   * `highest > lowest` is the same "strictly" rule the toilet uses below: on a
   * level table nobody leads, and handing out a trophy each would be a lie about
   * a gap that does not exist.
   */
  const trophy = !!me && ids.length > 1 && after(uid!) === highest(after)
    && highest(after) > lowest(after);

  if (uid === dashedBy) {
    // >= 1 and not >= 2: the dash on screen is not in the stored run yet.
    const fire = statsFor(stats, dashedBy).dashStreak >= 1;
    return { base: 'glitter', trophy, fire };
  }
  if (!me) return { base: 'crying', trophy: false, fire: false };

  // "Last" means strictly last: on a level table nobody has dropped anywhere, and
  // handing every tied player a toilet would be a lie about a change that did not
  // happen. Same reasoning as `basement` in the commentary.
  const isLast = (at: (id: string) => number) =>
    at(uid!) === lowest(at) && lowest(at) < highest(at);

  const wasLast = isLast(before);
  const nowLast = isLast(after);
  if (nowLast && !wasLast) return { base: 'toilet', trophy, fire: false };
  if (wasLast && !nowLast) return { base: 'relief', trophy, fire: false };
  if (nowLast && ids.length > 2) return { base: 'poo', trophy, fire: false };
  return { base: 'crying', trophy, fire: false };
}
