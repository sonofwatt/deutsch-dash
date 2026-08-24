import type { Card, CenterSpace, FaceGroup, PlaySource, Suit, Tableau } from './types';

export function faceGroup(suit: Suit): FaceGroup {
  return suit === 'red' || suit === 'blue' ? 'boy' : 'girl';
}

export function postCountForPlayers(playerCount: number): number {
  return playerCount === 2 ? 5 : 3;
}

export function canPlayToCenter(card: Card, stack: Card[]): boolean {
  if (stack.length === 0) return card.v === 1;
  const top = stack[stack.length - 1];
  return card.suit === top.suit && card.v === top.v + 1;
}

export function canBuildOnPost(card: Card, stack: Card[]): boolean {
  if (stack.length === 0) return false;
  const top = stack[stack.length - 1];
  return card.v === top.v - 1 && faceGroup(card.suit) !== faceGroup(top.suit);
}

export function refillPosts(t: Tableau): Tableau {
  if (!t.post.some(s => s.length === 0) || t.blitz.length === 0) return t;
  const blitz = [...t.blitz];
  const post = t.post.map(s => {
    if (s.length > 0 || blitz.length === 0) return s;
    return [blitz.pop() as Card];
  });
  return { ...t, blitz, post };
}

export function sourceTop(t: Tableau, source: PlaySource): Card | null {
  if (source.kind === 'blitz') return t.blitz[t.blitz.length - 1] ?? null;
  if (source.kind === 'wood') return t.woodIndex > 0 ? t.wood[t.woodIndex - 1] ?? null : null;
  const stack = t.post[source.index];
  return stack ? stack[stack.length - 1] ?? null : null;
}

export function takeCard(t: Tableau, source: PlaySource): { next: Tableau; card: Card } | null {
  const card = sourceTop(t, source);
  if (!card) return null;
  let next: Tableau;
  if (source.kind === 'blitz') {
    next = { ...t, blitz: t.blitz.slice(0, -1) };
  } else if (source.kind === 'wood') {
    const wood = [...t.wood];
    wood.splice(t.woodIndex - 1, 1);
    next = { ...t, wood, woodIndex: t.woodIndex - 1 };
  } else {
    next = { ...t, post: t.post.map((s, i) => (i === source.index ? s.slice(0, -1) : s)) };
  }
  return { next: refillPosts(next), card };
}

export function placeOnPost(t: Tableau, source: PlaySource, postIndex: number): Tableau | null {
  if (source.kind === 'post' && source.index === postIndex) return null;
  const card = sourceTop(t, source);
  const target = t.post[postIndex];
  if (!card || !target || !canBuildOnPost(card, target)) return null;
  const taken = takeCard(t, source);
  if (!taken) return null;
  // note: takeCard already refilled slots; now add the card to the target stack
  const post = taken.next.post.map((s, i) => (i === postIndex ? [...s, card] : s));
  return refillPosts({ ...taken.next, post });
}

export function hasLegalMove(t: Tableau, spaces: CenterSpace[]): boolean {
  const sources: PlaySource[] = [
    { kind: 'blitz' }, { kind: 'wood' },
    ...t.post.map((_, index) => ({ kind: 'post' as const, index })),
  ];
  for (const source of sources) {
    const card = sourceTop(t, source);
    if (!card) continue;
    if (spaces.some(sp => canPlayToCenter(card, sp.stack))) return true;
    for (let j = 0; j < t.post.length; j++) {
      if (source.kind === 'post' && source.index === j) continue;
      if (canBuildOnPost(card, t.post[j])) return true;
    }
  }
  return false;
}
