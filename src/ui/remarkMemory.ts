/**
 * Which remarks the carousel has already shown, so the next round gets different
 * ones.
 *
 * Asked for on 2026-09-10: "cycle through them - don't re-use a remark from a
 * previous round unless the others aren't relevant." The rules overlap enough
 * that the same handful wins on priority every round, and a carousel that says
 * the same six things after every round is one people stop reading.
 *
 * **Kept per ROUND and only ever read backwards.** `remarksForRoom` is called
 * fresh on every render - the carousel re-renders on a timer - so a memory that
 * recorded what it returned and then read it back would change its own answer
 * between two renders of the same sheet. Recording under the round number and
 * only ever consulting rounds BEFORE the one being drawn makes it stable: the
 * input to round N never changes once round N exists.
 *
 * **Client-local, and deliberately.** It lives in module state rather than in
 * `stats`, so two phones at one table can drift apart on which lines they have
 * seen - a player who joined at round four has a shorter memory than the host.
 * That is the right trade for a decoration: the alternative is a database write
 * per round carrying a list of joke ids, and a shape in `stats` that every client
 * has to agree on before the sheet can be drawn.
 */

/**
 * How many rounds a remark sits out before it may come back.
 *
 * Not "for ever", which is what "a previous round" could be read as: with six
 * shown a round, a whole-game memory goes cold after three or four rounds and
 * every remark is equally stale, which is the same as having no memory at all.
 * Two rounds keeps roughly a dozen ids warm - enough to force real rotation, and
 * short enough that a good line comes back around.
 */
export const RECALL_ROUNDS = 2;

/** roundNumber to the remark ids drawn in it. One game's worth. */
type Shown = Map<number, string[]>;
let shown: Shown = new Map();
let forCode: string | null = null;

/**
 * Everything drawn in the `RECALL_ROUNDS` rounds before this one.
 *
 * Reads strictly BACKWARDS from `round`, which is what keeps a re-render of the
 * same sheet stable, and what makes a rematch (which resets the round number to
 * 1) start from nothing without needing to be told.
 */
export function recentRemarks(code: string | null, round: number): string[] {
  if (code !== forCode) return [];
  const out: string[] = [];
  for (let r = round - RECALL_ROUNDS; r < round; r++) {
    const ids = shown.get(r);
    if (ids) out.push(...ids);
  }
  return out;
}

/**
 * Remember what a round drew. Idempotent per round: the first answer for a round
 * is the one kept, so the repeated renders behind it cannot rewrite history.
 */
export function rememberRemarks(code: string | null, round: number, ids: string[]): void {
  if (code === null) return;
  if (code !== forCode) { forCode = code; shown = new Map(); }
  if (shown.has(round)) return;
  shown.set(round, ids);
  // A game is a few dozen rounds at the very most, and only the last couple are
  // ever read - but this is module state that outlives a room, so it is bounded
  // rather than left to grow.
  for (const r of shown.keys()) if (r < round - RECALL_ROUNDS) shown.delete(r);
}

/** Tests, and leaving a room: forget this game entirely. */
export function forgetRemarks(): void {
  shown = new Map();
  forCode = null;
}
