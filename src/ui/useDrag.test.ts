import { describe, it, expect } from 'vitest';
import { parseDrop, nearestOf } from './useDrag';

describe('parseDrop', () => {
  it('reads the three drop kinds off the attribute', () => {
    const el = (v: string) => ({ closest: () => ({ getAttribute: () => v }) }) as unknown as Element;
    expect(parseDrop(el('space:7'))).toEqual({ space: 7 });
    expect(parseDrop(el('post:2'))).toEqual({ post: 2 });
    expect(parseDrop(el('nearest'))).toEqual({ nearest: true });
    expect(parseDrop(null)).toBeNull();
  });
});

describe('nearestOf', () => {
  const spaces = [
    { index: 0, cx: 10, cy: 10 }, { index: 1, cx: 100, cy: 10 }, { index: 2, cx: 200, cy: 10 },
  ];
  it('picks the closest candidate to where the card was let go', () => {
    expect(nearestOf(spaces, 12, 60)).toBe(0);
    expect(nearestOf(spaces, 130, 40)).toBe(1);
    expect(nearestOf(spaces, 195, 300)).toBe(2);
  });
  it('is null when nothing is a legal target', () => {
    expect(nearestOf([], 50, 50)).toBeNull();
  });
});
