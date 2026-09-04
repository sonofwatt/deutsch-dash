/**
 * The build a player is looking at, shown at the foot of the home and lobby
 * screens so a report from a table can be tied to one. **This is the only place
 * in the app that states a version** - the same one-place rule the handoff's test
 * count keeps, and for the same reason: it drifted three ways when it lived in
 * four places.
 *
 * `v<major>.<minor>.<patch>`, and the last two are DERIVED rather than typed, so
 * bumping this is incrementing one of the two counters below and nothing else.
 *
 * - **MAJOR is manual.** It moves when the table says a release is major, never
 *   by arithmetic. Everything else can accumulate underneath it indefinitely.
 * - **A batch of feature work is worth 10**, however many items it holds. The
 *   twenty-item batch and the three-item one earned the same, because a batch is
 *   a thing the table asked for and got, not a line count.
 * - **A small change is worth 1**: a tuning pass, a lone fix, a docs sweep.
 * - The running total splits at 100, so the patch field is exactly "feature
 *   batches this hundred, then small changes" - tens digit and units digit - and
 *   ten batches carry into the minor.
 *
 * The counts came off the handoff's History table rather than the commit log,
 * because that table is the curated record of what actually shipped.
 */
const MAJOR = 1;
/** Rounds of feature work since the Deutsch Dash rename (`1529330`). */
const FEATURE_BATCHES = 35;
/** Tweaks, lone fixes and documentation passes over the same stretch. */
const SMALL_CHANGES = 45;

/**
 * Pure, and tested by worked example, so bumping the counters above never means
 * editing a test to match. That mattered enough to be worth the extra function:
 * a version whose test has to be re-pinned on every bump is a version somebody
 * will eventually bump without running the tests.
 */
export function formatVersion(major: number, batches: number, small: number): string {
  const count = batches * 10 + small;
  return `v${major}.${Math.floor(count / 100)}.${String(count % 100).padStart(2, '0')}`;
}

export const APP_VERSION = formatVersion(MAJOR, FEATURE_BATCHES, SMALL_CHANGES);
