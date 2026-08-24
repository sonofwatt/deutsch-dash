import { describe, it, expect } from 'vitest';
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
  it('is deterministic under an injected rng', () => {
    expect(makeRoomCode(() => 0)).toBe('AAAAAA');
    expect(makeRoomCode(() => 0.999999)).toBe('999999');
  });
});
