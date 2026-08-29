/**
 * The build a player is looking at, shown at the foot of the home and lobby
 * screens so a playtest report can be tied to a build. **This is the only place
 * in the app that states a version** - the same rule the test count in the
 * handoff keeps, and for the same reason.
 *
 * How to bump it, from a v1.00 baseline at the Deutsch Dash rename (`1529330`),
 * which is where the handoff already starts counting:
 *
 * - **A batch of feature work is +0.10.** One round of requests from the table,
 *   however many items it turns out to contain - the twenty-item batch and the
 *   three-item one each moved it by the same tenth, because a batch is a thing
 *   the table asked for and got, not a line count.
 * - **A small change is +0.01.** A tuning pass, a tweak, a fix on its own, a
 *   documentation sweep.
 *
 * At v3.41 that is 23 feature batches and 11 small changes, counted off the
 * handoff's own History table, which is the curated record of what actually
 * shipped rather than of what was committed.
 */
export const APP_VERSION = 'v3.41';
