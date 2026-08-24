import { describe, it, expect } from 'vitest';
import { parseHash } from './App';

describe('parseHash', () => {
  it('routes empty and junk to home', () => {
    expect(parseHash('')).toEqual({ screen: 'home' });
    expect(parseHash('#/nope')).toEqual({ screen: 'home' });
  });
  it('routes room links, uppercasing the code', () => {
    expect(parseHash('#/room/ab2xyz')).toEqual({ screen: 'room', code: 'AB2XYZ' });
  });
});
