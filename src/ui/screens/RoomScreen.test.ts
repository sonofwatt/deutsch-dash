import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Rejoining } from './Join';
import { roomView } from './roomView';

describe('roomView', () => {
  it('holds the rejoining placeholder for the round trip between joining and the first snapshot', () => {
    // The window that used to render the live join form to somebody already in
    // the room: `watch()` sets joinPhase synchronously, `room` lands a listen
    // round trip later.
    expect(roomView('in-room', false)).toBe('rejoining');
  });
  it('shows the room once the snapshot is in', () => {
    expect(roomView('in-room', true)).toBe('room');
  });
  it('still offers the form to somebody who has not joined, mid-join included', () => {
    expect(roomView('idle', false)).toBe('form');
    expect(roomView('joining', false)).toBe('form');
    // Even holding a room from a previous session: not being in it is what counts.
    expect(roomView('idle', true)).toBe('form');
  });
});

describe('Rejoining', () => {
  it('says what is happening and offers no button a second tap could hit', () => {
    const html = renderToStaticMarkup(createElement(Rejoining, { code: 'ABCDEF' }));
    expect(html).toContain('Rejoining');
    expect(html).toContain('ABCDEF');
    expect(html).not.toContain('<button'); // the whole point: nothing to re-fire enterRoom
  });
});
