import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableauView } from './TableauView';
import { CenterGrid, gridColumns } from './CenterGrid';
import { OpponentStrip } from './OpponentStrip';
import { ScoreRow } from './ScoreRow';
import { BlitzSplash } from './BlitzSplash';
import { ScoreList } from './ScoreList';
import { rankRows } from '../scoreRanks';
import { raceFlashes } from '../raceFlash';
import { orderlySpaces } from '../../game/center';
import { splashVariant } from '../splashVariant';
import type { Card, CenterSpace, PlayerInfo, RoundScore, Suit, Tableau } from '../../game/types';

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
  it('labels every pile with the cards it holds, the whole pile not the remainder', () => {
    const html = renderTableau(tableau());
    expect(html).toContain('>blitz 2<');   // 2 in the Blitz pile
    expect(html).toContain('>2<');         // a 2-card post says 2, not "+1"
    expect(html).toContain('>1<');         // and a single card says so rather than nothing
    expect(html).toContain('>wood 12<');
    expect(html).not.toContain('count-bubble'); // the count is on the label, not over the card
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
    expect(html.indexOf('>blitz ')).toBeGreaterThan(-1);
    expect(html.indexOf('>wood ')).toBeGreaterThan(-1);
    expect(html.indexOf('>blitz ')).toBeLessThan(html.indexOf('>wood '));
  });
  it('puts the wood under whichever thumb the player asked for', () => {
    const right = renderToStaticMarkup(createElement(TableauView, {
      t: tableau(), badgeId: 'tulip' as const, selection: null, postHighlight: [],
      onSelect: noop, onFlip: noop, onTapPost: noop, startDrag: noop, woodSide: 'left' as const,
    }));
    expect(right.indexOf('>wood ')).toBeLessThan(right.indexOf('>blitz '));
    // ...and the posts do not move with it: shuffling four positions to fix one
    // would cost more muscle memory than it buys.
    const labels = [...right.matchAll(/<div class="pile-label">([^<]*)</g)].map(m => m[1]);
    expect(labels[0]).toMatch(/^wood /);
    expect(labels[labels.length - 1]).toMatch(/^blitz /);
    expect(labels.slice(1, -1)).toEqual(['2', '1', ' ']);
  });

  it('offers the recycle control only once the face-down wood runs out', () => {
    expect(renderTableau(tableau({ woodIndex: 3 }))).not.toContain('recycle-slot');
    // The empty draw slot IS the control - there is no button on the face-up card,
    // which is why this asserts the slot and nothing else.
    expect(renderTableau(tableau({ woodIndex: 12 }))).toContain('recycle-slot');
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
  it('says "no moves left" inside the drop band, not under the tableau', () => {
    // It used to be a <p> below the tableau, which shoved the whole board up the
    // screen the moment it appeared. The band is always there, so this costs
    // nothing; and a stuck player has no legal targets, so the band is never lit
    // and hinting "drop here" at the same time.
    const stuck = renderToStaticMarkup(createElement(CenterGrid, {
      spaces, highlight: [], badgeOf: () => 'star' as const, onTap: noop, onSnapTap: noop, stuck: true,
    }));
    expect(stuck).toContain('snap-band stuck');
    expect(stuck).toContain('No moves left');
    expect(stuck).not.toContain('drop here');
    expect(stuck).not.toContain('stuck-note');
    expect(html).toContain('drop here');       // and the ordinary board still says its piece
    expect(html).not.toContain('No moves left');
  });
  it('marks only the hinted space, and in its own colour', () => {
    const hinted = renderToStaticMarkup(createElement(CenterGrid, {
      spaces, highlight: [0], badgeOf: () => 'star' as const, onTap: noop, onSnapTap: noop, hint: 2,
    }));
    // The hint and the drop-target glow are different cues on different spaces and
    // must not be confused for one another - see the --hint token's comment.
    expect(hinted).toContain('pile-space glow');
    expect(hinted).toContain('pile-space hint');
    expect(hinted.split('hint').length - 1).toBe(1);
    expect(html).not.toContain('hint');   // no hint prop, no marks at all
  });
  it('paints an orderly board in whole columns of one colour, and says so on empty slots', () => {
    // The tint has to read while the space is EMPTY: once a card is down its own
    // face carries the colour, and an empty slot is exactly where a player is
    // deciding whether their Ace can go there.
    // The real seeding function, not a hand-written pattern: this pins the board a
    // 6-player orderly round actually starts from, pairing and all.
    const out = renderToStaticMarkup(createElement(CenterGrid, {
      spaces: orderlySpaces(24), highlight: [], badgeOf: () => 'star' as const,
      onTap: noop, onSnapTap: noop, orderly: true,
    }));
    expect(out).toContain('--cols:8');
    expect(out.split('pile-space owned').length - 1).toBe(24);
    // Columns 0 and 1 are one colour, 2 and 3 the next: four bands, not stripes.
    const suits = [...out.matchAll(/--suit:var\(--suit-(\w+)\)/g)].map(m => m[1]);
    expect(suits.slice(0, 4)).toEqual(['red', 'red', 'blue', 'blue']);
    expect(out).toContain('--suit:var(--suit-red)');
    expect(out).toContain('--suit:var(--suit-yellow)');
    expect(html).not.toContain('owned');   // an ordinary board claims nothing
  });
  it('lays the board out in four rows at every game size', () => {
    // 4 x players spaces in, at most four rows out
    for (const players of [2, 3, 4, 5, 8]) {
      const count = 4 * players;
      expect(Math.ceil(count / gridColumns(count))).toBeLessThanOrEqual(4);
    }
    expect(gridColumns(8)).toBe(4);   // two players: 4x2
    expect(gridColumns(32)).toBe(8);  // eight players: 8x4
    // An orderly board takes its columns from its suits instead - and still never
    // goes past four rows, because 20 spaces round up to 24 (spaceCountForPlayers).
    expect(gridColumns(16, true)).toBe(4);
    expect(gridColumns(24, true)).toBe(8);
  });
});

describe('OpponentStrip', () => {
  it("shows each opponent's face-up cards and never my own row", () => {
    const html = renderToStaticMarkup(createElement(OpponentStrip, {
      me: 'me',
      players: {
        me: { name: 'Me', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 0 },
        you: { name: 'You', badgeId: 'star', joinedAt: 2, connected: true, stuckAt: null, awayAt: null, score: 3 },
      },
      tableaus: { you: tableau() },
    }));
    expect(html).not.toContain('>Me<');
    expect(html).toContain('>You<');
    // Only slots holding a card: blitz top + 2 non-empty posts + wood top. The
    // third post is empty and takes no width at all - see OpponentStrip.
    expect(html.split('opp-slot').length - 1).toBe(4);
    expect(html).not.toContain('pile-space');
    // and in the same order as your own tableau: the Blitz slot, the one carrying
    // the count bubble, is the first of them
    const slotsBeforeCount = html.slice(0, html.indexOf('opp-count')).split('opp-slot').length - 1;
    expect(slotsBeforeCount).toBe(1);
  });
});

describe('ScoreRow', () => {
  const player = (p: Partial<PlayerInfo> = {}): PlayerInfo => ({
    name: 'Dave', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score: 47, ...p,
  });
  // Tag boundaries become spaces, so the assertions below read as the row reads.
  const renderRow = (player: PlayerInfo, score?: RoundScore) =>
    renderToStaticMarkup(createElement(ScoreRow, { player, score }))
      .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  it('spells the round out as arithmetic, then the running total', () => {
    const text = renderRow(player(), { centerCount: 6, blitzLeft: 2, delta: 2 });
    expect(text).toContain('Dave -4 +6 = +2 47');
  });
  it('takes the sum from the committed delta instead of recomputing it', () => {
    // delta is the exact number commitScores added to player.score. Recomputing
    // from the components here would let the row show a sum that disagrees with
    // the total beside it; this fixture disagrees on purpose to pin that.
    const text = renderRow(player(), { centerCount: 6, blitzLeft: 2, delta: 9 });
    expect(text).toContain('= +9 47');
  });
  it('leaves zero unsigned and signs a losing round', () => {
    const blitzer = renderRow(player({ name: 'Ann', score: 56 }), { centerCount: 9, blitzLeft: 0, delta: 9 });
    expect(blitzer).toContain('Ann 0 +9 = +9 56'); // not "-0", which reads as a typo
    const loser = renderRow(player(), { centerCount: 3, blitzLeft: 4, delta: -5 });
    expect(loser).toContain('Dave -8 +3 = -5 47');
  });
  it('degrades to a name and a total when there is no round breakdown', () => {
    // Game over can render from a snapshot with no round/scores.
    expect(renderRow(player())).toBe('🌷\uFE0F Dave 47');   // the badge carries its emoji selector
  });
});

describe('BlitzSplash', () => {
  const player = (score: number): PlayerInfo => ({
    name: 'P', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score,
  });
  const table = (...scores: number[]) =>
    Object.fromEntries(scores.map((s, i) => [`p${i}`, player(s)]));

  it('gives the blitzer glitter', () => {
    expect(splashVariant(table(10, 20, 30), 'p1', 'p1')).toBe('glitter');
  });
  it('never poos on a two-player game', () => {
    // Heads-up, the loser is always last. Rubbing it in is a group activity.
    expect(splashVariant(table(30, 2), 'p0', 'p1')).toBe('crying');
  });
  it('poos on the worst score at three or more, and everyone else cries', () => {
    const t = table(30, 2, 20);
    expect(splashVariant(t, 'p0', 'p1')).toBe('poo');
    expect(splashVariant(t, 'p0', 'p2')).toBe('crying');
  });
  it('poos on everyone tied for worst', () => {
    const t = table(30, 2, 2);
    expect(splashVariant(t, 'p0', 'p1')).toBe('poo');
    expect(splashVariant(t, 'p0', 'p2')).toBe('poo');
  });
  it('spares the table when the blitzer is the one propping it up', () => {
    // The winner gets glitter, so nobody gets the poo that round.
    const t = table(2, 30, 20);
    expect(splashVariant(t, 'p0', 'p0')).toBe('glitter');
    expect(splashVariant(t, 'p0', 'p1')).toBe('crying');
    expect(splashVariant(t, 'p0', 'p2')).toBe('crying');
  });
  it('is unreadable to a spectator with no uid, and does not crash', () => {
    expect(splashVariant(table(30, 2, 20), 'p0', null)).toBe('crying');
  });

  const render = (variant: 'glitter' | 'poo' | 'crying') =>
    renderToStaticMarkup(createElement(BlitzSplash, { name: 'Dave', variant }));
  it('throws exactly one kind of thing at a viewer', () => {
    expect(render('glitter')).toContain('✨');
    expect(render('glitter')).not.toContain('😢');
    expect(render('poo')).toContain('💩');
    expect(render('poo')).not.toContain('✨');
    expect(render('crying')).toContain('😢');
  });
});

describe('rankRows', () => {
  const p = (score: number): PlayerInfo => ({
    name: 'P', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score,
  });
  const sc = (delta: number): RoundScore => ({ centerCount: 0, blitzLeft: 0, delta });

  it('derives the old standing by undoing this round', () => {
    // ann 30 (+12 this round), bo 25 (-2): ann was 18 and last, and is now first.
    const { previous, current, move } = rankRows(
      { ann: p(30), bo: p(25) }, { ann: sc(12), bo: sc(-2) },
    );
    expect(previous).toEqual(['bo', 'ann']);
    expect(current).toEqual(['ann', 'bo']);
    expect(move).toEqual({ ann: 'up', bo: 'down' });
  });
  it('moves nobody when there is no breakdown to undo', () => {
    const { previous, current, move } = rankRows({ ann: p(20), bo: p(25) }, null);
    expect(previous).toEqual(current);
    expect(move).toEqual({ ann: null, bo: null });
  });
  it('leaves players level on points where they are', () => {
    // Equal scores must not trade places just because the sort is called twice.
    const { move } = rankRows({ ann: p(10), bo: p(10), cy: p(10) }, { ann: sc(1), bo: sc(1), cy: sc(1) });
    expect(move).toEqual({ ann: null, bo: null, cy: null });
  });
  it('scores a three-way shuffle from every seat', () => {
    // was: cy 30, ann 18, bo 5 -> now: ann 34, cy 31, bo 25. Bo gained the most
    // points of anyone and still moved nowhere: the tint is about places, not points.
    const { move } = rankRows({ ann: p(34), bo: p(25), cy: p(31) },
      { ann: sc(16), bo: sc(20), cy: sc(1) });
    expect(move).toEqual({ ann: 'up', bo: null, cy: 'down' });
  });
});

describe('ScoreList', () => {
  const p = (name: string, score: number): PlayerInfo => ({
    name, badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score,
  });
  it('is the still frame of the animation: old order, no tint', () => {
    // No effects run in a static render, so this is the sheet as it lands - the
    // previous standing, before the swap it is about to play out.
    const html = renderToStaticMarkup(createElement(ScoreList, {
      players: { ann: p('Ann', 20), bo: p('Bo', 25) },
      scores: { ann: { centerCount: 0, blitzLeft: 0, delta: 12 },
                bo: { centerCount: 0, blitzLeft: 0, delta: -2 } },
    }));
    expect(html.indexOf('Bo')).toBeLessThan(html.indexOf('Ann'));
    expect(html).not.toContain('moved-');
  });
});

describe('raceFlashes', () => {
  const space = (...owners: string[]): CenterSpace => ({
    stack: owners.map((owner, i) => c(i + 1, 'red', owner)), history: [],
  });

  it('haloes the player whose card is on top of a space someone lost', () => {
    const flashes = raceFlashes({
      races: { 1: { by: 'bo', at: 99 } }, spaces: [space('me'), space('me', 'me')], uid: 'me',
    });
    expect(flashes).toEqual({ 1: { kind: 'angel', at: 99 } });
  });
  it('haloes the player whose card FINISHED the pile, which clears the space', () => {
    // A 10 is the most contested card in a pile and the one that leaves nothing on
    // top: centerPlayTxn archives the run and empties the stack the moment it lands.
    // Caught by racing two real clients for a blue 10 and watching the halo not appear.
    const finished: CenterSpace = {
      stack: [], history: [Array.from({ length: 10 }, (_, i) => c(i + 1, 'blue', i === 9 ? 'me' : 'ann'))],
    };
    expect(raceFlashes({ races: { 0: { by: 'bo', at: 5 } }, spaces: [finished], uid: 'me' }))
      .toEqual({ 0: { kind: 'angel', at: 5 } });
  });
  it('haloes nobody when the winner was somebody else', () => {
    // ann won that race. From my seat it never happened.
    expect(raceFlashes({
      races: { 1: { by: 'bo', at: 99 } }, spaces: [space('me'), space('ann')], uid: 'me',
    })).toEqual({});
  });
  it('never haloes the loser for their own report', () => {
    expect(raceFlashes({
      races: { 0: { by: 'me', at: 99 } }, spaces: [space('me')], uid: 'me',
    })).toEqual({});
  });
  it('scowls at the space this client just lost, from local state', () => {
    // No record needed: the loser knows, and it must land even if the write fails.
    expect(raceFlashes({
      races: null, spaces: [space('ann')], uid: 'me', lastRejected: { space: 0, at: 7 },
    })).toEqual({ 0: { kind: 'angry', at: 7 } });
  });
  it('prefers the scowl when this client both won and later lost the same space', () => {
    expect(raceFlashes({
      races: { 0: { by: 'bo', at: 1 } }, spaces: [space('me')], uid: 'me',
      lastRejected: { space: 0, at: 2 },
    })).toEqual({ 0: { kind: 'angry', at: 2 } });
  });
  it('shows a spectator with no uid nothing at all', () => {
    expect(raceFlashes({
      races: { 0: { by: 'bo', at: 1 } }, spaces: [space('me')], uid: null,
    })).toEqual({});
  });

  it('puts the face over the space it belongs to', () => {
    const html = renderToStaticMarkup(createElement(CenterGrid, {
      spaces: [space('me'), space('ann'), space()], highlight: [],
      badgeOf: () => 'star' as const, onTap: noop, onSnapTap: noop,
      races: { 0: { kind: 'angel' as const, at: 1 }, 1: { kind: 'angry' as const, at: 2 } },
    }));
    expect(html).toContain('😇');
    expect(html).toContain('😠');
    expect(html).toContain('race-angel');  // the two faces move differently
    expect(html).toContain('race-angry');
    expect(html.indexOf('😇')).toBeLessThan(html.indexOf('😠')); // space 0 before space 1
  });
});
