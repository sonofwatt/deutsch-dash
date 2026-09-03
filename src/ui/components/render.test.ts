import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableauView } from './TableauView';
import { CenterGrid, gridColumns } from './CenterGrid';
import { OpponentStrip } from './OpponentStrip';
import { ScoreRow } from './ScoreRow';
import { DashSplash } from './DashSplash';
import { ScoreList } from './ScoreList';
import { rankRows } from '../scoreRanks';
import { raceFlashes } from '../raceFlash';
import { orderlySpaces } from '../../game/center';
import { orderlyColumns, spaceCountForPlayers } from '../../game/rules';
import { splashVariant, type Splash } from '../splashVariant';
import type { Card, CenterSpace, PlayerInfo, PlaySource, RoundScore, Suit, Tableau } from '../../game/types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });
const run = (suit: Suit) => Array.from({ length: 10 }, (_, i) => c(i + 1, suit));
const noop = () => {};

const tableau = (p: Partial<Tableau> = {}): Tableau => ({
  dash: [c(9, 'red'), c(4, 'blue')],
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
    expect(html).toContain('>dash 2<');   // 2 in the Dash pile
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
  it('lays out Dash on the left and wood on the right', () => {
    // Wood is the pile touched most - every flip of three is another tap - so it
    // sits under the right thumb. Order is a deliberate choice, so pin it.
    const html = renderTableau(tableau());
    expect(html.indexOf('>dash ')).toBeGreaterThan(-1);
    expect(html.indexOf('>wood ')).toBeGreaterThan(-1);
    expect(html.indexOf('>dash ')).toBeLessThan(html.indexOf('>wood '));
  });
  it('puts the wood under whichever thumb the player asked for', () => {
    const right = renderToStaticMarkup(createElement(TableauView, {
      t: tableau(), badgeId: 'tulip' as const, selection: null, postHighlight: [],
      onSelect: noop, onFlip: noop, onTapPost: noop, startDrag: noop, woodSide: 'left' as const,
    }));
    expect(right.indexOf('>wood ')).toBeLessThan(right.indexOf('>dash '));
    // ...and the posts do not move with it: shuffling four positions to fix one
    // would cost more muscle memory than it buys.
    const labels = [...right.matchAll(/<div class="pile-label">([^<]*)</g)].map(m => m[1]);
    expect(labels[0]).toMatch(/^wood /);
    expect(labels[labels.length - 1]).toMatch(/^dash /);
    expect(labels.slice(1, -1)).toEqual(['2', '1', ' ']);
  });

  it('takes the dragged card off the pile it came from, whichever pile that is', () => {
    // A card in the air is already under the finger. Leaving a copy on its pile
    // draws the same card twice and reads as the drag having failed - reported
    // from a table as exactly that, off the Dash pile. What shows instead is the
    // card underneath, because that is what the player is trying to look at.
    const held = (dragging: PlaySource) => renderToStaticMarkup(createElement(TableauView, {
      t: tableau(), badgeId: 'tulip' as const, selection: null, postHighlight: [],
      onSelect: noop, onFlip: noop, onTapPost: noop, startDrag: noop, dragging,
    }));
    // Card values repeat across piles - the wood deals a 3 and so does post 1 - so
    // every assertion below reads ONE pile's own markup rather than the whole
    // tableau. `values` is what that pile is showing, in order.
    const values = (html: string, drop: string) => {
      const from = drop === 'dash' ? 0 : html.indexOf(`data-drop="${drop}"`);
      const slice = html.slice(from, html.indexOf('pile-label', from));
      return [...slice.matchAll(/class="card-v">(\d+)</g)].map(m => m[1]);
    };
    // These stacks read bottom-first, so the LAST entry is the one on top. Dash is
    // 9 red under 4 blue: lift the 4 and the 9 is what is left showing.
    expect(values(held({ kind: 'dash' }), 'dash')).toEqual(['9']);
    // Post 0 is 8 red under 7 green, so lifting the 7 reveals the 8. Post 1 holds
    // one card, so lifting it leaves the empty slot and nothing to look at.
    const post0 = held({ kind: 'post', index: 0 });
    expect(values(post0, 'post:0')).toEqual(['8']);
    expect(values(held({ kind: 'post', index: 1 }), 'post:1')).toEqual([]);
    // ...and lifting off one post leaves every other pile exactly as it was.
    expect(values(post0, 'dash')).toEqual(['4']);      // Dash still shows its top
    expect(values(post0, 'post:1')).toEqual(['3']);     // and so does post 1
  });

  it('leaves nothing to grab on a pile whose card is already in the air', () => {
    // The handlers go with the card. Dragging the revealed one would be starting a
    // second drag from a pile that is already mid-play.
    const dash = renderToStaticMarkup(createElement(TableauView, {
      t: tableau(), badgeId: 'tulip' as const, selection: null, postHighlight: [],
      onSelect: noop, onFlip: noop, onTapPost: noop, startDrag: noop,
      dragging: { kind: 'dash' } as PlaySource,
    }));
    // The count is untouched: the play commits on the drop, not on the lift.
    expect(dash).toContain('>dash 2<');
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
  it('wraps the grid in the drop zone, so the gaps between slots are droppable too', () => {
    // parseDrop walks UP from whatever is under the finger, so the only way a
    // point between two slots resolves to "nearest" is for the zone to be an
    // ANCESTOR of the grid. A sibling overlay is invisible to closest() however
    // it is stacked, which is why this is asserted on the nesting and not on a
    // class. A slot still carries its own target, and still wins, being deeper.
    const zoneAt = html.indexOf('data-drop="nearest"');
    const gridAt = html.indexOf('class="game-grid"');
    const slotAt = html.indexOf('data-drop="space:0"');
    expect(zoneAt).toBeGreaterThan(-1);
    expect(zoneAt).toBeLessThan(gridAt);
    expect(gridAt).toBeLessThan(slotAt);
  });

  it('says nothing at rest, and speaks only when a card has somewhere to go', () => {
    // The zone is a target, not a caption. The old permanent "drop here" box is
    // what this replaced - and the stuck note has moved out of here entirely,
    // down into the tableau's own empty band beside the wood.
    expect(html).not.toContain('drop here');
    expect(html).not.toContain('No moves left');
    expect(html).toContain('data-drop="nearest"');
    // ...and only speaks up when a held card actually has somewhere to go.
    const snapping = renderToStaticMarkup(createElement(CenterGrid, {
      spaces, highlight: [0], badgeOf: () => 'star' as const, onTap: noop, onSnapTap: noop, snapping: true,
    }));
    expect(snapping).toContain('drop-zone on');
    expect(snapping).toContain('nearest space');
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
  it('hands the rails back to the grid once the board gets crowded', () => {
    // Seven and eight players only: at eight columns every pixel a rail holds is
    // one the slots do not get, and a third of a chip is still legible as "piles
    // have finished, in these colours", which is all the rail is for.
    const empty = (n: number): CenterSpace[] => Array.from({ length: n }, () => ({ stack: [], history: [] }));
    const board = (n: number) => renderToStaticMarkup(createElement(CenterGrid, {
      spaces: empty(n), highlight: [], badgeOf: () => 'star' as const, onTap: noop, onSnapTap: noop,
    }));
    expect(board(24)).toContain('class="board"');       // six players: rails as they were
    expect(board(28)).toContain('class="board crowded"'); // seven
    expect(board(32)).toContain('class="board crowded"'); // eight
  });
  it('lays the board out in four rows at every game size', () => {
    // Every real board size, ordinary and orderly, in at most four rows out. Eight
    // players is 32 spaces now rather than 24, and it is this that has to hold:
    // the extra spaces go sideways into narrower slots, never into a fifth row.
    for (const players of [2, 3, 4, 5, 6, 7, 8]) {
      for (const orderly of [false, true]) {
        const count = spaceCountForPlayers(players, orderly);
        expect(Math.ceil(count / gridColumns(count, orderly))).toBeLessThanOrEqual(4);
      }
    }
    expect(gridColumns(8)).toBe(4);   // two players: 4x2
    expect(gridColumns(32)).toBe(8);  // eight players: 8x4
    // An orderly board takes its columns from its suits instead - and still never
    // goes past four rows, because 20 spaces round up to 24 (spaceCountForPlayers).
    expect(gridColumns(16, true)).toBe(4);
    expect(gridColumns(24, true)).toBe(8);
  });
  it('picks the shape that buys the biggest slot once it knows the box', () => {
    // A four-player board (16 spaces) on the two screens that differ. Tall: four
    // rows, exactly as it always was. Short - a Safari tab with its address bar
    // down - the same board is height-bound at 4x4 with width going spare, and
    // three rows of six fits a bigger card.
    expect(gridColumns(16, false, { w: 377, h: 450 })).toBe(4);
    expect(gridColumns(16, false, { w: 377, h: 250 })).toBe(6);
    // Never a strip and never a smear, whatever the box.
    for (const count of [8, 16, 20, 24, 28, 32]) {
      for (const box of [{ w: 320, h: 180 }, { w: 820, h: 200 }, { w: 300, h: 700 }]) {
        const cols = gridColumns(count, false, box);
        expect(cols).toBeGreaterThanOrEqual(2);
        expect(cols).toBeLessThanOrEqual(8);
      }
    }
  });
  it('leaves an orderly board its suit columns whatever shape the screen is', () => {
    // Not a layout choice: suitForSpace derives the suit from index % columns,
    // and that suit is what the transaction enforces. Re-shaping the grid would
    // recolour the board under the rule.
    for (const box of [{ w: 377, h: 250 }, { w: 820, h: 200 }, { w: 300, h: 700 }]) {
      expect(gridColumns(16, true, box)).toBe(orderlyColumns(16));
      expect(gridColumns(24, true, box)).toBe(orderlyColumns(24));
      expect(gridColumns(32, true, box)).toBe(orderlyColumns(32));
    }
  });
  it('keeps the fixed shape when nothing has been measured yet', () => {
    // A first paint and every static render land here.
    expect(gridColumns(16, false, undefined)).toBe(4);
    expect(gridColumns(16, false, { w: 0, h: 0 })).toBe(4);
  });
});

describe('the way out of being stuck', () => {
  // It sits in the band the wood column's two-card height leaves empty above the
  // posts, absolutely positioned so it costs no layout - not under the grid,
  // which is a long way from the pile it is talking about.
  const hand: Tableau = { dash: [c(5, 'red')], post: [[], [], []],
                          wood: [c(1, 'red'), c(2, 'blue')], woodIndex: 1 };
  const view = (over: Record<string, unknown>) => renderToStaticMarkup(createElement(
    TableauView, { t: hand, badgeId: 'tulip' as const, selection: null, postHighlight: [],
      onSelect: noop, onFlip: noop, onTapPost: noop, startDrag: noop,
      woodSide: 'right' as const, ...over }));

  it('says only that there are no moves until the offer is passed in', () => {
    const html = view({ stuck: true });
    expect(html).toContain('No moves left');
    expect(html).not.toContain('Send top wood card');
  });

  it('becomes the offer once it is, and says both halves', () => {
    // The message stays: the button says what has happened AND what pressing it
    // does, because it is the only thing on screen explaining either.
    const html = view({ stuck: true, onSinkWood: noop });
    expect(html).toContain('No moves left - Send top wood card to bottom');
    expect(html.match(/wood-note/g)).toHaveLength(1);
    expect(html).not.toContain('data-drop="nearest"');   // not a target while it talks
  });

  it('turns the band into a drop target when it has nothing to say', () => {
    // The band is the nearest empty space to a thumb coming off the wood, so a
    // throw that barely leaves the hand should land in it rather than nowhere.
    const html = view({ onSinkWood: noop });
    expect(html).not.toContain('No moves left');
    expect(html).toContain('data-drop="nearest"');
  });

  it('is inset from whichever end the wood is on', () => {
    // The band spans everything except the wood column, so the side it starts
    // from has to follow the player's own preference.
    expect(view({ stuck: true, woodSide: 'left' })).toContain('wood-left');
    expect(view({ stuck: true, woodSide: 'right' })).toContain('wood-right');
  });
});

describe('dragging off the wood', () => {
  // The play has not happened yet - it commits on the drop - so the pile still
  // holds the card. What it must not do is show a second copy of the one already
  // following the finger.
  const hand = (woodIndex: number): Tableau =>
    ({ dash: [c(5, 'red')], post: [[], [], []],
       wood: [c(1, 'red'), c(2, 'blue'), c(3, 'green'), c(4, 'yellow')], woodIndex });
  const view = (t: Tableau, dragging: PlaySource | null) => renderToStaticMarkup(createElement(
    TableauView, { t, badgeId: 'tulip' as const, selection: null, postHighlight: [],
      onSelect: noop, onFlip: noop, onTapPost: noop, startDrag: noop,
      woodSide: 'right' as const, dragging }));

  it('shows the card underneath while the top one is in the air', () => {
    const t = hand(3);                       // 1, 2, 3 turned over; 3 is on top
    expect(view(t, null)).toContain('>3<');  // at rest, the top card
    const lifted = view(t, { kind: 'wood' });
    expect(lifted).not.toContain('>3<');     // not a second copy of what is held
    expect(lifted).toContain('>2<');         // the one under it
  });

  it('leaves an empty slot when there is nothing underneath', () => {
    // A single-card turn, or the first card of the pile: taking it leaves nothing.
    expect(view(hand(1), { kind: 'wood' })).not.toContain('>1<');
  });

  it('is unmoved by a drag from anywhere else', () => {
    expect(view(hand(3), { kind: 'dash' })).toContain('>3<');
    expect(view(hand(3), { kind: 'post', index: 0 })).toContain('>3<');
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
    // Only slots holding a card: dash top + 2 non-empty posts + wood top. The
    // third post is empty and takes no width at all - see OpponentStrip.
    expect(html.split('opp-slot').length - 1).toBe(4);
    expect(html).not.toContain('pile-space');
    // and in the same order as your own tableau: the Dash slot, the one carrying
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
    const text = renderRow(player(), { centerCount: 6, dashLeft: 2, delta: 2 });
    expect(text).toContain('Dave -4 +6 = +2 47');
  });
  it('takes the sum from the committed delta instead of recomputing it', () => {
    // delta is the exact number commitScores added to player.score. Recomputing
    // from the components here would let the row show a sum that disagrees with
    // the total beside it; this fixture disagrees on purpose to pin that.
    const text = renderRow(player(), { centerCount: 6, dashLeft: 2, delta: 9 });
    expect(text).toContain('= +9 47');
  });
  it('leaves zero unsigned and signs a losing round', () => {
    const dasher = renderRow(player({ name: 'Ann', score: 56 }), { centerCount: 9, dashLeft: 0, delta: 9 });
    expect(dasher).toContain('Ann 0 +9 = +9 56'); // not "-0", which reads as a typo
    const loser = renderRow(player(), { centerCount: 3, dashLeft: 4, delta: -5 });
    expect(loser).toContain('Dave -8 +3 = -5 47');
  });
  it('degrades to a name and a total when there is no round breakdown', () => {
    // Game over can render from a snapshot with no round/scores.
    expect(renderRow(player())).toBe('🌷\uFE0F Dave 47');   // the badge carries its emoji selector
  });
});

describe('DashSplash', () => {
  const player = (score: number): PlayerInfo => ({
    name: 'P', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score,
  });
  const table = (...scores: number[]) =>
    Object.fromEntries(scores.map((s, i) => [`p${i}`, player(s)]));

  // No `round` passed means no projected deltas, so before and after are the same
  // standings - which is the right reading of "the board tells us nothing yet".
  const base = (t: Record<string, PlayerInfo>, dasher: string, uid: string | null) =>
    splashVariant(t, dasher, uid).base;

  it('gives the dasher glitter and never a trophy - they have the glitter', () => {
    expect(splashVariant(table(10, 20, 30), 'p1', 'p1')).toEqual({ base: 'glitter', trophy: false });
  });
  it('never poos on a two-player game', () => {
    // Heads-up, the loser is always last. Rubbing it in is a group activity.
    expect(base(table(30, 2), 'p0', 'p1')).toBe('crying');
  });
  it('poos on the worst score at three or more, and everyone else cries', () => {
    const t = table(30, 2, 20);
    expect(base(t, 'p0', 'p1')).toBe('poo');
    expect(base(t, 'p0', 'p2')).toBe('crying');
  });
  it('poos on everyone tied for worst', () => {
    const t = table(30, 2, 2);
    expect(base(t, 'p0', 'p1')).toBe('poo');
    expect(base(t, 'p0', 'p2')).toBe('poo');
  });
  it('spares the table when the dasher is the one propping it up', () => {
    // The winner gets glitter, so nobody gets the poo that round.
    const t = table(2, 30, 20);
    expect(base(t, 'p0', 'p0')).toBe('glitter');
    expect(base(t, 'p0', 'p1')).toBe('crying');
    expect(base(t, 'p0', 'p2')).toBe('crying');
  });
  it('is unreadable to a spectator with no uid, and does not crash', () => {
    expect(base(table(30, 2, 20), 'p0', null)).toBe('crying');
  });

  // The four losing faces turn on what the round DID, so these pass a board and
  // let scoreRound project it - the same arithmetic the host is about to run.
  // scoreRound walks the TABLEAUS and counts each owner's cards out of the
  // spaces, so every player needs a hand for the projection to see them at all.
  const empty = (): Tableau => ({ dash: [], post: [], wood: [], woodIndex: 0 });
  const board = (owner: string, cards: number, who = ['p0', 'p1', 'p2']) => ({
    spaces: [{ stack: Array.from({ length: cards }, (_, i) => c(i + 1, 'red', owner)), history: [] }],
    tableaus: Object.fromEntries(who.map(id => [id, empty()])) as Record<string, Tableau>,
  });

  it('flushes somebody who has just dropped into last', () => {
    // p1 is on 20 and p2 on 18; p2 plays nine cards and goes past them.
    const t = table(40, 20, 18);
    const r = board('p2', 9);
    expect(splashVariant(t, 'p0', 'p1', r)).toEqual({ base: 'toilet', trophy: false });
  });
  it('gives relief to somebody who has just climbed out of it', () => {
    const t = table(40, 20, 18);
    expect(splashVariant(t, 'p0', 'p2', board('p2', 9)).base).toBe('relief');
  });
  it('sends the trophy down with whatever else is falling', () => {
    // p1 leads after the round and did not dash: tears and a trophy.
    const t = table(10, 30, 12);
    expect(splashVariant(t, 'p0', 'p1', board('p0', 3))).toEqual({ base: 'crying', trophy: true });
  });
  it('hands nobody a trophy on a level table', () => {
    expect(splashVariant(table(10, 10, 10), 'p0', 'p1').trophy).toBe(false);
  });

  const render = (splash: Splash) =>
    renderToStaticMarkup(createElement(DashSplash, { name: 'Dave', splash }));
  it('throws exactly one kind of thing at a viewer', () => {
    const glitter = render({ base: 'glitter', trophy: false });
    expect(glitter).toContain('🥳');
    expect(glitter).not.toContain('😢');
    expect(glitter).toContain('fireworks');
    const poo = render({ base: 'poo', trophy: false });
    expect(poo).toContain('💩');
    expect(poo).not.toContain('🥳');
    expect(poo).not.toContain('🏆');
    expect(render({ base: 'crying', trophy: true })).toContain('🏆');
    expect(render({ base: 'toilet', trophy: false })).toContain('🚽');
    expect(render({ base: 'relief', trophy: false })).toContain('🥹');
  });
});

describe('rankRows', () => {
  const p = (score: number): PlayerInfo => ({
    name: 'P', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, awayAt: null, score,
  });
  const sc = (delta: number): RoundScore => ({ centerCount: 0, dashLeft: 0, delta });

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
      scores: { ann: { centerCount: 0, dashLeft: 0, delta: 12 },
                bo: { centerCount: 0, dashLeft: 0, delta: -2 } },
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

describe('an unknown badge', () => {
  const player: PlayerInfo = { name: 'Eve', badgeId: 'unicorn' as never, joinedAt: 1, connected: true,
                               stuckAt: null, awayAt: null, score: 3 };
  it('is drawn grey on the score sheet, the strip and a card, not thrown', () => {
    // Every one of these indexed BADGES by the id in the player record and read
    // .color off the result - a TypeError in render that took the tree down for
    // everybody in the room. The record is written by the player's own client.
    expect(() => renderToStaticMarkup(createElement(ScoreRow, { player }))).not.toThrow();
    const strip = renderToStaticMarkup(createElement(OpponentStrip, {
      me: 'me', players: { eve: player }, tableaus: { eve: tableau() },
    }));
    expect(strip).toContain('Eve');
    expect(strip).toContain('#6b7280');
    const grid = renderToStaticMarkup(createElement(CenterGrid, {
      spaces: [{ stack: [c(1, 'red', 'eve')], history: [] }], highlight: [],
      badgeOf: () => 'unicorn' as never, onTap: noop, onSnapTap: noop,
    }));
    expect(grid).toContain('?');
  });
});
