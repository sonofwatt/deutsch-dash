import { describe, it, expect, vi, afterEach } from 'vitest';
import { CODE_ALPHABET, makeRoomCode } from './roomCodes';

describe('makeRoomCode', () => {
  it('emits 6 chars from the unambiguous alphabet', () => {
    const code = makeRoomCode();
    expect(code).toHaveLength(6);
    expect([...code].every(ch => CODE_ALPHABET.includes(ch))).toBe(true);
  });
  it('excludes lookalike characters 0 O 1 I', () => {
    for (const bad of ['0', 'O', '1', 'I']) expect(CODE_ALPHABET.includes(bad)).toBe(false);
  });
  afterEach(() => vi.restoreAllMocks());
  it('draws from the platform random source by default, not Math.random', () => {
    const secure = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const weak = vi.spyOn(Math, 'random');
    makeRoomCode();
    expect(secure).toHaveBeenCalledTimes(6);
    expect(weak).not.toHaveBeenCalled();
  });
  it('is deterministic under an injected rng', () => {
    expect(makeRoomCode(() => 0)).toBe('AAAAAA');
    expect(makeRoomCode(() => 0.999999)).toBe('999999');
  });
});
