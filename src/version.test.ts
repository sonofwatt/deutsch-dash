import { describe, it, expect } from 'vitest';
import { APP_VERSION, formatVersion } from './version';

describe('formatVersion', () => {
  it('is v<major>.<minor>.<two digits>, always', () => {
    // The two digits carry meaning - tens are feature batches, units are small
    // changes - so "v1.2.4" would silently lose half of it.
    expect(formatVersion(1, 0, 9)).toBe('v1.0.09');
    expect(formatVersion(1, 0, 0)).toBe('v1.0.00');
  });

  it('is worth ten a batch and one a small change', () => {
    expect(formatVersion(1, 1, 0)).toBe('v1.0.10');
    expect(formatVersion(1, 1, 3)).toBe('v1.0.13');
    expect(formatVersion(1, 23, 11)).toBe('v1.2.41'); // where this scheme started
  });

  it('carries into the minor every ten batches, and never into the major', () => {
    expect(formatVersion(1, 10, 0)).toBe('v1.1.00');
    expect(formatVersion(1, 99, 9)).toBe('v1.9.99');
    // Past a hundred batches the minor simply keeps going. MAJOR is the table's
    // to move and arithmetic must never do it for them.
    expect(formatVersion(1, 100, 0)).toBe('v1.10.00');
    expect(formatVersion(2, 0, 0)).toBe('v2.0.00');
  });

  it('gives the app a version of that shape', () => {
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d{2}$/);
  });
});
