import { describe, it, expect } from 'vitest';
import { pressOutcome } from './launchGesture';
import { seedFalls, noteFall, expireFall, MAX_FALLS } from './soundFalls';

/**
 * The six things the table reported about soundbites on 2026-09-10, as far as
 * they can be pinned without a DOM. The engine's half is in `engine.test.ts`.
 */
describe('the launcher gesture', () => {
  it('plays and closes when a hold lifts over a soundbite', () => {
    // The press-and-hold gesture completing: one movement, play, back to the
    // board. This is the ONLY path that both plays and closes.
    expect(pressOutcome({ over: 'wow', tapped: false, wasOpen: false }))
      .toEqual({ say: 'wow', open: false });
  });

  it('closes without playing when a hold ends over nothing', () => {
    expect(pressOutcome({ over: null, tapped: false, wasOpen: true }))
      .toEqual({ say: null, open: false });
  });

  it('opens on a tap, and closes on the next tap', () => {
    // The launch button is a toggle now. Tapping it again is one of the two ways
    // the table was told it could put the menu away.
    expect(pressOutcome({ over: null, tapped: true, wasOpen: false }))
      .toEqual({ say: null, open: true });
    expect(pressOutcome({ over: null, tapped: true, wasOpen: true }))
      .toEqual({ say: null, open: false });
  });

  it('treats a quick press that landed on a soundbite as a hold', () => {
    // A fast flick down onto a button. The launcher is never underneath the menu,
    // so being over a soundbite at all means the pointer travelled - and the
    // player clearly meant to play that one.
    expect(pressOutcome({ over: 'boo', tapped: true, wasOpen: false }))
      .toEqual({ say: 'boo', open: false });
  });

  it('never closes the menu for a soundbite pressed IN it', () => {
    // The absence that matters, and the fix that was asked for: that path does
    // not go through here at all, so there is no combination of inputs that both
    // plays a menu button and closes the menu... other than the hold, which is
    // the gesture that is supposed to.
    const closingPlays = ([true, false] as const).flatMap(tapped =>
      ([true, false] as const).map(wasOpen =>
        pressOutcome({ over: null, tapped, wasOpen })))
      .filter(o => o.say !== null);
    expect(closingPlays).toEqual([]);
  });
});

describe('the emoji falls', () => {
  it('adopts what is already playing when it mounts, and does not replay it', () => {
    // The reported bug: emoji falling at the start of a round. `lastSound` is a
    // nonce that is never cleared, and this component mounts once on the lobby
    // and again on the board - so a soundbite pressed in the lobby rained over
    // the first board nobody had touched yet.
    const fresh = seedFalls(7);
    expect(fresh.falls).toEqual([]);
    expect(noteFall(fresh, 'cheer', 7)).toBe(fresh); // same object: no re-render
  });

  it('mounts empty when nothing has played yet', () => {
    const fresh = seedFalls(null);
    expect(fresh).toEqual({ seen: null, falls: [] });
    expect(noteFall(fresh, 'cheer', 1).falls).toHaveLength(1);
  });

  it('stacks repeated presses instead of replacing them', () => {
    // Asked for directly. A single layer keyed on the nonce restarted mid-fall,
    // which looks the same as never having been interrupted - so pressing twice
    // looked like pressing once.
    let s = seedFalls(null);
    s = noteFall(s, 'wow', 1);
    s = noteFall(s, 'wow', 2);
    s = noteFall(s, 'wow', 3);
    expect(s.falls.map(f => f.seq)).toEqual([1, 2, 3]);
    expect(s.falls.every(f => f.id === 'wow')).toBe(true);
  });

  it('drops the OLDEST when too many pile up, never the newest', () => {
    let s = seedFalls(null);
    for (let i = 1; i <= MAX_FALLS + 3; i++) s = noteFall(s, 'laugh', i);
    expect(s.falls).toHaveLength(MAX_FALLS);
    expect(s.falls[s.falls.length - 1].seq).toBe(MAX_FALLS + 3); // newest kept
    expect(s.falls[0].seq).toBe(4);                              // oldest gone
  });

  it('takes each fall away on its own timer, not the last one to arrive', () => {
    let s = seedFalls(null);
    s = noteFall(s, 'wow', 1);
    s = noteFall(s, 'boo', 2);
    s = expireFall(s, 1);
    expect(s.falls.map(f => f.seq)).toEqual([2]);
    expect(expireFall(s, 99)).toBe(s); // unknown nonce changes nothing
  });

  it('ignores a nonce it has already seen, however it arrives', () => {
    let s = seedFalls(null);
    s = noteFall(s, 'wow', 4);
    expect(noteFall(s, 'wow', 4)).toBe(s);
    expect(noteFall(s, 'wow', null)).toBe(s);
  });
});
