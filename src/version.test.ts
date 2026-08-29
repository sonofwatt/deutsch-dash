import { describe, it, expect } from 'vitest';
import { APP_VERSION } from './version';

describe('APP_VERSION', () => {
  it('is v<major>.<minor>.<two digits>', () => {
    // The two digits carry meaning - tens are feature batches, units are small
    // changes - so "v1.2.4" would silently lose half of it.
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d{2}$/);
  });

  it('reads 23 feature batches and 11 small changes as v1.2.41', () => {
    // 23 * 10 + 11 = 241, which splits at the hundred into 2 and 41. Pinned as a
    // worked example so a future bump can be checked against it by hand.
    expect(APP_VERSION).toBe('v1.2.41');
  });
});
