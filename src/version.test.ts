import { describe, it, expect } from 'vitest';
import { APP_VERSION } from './version';

describe('APP_VERSION', () => {
  it('is a v<major>.<two decimals> string', () => {
    // The shape matters because the two decimals carry meaning: the first is
    // feature batches and the second is small changes. "v3.4" would lose that.
    expect(APP_VERSION).toMatch(/^v\d+\.\d{2}$/);
  });
});
