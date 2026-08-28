import { describe, it, expect } from 'vitest';
import { detectPlatform } from './platform';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD13 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('detectPlatform', () => {
  it('names the two platforms whose edge gestures eat a drag', () => {
    expect(detectPlatform(IPHONE)).toBe('ios');
    expect(detectPlatform(PIXEL)).toBe('android');
  });
  it('catches iPadOS, which claims to be a Mac', () => {
    // The touchscreen is the only thing that gives it away.
    expect(detectPlatform(IPAD13, 5)).toBe('ios');
    expect(detectPlatform(IPAD13, 0)).toBe('other');
  });
  it('leaves a real Mac alone even with a trackpad reporting a touch point', () => {
    expect(detectPlatform(MAC, 1)).toBe('other');
    expect(detectPlatform(MAC)).toBe('other');
  });
  it('reads an Android tablet as Android and not as a desktop Linux box', () => {
    // Android UAs carry "Linux" too; the Android test has to come first.
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; SM-X910) Chrome/126', 10)).toBe('android');
  });
});
