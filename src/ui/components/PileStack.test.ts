import { describe, it, expect } from 'vitest';
import { depthLayers } from './PileStack';

describe('depthLayers', () => {
  it('shows nothing under a single card or an empty pile', () => {
    expect(depthLayers(0)).toBe(0);
    expect(depthLayers(1)).toBe(0);
  });
  it('grows with the pile and caps out', () => {
    expect(depthLayers(2)).toBe(1);
    expect(depthLayers(4)).toBe(1);
    expect(depthLayers(5)).toBe(2);
    expect(depthLayers(10)).toBe(3);
    expect(depthLayers(25)).toBe(3); // a full wood pile is a stack, not a staircase
  });
  it('honours a lower cap - the flipped wood group shows at most 2 under', () => {
    expect(depthLayers(3, 2)).toBe(1);
    expect(depthLayers(9, 2)).toBe(2);
  });
});
