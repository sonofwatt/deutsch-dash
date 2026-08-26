import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableauView } from './TableauView';
import { CenterGrid, gridColumns } from './CenterGrid';
import { OpponentStrip } from './OpponentStrip';
import type { Card, CenterSpace, Suit, Tableau } from '../../game/types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });
const run = (suit: Suit) => Array.from({ length: 10 }, (_, i) => c(i + 1, suit));
const noop = () => {};

const tableau = (p: Partial<Tableau> = {}): Tableau => ({
  blitz: [c(9, 'red'), c(4, 'blue')],
  post: [[c(8, 'red'), c(7, 'green')], [c(3, 'blue')], []],
  wood: Array.from({ length: 12 }, (_, i) => c((i % 10) + 1, 'blue')),
  woodIndex: 3,
  ...p,
});

const renderTableau = (t: Tableau) => renderToStaticMarkup(createElement(TableauView, {
  t, badgeId: 'tulip' as const, selection: null, postHighlight: [],
  onSelect: noop, onFlip: noop, onTapPost: noop, startDrag: noop,
}));

describe('TableauView', () => {
  it('keeps a drop target on every post, peek area included', () => {
    const html = renderTableau(tableau());
    expect(html).toContain('data-drop="post:0"');
    expect(html).toContain('data-drop="post:2"'); // empty posts still take drops
  });
  it('peeks outlines under a stacked pile but not under a single card', () => {
    const two = renderTableau(tableau({ post: [[c(8, 'red'), c(7, 'green')]] }));
    const one = renderTableau(tableau({ post: [[c(8, 'red')]] }));
    expect(two.split('pile-layer').length).toBeGreaterThan(one.split('pile-layer').length);
  });
  it('lays out Blitz on the left and wood on the right', () => {
    // Wood is the pile touched most - every flip of three is another tap - so it
    // sits under the right thumb. Order is a deliberate choice, so pin it.
    const html = renderTableau(tableau());
    expect(html.indexOf('>blitz<')).toBeGreaterThan(-1);
    expect(html.indexOf('>wood ')).toBeGreaterThan(-1);
    expect(html.indexOf('>blitz<')).toBeLessThan(html.indexOf('>wood '));
  });
  it('offers the recycle control only once the face-down wood runs out', () => {
    expect(renderTableau(tableau({ woodIndex: 3 }))).not.toContain('class="recycle"');
    const spent = renderTableau(tableau({ woodIndex: 12 }));
    expect(spent).toContain('class="recycle"');
    expect(spent).toContain('recycle-slot'); // the empty draw slot advertises it too
  });
});

describe('CenterGrid', () => {
  const spaces: CenterSpace[] = [
    { stack: [c(1, 'red')], history: [] },
    { stack: [], history: [run('green')] }, // finished
    { stack: [], history: [] },
  ];
  const html = renderToStaticMarkup(createElement(CenterGrid, {
    spaces, highlight: [], badgeOf: () => 'star' as const, onTap: noop, onSnapTap: noop,
  }));

  it('moves a finished pile to a side rail and frees its space', () => {
    expect(html).toContain('done-chip');
    expect(html).toContain('--suit:var(--suit-green)');   // the suit that completed
    expect(html).toContain('data-drop="space:1"');        // and the space is playable again
  });
  it('keeps every space a drop target, plus the snap band', () => {
    expect(html).toContain('data-drop="space:0"');
    expect(html).toContain('data-drop="space:2"');
    expect(html).toContain('data-drop="nearest"');
  });
  it('lays the board out in four rows at every game size', () => {
    // 4 x players spaces in, at most four rows out
    for (const players of [2, 3, 4, 5, 8]) {
      const count = 4 * players;
      expect(Math.ceil(count / gridColumns(count))).toBeLessThanOrEqual(4);
    }
    expect(gridColumns(8)).toBe(4);   // two players: 4x2
    expect(gridColumns(32)).toBe(8);  // eight players: 8x4
  });
});

describe('OpponentStrip', () => {
  it("shows each opponent's face-up cards and never my own row", () => {
    const html = renderToStaticMarkup(createElement(OpponentStrip, {
      me: 'me',
      players: {
        me: { name: 'Me', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, score: 0 },
        you: { name: 'You', badgeId: 'star', joinedAt: 2, connected: true, stuckAt: null, score: 3 },
      },
      tableaus: { you: tableau() },
    }));
    expect(html).not.toContain('>Me<');
    expect(html).toContain('>You<');
    // blitz top + 3 post slots + wood top = 5 visible slots
    expect(html.split('opp-slot').length - 1).toBe(5);
    // and in the same order as your own tableau: the Blitz slot, the one carrying
    // the count bubble, is the first of them
    const slotsBeforeCount = html.slice(0, html.indexOf('opp-count')).split('opp-slot').length - 1;
    expect(slotsBeforeCount).toBe(1);
  });
});
