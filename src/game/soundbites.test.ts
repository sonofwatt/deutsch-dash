/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EMOJI } from './badges';
import { SOUNDBITES, SOUNDBITE_IDS, clipLength, isSoundbiteId, type SoundbiteId } from './soundbites';
import { hitSoundbite } from '../ui/sound/hitTest';

const ALL = Object.values(SOUNDBITES);

describe('the soundbite catalogue', () => {
  it('keys every entry by its own id', () => {
    // The store looks a clip up by the id that came off the wire, so a key that
    // disagreed with the record inside it would play the wrong noise rather than
    // failing - the quiet kind of wrong.
    expect(Object.entries(SOUNDBITES).map(([key, b]) => [key, b.id]))
      .toEqual(Object.keys(SOUNDBITES).map(k => [k, k]));
  });

  it('lists them in catalogue order, which is button order', () => {
    expect(SOUNDBITE_IDS).toEqual(Object.keys(SOUNDBITES));
  });

  it('fits the four-across grid', () => {
    // .soundbite-grid is repeat(4, 1fr) and the tray does not scroll. A ninth
    // soundbite is fine; a ninth soundbite plus this still passing is not.
    expect(SOUNDBITE_IDS.length % 4).toBe(0);
  });

  it('carries EMOJI on every glyph', () => {
    // The rule from handoff.md, and the reason ⚓ and 😇 came out as black line
    // drawings: without the variation selector the glyph is at the mercy of font
    // fallback. Every glyph the app prints is built with it.
    expect(ALL.filter(b => !b.glyph.includes(EMOJI)).map(b => b.id)).toEqual([]);
  });

  it('gives every clip at least one voice and a real length', () => {
    expect(ALL.filter(b => b.voices.length === 0).map(b => b.id)).toEqual([]);
    expect(ALL.filter(b => clipLength(b.voices) <= 0).map(b => b.id)).toEqual([]);
  });

  it('keeps every clip short enough to be a soundbite', () => {
    // These are punctuation at a table, not tunes. Anything approaching a second
    // starts queueing behind itself the moment two people press at once.
    const long = ALL.filter(b => clipLength(b.voices) > 0.8).map(b => [b.id, clipLength(b.voices)]);
    expect(long).toEqual([]);
  });

  it('writes every voice with numbers the engine can schedule', () => {
    // exponentialRampToValueAtTime throws on a target of 0 and on a negative
    // one, and an oscillator will happily accept a frequency past what anybody
    // can hear. A bad recipe is a thrown exception inside a snapshot handler,
    // which is worse than a wrong noise.
    const bad: string[] = [];
    for (const b of ALL) {
      for (const [i, v] of b.voices.entries()) {
        const ok = v.at >= 0 && v.dur > 0
          && v.gain > 0 && v.gain <= 1
          && v.freq > 0 && v.freq < 20000
          && (v.toFreq === undefined || (v.toFreq > 0 && v.toFreq < 20000));
        if (!ok) bad.push(`${b.id}[${i}]`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('measures a clip by the last voice to FINISH, not the last to start', () => {
    // A long tail that starts early still has to be counted, or the queue lets
    // the next clip in over the top of it.
    expect(clipLength([
      { kind: 'tone', at: 0, dur: 0.5, gain: 0.5, freq: 440 },
      { kind: 'tone', at: 0.1, dur: 0.1, gain: 0.5, freq: 440 },
    ])).toBeCloseTo(0.5);
  });

  it('recognises its own ids and nothing else', () => {
    expect(SOUNDBITE_IDS.every(isSoundbiteId)).toBe(true);
    expect(isSoundbiteId('cheerio')).toBe(false);
    expect(isSoundbiteId('')).toBe(false);
    expect(isSoundbiteId(null)).toBe(false);
    expect(isSoundbiteId(7)).toBe(false);
    // Object.hasOwn rather than `v in SOUNDBITES`, so nothing off the prototype
    // is mistaken for a soundbite and handed to the engine.
    expect(isSoundbiteId('toString')).toBe(false);
    expect(isSoundbiteId('constructor')).toBe(false);
  });
});

describe('the catalogue and the security rules', () => {
  /**
   * `database.rules.json` mirrors the id list as a bare regex, the same way
   * MAX_PLAYERS is mirrored there as a literal 8 - the rules language has no way
   * to import anything. So the two drift, and this is what notices.
   *
   * The drift that matters is one direction: a soundbite added here and not
   * there is a button that writes, is REFUSED by the live database, and plays on
   * the presser's own phone anyway because `say` plays locally first. Nobody
   * else hears it and nothing on screen says why - which is the exact shape of
   * the stats-grant failure that cost a whole playtest.
   */
  const rules = readFileSync('database.rules.json', 'utf8');
  const idRule: string = JSON.parse(rules).rules.rooms.$code.says.$uid.id['.validate'];

  it('validates the ids the catalogue actually has', () => {
    const listed = /\^\((.+?)\)\$/.exec(idRule);
    expect(listed).not.toBeNull();
    expect(listed![1].split('|').sort()).toEqual([...SOUNDBITE_IDS].sort());
  });

  it('still accepts every id and refuses one that is not ours', () => {
    // The list above could match while the regex around it had stopped working.
    const re = new RegExp(/matches\(\/(.+)\/\)/.exec(idRule)![1]);
    for (const id of SOUNDBITE_IDS) expect({ id, ok: re.test(id) }).toEqual({ id, ok: true });
    expect(re.test('cheerio')).toBe(false);
    expect(re.test('')).toBe(false);
  });

  it('bounds the shape of a says entry, so nothing can hide a payload in it', () => {
    // The one gap the 2026-09-03 audit left open is that nothing bounds the SIZE
    // of a write. This node closes it for itself: two known children, an id held
    // to a short list, and everything else refused outright.
    const say = JSON.parse(rules).rules.rooms.$code.says.$uid;
    expect(say['.validate']).toContain("hasChildren(['id', 'at'])");
    expect(say.$other['.validate']).toBe(false);
    expect(Object.keys(say).filter(k => !k.startsWith('.'))).toEqual(['id', 'at', '$other']);
  });

  it('lets a player write only their own, or the host tidy up', () => {
    const write: string = JSON.parse(rules).rules.rooms.$code.says.$uid['.write'];
    expect(write).toContain('auth.uid === $uid');
    expect(write).toContain("child('hostId').val() === auth.uid");
  });
});

describe('a soundbite id from the wire', () => {
  it('is narrowed before it reaches the engine', () => {
    // The compile-time half of the same guarantee normalizeSays enforces at
    // runtime: this only typechecks because isSoundbiteId narrows.
    const fromWire: unknown = 'groan';
    if (isSoundbiteId(fromWire)) {
      const id: SoundbiteId = fromWire;
      expect(SOUNDBITES[id].label).toBe('Groan');
    } else {
      expect.unreachable('groan is in the catalogue');
    }
  });
});

describe('the press-and-hold hit test', () => {
  /**
   * The board's launcher opens its menu under the thumb and lets the player
   * slide onto a soundbite and lift. Working out which one they are over is
   * rect-based rather than `document.elementFromPoint`, for two reasons that
   * both bite: the menu sits under a full-screen dismiss backdrop, so a hit test
   * would find the backdrop; and the gesture holds a pointer CAPTURE on the
   * launch button, so the buttons never see the events themselves.
   */
  const box = (id: SoundbiteId, left: number, top: number) =>
    ({ id, rect: { left, right: left + 60, top, bottom: top + 50 } });
  const grid = [
    box('cheer', 0, 0), box('groan', 70, 0), box('hurry', 140, 0), box('oops', 210, 0),
    box('laugh', 0, 60), box('wow', 70, 60), box('boo', 140, 60), box('tada', 210, 60),
  ];

  it('finds the soundbite under the point', () => {
    expect(hitSoundbite(grid, 30, 25)).toBe('cheer');
    expect(hitSoundbite(grid, 240, 85)).toBe('tada');
    expect(hitSoundbite(grid, 100, 80)).toBe('wow');
  });

  it('returns null in the gaps and outside the grid', () => {
    // Lifting a thumb between two buttons must play NOTHING. Snapping to the
    // nearest would fire a soundbite the player had deliberately slid off.
    expect(hitSoundbite(grid, 65, 25)).toBeNull();   // the gap between columns
    expect(hitSoundbite(grid, 30, 55)).toBeNull();   // the gap between rows
    expect(hitSoundbite(grid, -5, 25)).toBeNull();   // off the left
    expect(hitSoundbite(grid, 30, 400)).toBeNull();  // back down over the board
  });

  it('counts the edges as inside', () => {
    // A thumb on the border is over the button as far as the player is
    // concerned, and the alternative is a dead seam down every column.
    expect(hitSoundbite(grid, 0, 0)).toBe('cheer');
    expect(hitSoundbite(grid, 60, 50)).toBe('cheer');
  });

  it('finds nothing when the menu is not up', () => {
    expect(hitSoundbite([], 30, 25)).toBeNull();
  });
});
