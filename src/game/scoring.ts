import type { CenterSpace, RoundScore, Tableau } from './types';

export function scoreRound(
  spaces: CenterSpace[], tableaus: Record<string, Tableau>,
): Record<string, RoundScore> {
  const centerCounts: Record<string, number> = {};
  for (const s of spaces) {
    for (const card of [...s.stack, ...s.history.flat()]) {
      centerCounts[card.owner] = (centerCounts[card.owner] ?? 0) + 1;
    }
  }
  const out: Record<string, RoundScore> = {};
  for (const [uid, t] of Object.entries(tableaus)) {
    const centerCount = centerCounts[uid] ?? 0;
    const blitzLeft = t.blitz.length;
    out[uid] = { centerCount, blitzLeft, delta: centerCount - 2 * blitzLeft };
  }
  return out;
}

export function winnerIds(scores: Record<string, number>, target: number): string[] {
  const reached = Object.entries(scores).filter(([, s]) => s >= target);
  if (reached.length === 0) return [];
  const max = Math.max(...reached.map(([, s]) => s));
  return reached.filter(([, s]) => s === max).map(([uid]) => uid).sort();
}
