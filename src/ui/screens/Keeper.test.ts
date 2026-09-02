import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Keeper } from './Keeper';

describe('Keeper', () => {
  const withSaved = (game: unknown) => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => JSON.stringify(game), setItem: () => {}, removeItem: () => {} },
    });
    const html = renderToStaticMarkup(createElement(Keeper));
    delete (globalThis as Record<string, unknown>).localStorage;
    return html;
  };

  it('renders its setup screen with no DOM and no saved game', () => {
    // The screen reads localStorage, which does not exist here. If any of that
    // read moved to module or render scope this would throw rather than fail.
    const html = renderToStaticMarkup(createElement(Keeper));
    expect(html).toContain('Score keeper');
    expect(html).toContain('Add player');
    // Nothing to keep score for yet, so the way forward is closed.
    expect(html).toContain('Add two named players');
    expect(html).toContain('disabled');
  });

  it('picks a saved game back up at the scoreboard', () => {
    const html = withSaved({
      targetScore: 25, snark: true,
      players: [{ id: 'tulip', name: 'Ada', badgeId: 'tulip' },
                { id: 'star', name: 'Bo', badgeId: 'star' }],
      rounds: [{ ms: 61_000, scores: { tulip: { centerCount: 9, dashLeft: 0, delta: 9 },
                                       star: { centerCount: 2, dashLeft: 5, delta: -8 } } }],
    });
    expect(html).toContain('After round 1');
    expect(html).toContain('Ada');
  });

  it('sends a table that was set but never played back to setup', () => {
    // Otherwise reopening lands on a scoreboard of zeroes with nothing to fix.
    const html = withSaved({
      targetScore: 75, snark: true, rounds: [],
      players: [{ id: 'tulip', name: 'Ada', badgeId: 'tulip' }],
    });
    expect(html).toContain('Score keeper');
    expect(html).toContain('Add player');
  });
});
