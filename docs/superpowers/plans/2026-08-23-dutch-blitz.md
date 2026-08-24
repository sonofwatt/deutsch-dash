# Dutch Blitz Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile-first multiplayer Dutch Blitz web game (2-8 players) with rooms + SMS-shareable invite links, hosted free on GitHub Pages with Firebase Realtime Database as the only backend.

**Architecture:** Pure game logic in `src/game/` (no React/Firebase imports, fully unit-tested). Firebase access isolated in `src/net/` (RTDB transactions referee simultaneous plays; each player writes only their own subtree). One Zustand store in `src/state/` merges RTDB snapshots with the local optimistic tableau. React UI in `src/ui/` renders from the store; Framer Motion animates card movement.

**Tech Stack:** Vite + React 18 + TypeScript (strict), firebase (RTDB + anonymous auth), zustand, framer-motion, Vitest. GitHub Actions -> GitHub Pages. Firebase Emulator Suite for local dev/integration tests.

**Spec:** `docs/superpowers/specs/2026-08-23-dutch-blitz-design.md`. Two refinements the plan makes to the spec's data-model sketch (same behavior, better atomicity): the center grid lives at `round/spaces/{0..15}` as `{ stack, history }` so a completed pile is archived in the SAME node by the SAME transaction that clears it (scoring reads history; nothing is lost), and tableau post piles are `Card[][]` stacks to support official post building.

## Global Constraints

- TypeScript `strict: true`; no `any` in committed code.
- 2-8 players; 16 center spaces (4x4); default target score 75 (host-configurable); post piles: 3 (5 when exactly 2 players).
- Suits: red, blue, green, yellow. Face groups: red+blue = "boy", yellow+green = "girl". Post builds: descending by exactly 1, alternating face group. Center piles: 1->10 same suit.
- Room codes: 6 chars from alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Rooms expire 24h after `createdAt` (client-side check).
- Stack order convention everywhere: **last array element = top of pile**.
- Mobile-first: Pointer Events only (no mouse/touch forks); touch targets >= 44px; `100dvh`; safe-area insets; `touch-action: none` on draggables; `user-select: none` on cards; `overscroll-behavior: none`; respect `prefers-reduced-motion`.
- Animations use `transform`/`opacity` only.
- Hash routing only (`#/room/CODE`) — no history API, no 404 tricks.
- No server code. Firebase anonymous auth only. `src/net/firebaseConfig.ts` is committed (safe by design).
- Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (shown once here, implied in every commit step below).
- All commands run from the repo root. If a `Run:` step fails, stop and debug (superpowers:systematic-debugging) before proceeding.

## File Structure

```
.github/workflows/deploy.yml     GH Pages deploy
database.rules.json              RTDB security rules
firebase.json                    emulator config
index.html                       meta tags, PWA-lite, fonts
public/icon.svg                  app icon
src/main.tsx, src/App.tsx        bootstrap + hash router
src/theme.css                    design tokens, resets, mobile hardening
src/game/types.ts                Card/Tableau/Room/phase types
src/game/badges.ts               8 badge definitions
src/game/deck.ts                 buildDeck, shuffle(rng), deal
src/game/rules.ts                faceGroup, canPlayToCenter, canBuildOnPost, refillPosts, takeCard, hasLegalMove, postCountForPlayers
src/game/wood.ts                 flipWood, rotateWood, woodTop
src/game/center.ts               normalizeSpace, normalizeTableau, centerPlayTxn, reconcileTableau
src/game/scoring.ts              scoreRound, winnerIds
src/net/firebaseConfig.ts        committed config (placeholder until pasted)
src/net/firebase.ts              app/auth/db init + emulator wiring
src/net/roomCodes.ts             code generator
src/net/rooms.ts                 createRoom, joinRoom, watchRoom, presence, setTarget
src/net/plays.ts                 startRound, playToCenter, buildPost, persistTableau, flip/stuck, endRound, commitScores, nextRound, rematch, host transfer
src/state/store.ts               zustand store (snapshots + optimistic tableau + selection)
src/ui/screens/                  Home.tsx Join.tsx Lobby.tsx Game.tsx
src/ui/components/               CardView.tsx CardBack.tsx CenterGrid.tsx TableauView.tsx OpponentStrip.tsx ShareInvite.tsx RoundEndOverlay.tsx GameOverOverlay.tsx BlitzSplash.tsx ConnectionPill.tsx
src/ui/useDrag.ts                pointer-event drag + drop hit-testing
tests mirror src: src/game/*.test.ts, src/net/*.test.ts (emulator tests gated by EMULATOR=1)
```

---

### Task 1: Scaffold, tooling, theme, router shell

**Files:**
- Create: Vite react-ts project in repo root; replace `vite.config.ts`, `src/theme.css`, `src/App.tsx`, `src/main.tsx`; edit `index.html`, `package.json`; create `public/icon.svg`
- Test: `src/App.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `parseHash(hash: string): Route` and `useRoute(): Route` from `src/App.tsx` where `Route = { screen: 'home' } | { screen: 'room'; code: string }`; CSS classes `.screen .btn .btn-primary .field`; CSS vars `--bg --surface --ink --ink-soft --line --accent --danger --suit-red --suit-blue --suit-green --suit-yellow --card-w --card-h --radius --shadow`; npm scripts `dev build test emu`.

- [ ] **Step 1: Scaffold Vite app into the existing repo root**

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install firebase zustand framer-motion
npm install -D vitest cross-env firebase-tools
```

Note: `npm create vite` into a non-empty dir asks how to proceed — choose "Ignore files and continue" (it preserves `.git/` and `docs/`).

- [ ] **Step 2: Configure Vite + Vitest + Pages base**

Replace `vite.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GH Actions sets GITHUB_PAGES_BASE=/<repo-name>/ ; local dev defaults to '/'
export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE ?? '/',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

In `package.json`, set scripts:

```json
"dev": "vite",
"build": "tsc -b && vite build",
"test": "vitest run",
"test:watch": "vitest",
"emu": "firebase emulators:start --only database,auth --project demo-blitz"
```

- [ ] **Step 3: Delete template cruft, add theme tokens**

Delete `src/App.css`, `src/index.css`, `src/assets/react.svg`, `public/vite.svg`. Create `src/theme.css`:

```css
:root {
  --bg: #f4f2ec; --surface: #ffffff; --ink: #23211c; --ink-soft: #7a766c;
  --line: #e3e0d7; --accent: #23211c; --danger: #b3261e;
  --suit-red: #d92d20; --suit-blue: #2563eb; --suit-green: #16a34a; --suit-yellow: #eab308;
  --card-w: clamp(44px, 12vw, 72px); --card-h: calc(var(--card-w) * 1.4);
  --radius: 10px; --shadow: 0 1px 2px rgb(0 0 0 / .08), 0 4px 12px rgb(0 0 0 / .06);
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #171613; --surface: #23211c; --ink: #f2f0ea; --ink-soft: #a29d92;
          --line: #37342d; --accent: #f2f0ea; }
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: "Outfit", system-ui, -apple-system, "Segoe UI", sans-serif;
  overscroll-behavior: none; -webkit-tap-highlight-color: transparent;
}
button { font: inherit; }
.screen { min-height: 100dvh; display: flex; flex-direction: column; gap: 16px;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
           max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
.btn { min-height: 48px; padding: 0 20px; border-radius: var(--radius); border: 1px solid var(--line);
  background: var(--surface); color: var(--ink); cursor: pointer; box-shadow: var(--shadow); }
.btn-primary { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.btn:disabled { opacity: .4; cursor: default; }
input.field, select.field { min-height: 48px; padding: 0 14px; border-radius: var(--radius);
  border: 1px solid var(--line); background: var(--surface); color: var(--ink); width: 100%; }
```

- [ ] **Step 4: index.html head (PWA-lite + font)**

In `index.html`, replace the `<head>` children with:

```html
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#f4f2ec" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#171613" media="(prefers-color-scheme: dark)" />
<link rel="icon" href="./icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="./icon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet" />
<title>German Spree</title>
```

Create `public/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#23211c"/>
  <rect x="18" y="24" width="34" height="48" rx="6" fill="#d92d20" transform="rotate(-8 35 48)"/>
  <rect x="46" y="26" width="34" height="48" rx="6" fill="#2563eb" transform="rotate(7 63 50)"/>
  <text x="50" y="63" font-family="sans-serif" font-size="30" font-weight="800" fill="#fff" text-anchor="middle">1</text>
</svg>
```

- [ ] **Step 5: Write failing route-parser test**

Create `src/App.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseHash } from './App';

describe('parseHash', () => {
  it('routes empty and junk to home', () => {
    expect(parseHash('')).toEqual({ screen: 'home' });
    expect(parseHash('#/nope')).toEqual({ screen: 'home' });
  });
  it('routes room links, uppercasing the code', () => {
    expect(parseHash('#/room/ab2xyz')).toEqual({ screen: 'room', code: 'AB2XYZ' });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — App does not export `parseHash`.

- [ ] **Step 7: Implement App shell + parseHash**

Replace `src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import './theme.css';

export type Route = { screen: 'home' } | { screen: 'room'; code: string };

export function parseHash(hash: string): Route {
  const m = /^#\/room\/([A-Za-z0-9]{4,10})$/.exec(hash);
  return m ? { screen: 'room', code: m[1].toUpperCase() } : { screen: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  return (
    <div className="screen">
      <h1>German Spree</h1>
      <p>{route.screen === 'room' ? `Room ${route.code}` : 'Home'}</p>
    </div>
  );
}
```

Replace `src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
```

- [ ] **Step 8: Verify tests and build pass**

Run: `npm test` — Expected: 2 passed.
Run: `npm run build` — Expected: tsc clean; `dist/` emitted.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite+React+TS app with theme tokens and hash router"
```

---

### Task 2: Card types, badges, deck building and dealing

**Files:**
- Create: `src/game/types.ts`, `src/game/badges.ts`, `src/game/deck.ts`
- Test: `src/game/deck.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces (used by every later task):
  - `types.ts`: `Suit = 'red'|'blue'|'green'|'yellow'`; `FaceGroup = 'boy'|'girl'`; `Card { v: number; suit: Suit; owner: string }`; `cardId(c: Card): string`; `PlaySource = { kind: 'blitz' } | { kind: 'wood' } | { kind: 'post'; index: number }`; `Tableau { blitz: Card[]; post: Card[][]; wood: Card[]; woodIndex: number }`; `CenterSpace { stack: Card[]; history: Card[][] }`; `Phase = 'lobby'|'playing'|'roundEnd'|'gameOver'`; `RoomMeta { createdAt: number; hostId: string; targetScore: number; phase: Phase; roundNumber: number }`; `PlayerInfo { name: string; badgeId: BadgeId; joinedAt: number; connected: boolean; stuckAt: number | null; score: number }`; `RoundScore { centerCount: number; blitzLeft: number; delta: number }`; `RoundState { spaces: CenterSpace[]; tableaus: Record<string, Tableau>; blitzedBy: string | null; scores: Record<string, RoundScore> | null; stuckRounds: number; startedAt: number }`; `Room { meta: RoomMeta; players: Record<string, PlayerInfo>; round: RoundState | null }`
  - `badges.ts`: `BadgeId` union; `BADGES: Record<BadgeId, Badge>` with `Badge { id: BadgeId; label: string; color: string; glyph: string }`; `BADGE_IDS: BadgeId[]`
  - `deck.ts`: `SUITS: Suit[]`; `Rng = () => number`; `buildDeck(owner: string): Card[]` (40 cards); `shuffle<T>(items: T[], rng?: Rng): T[]` (pure, Fisher-Yates); `deal(deck: Card[], postCount: number): Tableau`

- [ ] **Step 1: Write types.ts** (types only, no test needed)

```ts
export type Suit = 'red' | 'blue' | 'green' | 'yellow';
export type FaceGroup = 'boy' | 'girl';

export interface Card { v: number; suit: Suit; owner: string }

export function cardId(c: Card): string { return `${c.owner}:${c.suit}:${c.v}`; }

export type PlaySource =
  | { kind: 'blitz' }
  | { kind: 'wood' }
  | { kind: 'post'; index: number };

/** Last array element = top, everywhere. */
export interface Tableau { blitz: Card[]; post: Card[][]; wood: Card[]; woodIndex: number }

export interface CenterSpace { stack: Card[]; history: Card[][] }

export type Phase = 'lobby' | 'playing' | 'roundEnd' | 'gameOver';

export interface RoomMeta {
  createdAt: number; hostId: string; targetScore: number; phase: Phase; roundNumber: number;
}

import type { BadgeId } from './badges';
export interface PlayerInfo {
  name: string; badgeId: BadgeId; joinedAt: number; connected: boolean;
  stuckAt: number | null; score: number;
}

export interface RoundScore { centerCount: number; blitzLeft: number; delta: number }

export interface RoundState {
  spaces: CenterSpace[]; tableaus: Record<string, Tableau>;
  blitzedBy: string | null; scores: Record<string, RoundScore> | null;
  stuckRounds: number; startedAt: number;
}

export interface Room { meta: RoomMeta; players: Record<string, PlayerInfo>; round: RoundState | null }
```

- [ ] **Step 2: Write badges.ts**

```ts
export type BadgeId =
  | 'tulip' | 'bicycle' | 'star' | 'bell' | 'kite' | 'anchor' | 'acorn' | 'boat';

export interface Badge { id: BadgeId; label: string; color: string; glyph: string }

export const BADGES: Record<BadgeId, Badge> = {
  tulip:   { id: 'tulip',   label: 'Tulip',   color: '#db2777', glyph: '\u{1F337}' },
  bicycle: { id: 'bicycle', label: 'Bicycle', color: '#0d9488', glyph: '\u{1F6B2}' },
  star:    { id: 'star',    label: 'Star',    color: '#7c3aed', glyph: '⭐' },
  bell:    { id: 'bell',    label: 'Bell',    color: '#ea580c', glyph: '\u{1F514}' },
  kite:    { id: 'kite',    label: 'Kite',    color: '#4f46e5', glyph: '\u{1FA81}' },
  anchor:  { id: 'anchor',  label: 'Anchor',  color: '#0891b2', glyph: '⚓' },
  acorn:   { id: 'acorn',   label: 'Acorn',   color: '#92400e', glyph: '\u{1F330}' },
  boat:    { id: 'boat',    label: 'Boat',    color: '#475569', glyph: '⛵' },
};

export const BADGE_IDS = Object.keys(BADGES) as BadgeId[];
```

- [ ] **Step 3: Write failing deck tests**

Create `src/game/deck.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDeck, shuffle, deal, SUITS } from './deck';
import { cardId } from './types';

const rig = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('buildDeck', () => {
  it('makes 40 unique owner-stamped cards, 1-10 per suit', () => {
    const deck = buildDeck('u1');
    expect(deck).toHaveLength(40);
    expect(new Set(deck.map(cardId)).size).toBe(40);
    for (const suit of SUITS) {
      const vals = deck.filter(c => c.suit === suit).map(c => c.v).sort((a, b) => a - b);
      expect(vals).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
    expect(deck.every(c => c.owner === 'u1')).toBe(true);
  });
});

describe('shuffle', () => {
  it('is a permutation and does not mutate input', () => {
    const deck = buildDeck('u1');
    const copy = [...deck];
    const out = shuffle(deck, rig([0.42, 0.1, 0.99, 0.5]));
    expect(deck).toEqual(copy);
    expect(new Set(out.map(cardId)).size).toBe(40);
    expect(out).toHaveLength(40);
  });
  it('is deterministic for a given rng', () => {
    const a = shuffle(buildDeck('u1'), rig([0.3, 0.7]));
    const b = shuffle(buildDeck('u1'), rig([0.3, 0.7]));
    expect(a).toEqual(b);
  });
});

describe('deal', () => {
  it('splits 10 blitz / N single-card posts / rest wood, woodIndex 0', () => {
    const deck = buildDeck('u1');
    const t = deal(deck, 3);
    expect(t.blitz).toHaveLength(10);
    expect(t.post).toEqual([[deck[10]], [deck[11]], [deck[12]]]);
    expect(t.wood).toHaveLength(27);
    expect(t.woodIndex).toBe(0);
    const all = [...t.blitz, ...t.post.flat(), ...t.wood];
    expect(new Set(all.map(cardId)).size).toBe(40);
  });
  it('supports 5 posts for 2-player games', () => {
    const t = deal(buildDeck('u1'), 5);
    expect(t.post).toHaveLength(5);
    expect(t.wood).toHaveLength(25);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./deck`.

- [ ] **Step 5: Implement deck.ts**

```ts
import type { Card, Suit, Tableau } from './types';

export const SUITS: Suit[] = ['red', 'blue', 'green', 'yellow'];

export type Rng = () => number; // returns [0, 1)

export function buildDeck(owner: string): Card[] {
  return SUITS.flatMap(suit =>
    Array.from({ length: 10 }, (_, i) => ({ v: i + 1, suit, owner })),
  );
}

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function deal(deck: Card[], postCount: number): Tableau {
  return {
    blitz: deck.slice(0, 10),
    post: Array.from({ length: postCount }, (_, i) => [deck[10 + i]]),
    wood: deck.slice(10 + postCount),
    woodIndex: 0,
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: all pass (deck suite 5 tests + Task 1 route tests).

- [ ] **Step 7: Commit**

```bash
git add src/game
git commit -m "feat: card types, badge definitions, deck build/shuffle/deal"
```

---

### Task 3: Core rules — center plays, post builds, refills, stuck detection

**Files:**
- Create: `src/game/rules.ts`
- Test: `src/game/rules.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`Card`, `Suit`, `FaceGroup`, `Tableau`, `PlaySource`, `CenterSpace`), `deck.ts` (test helpers)
- Produces:
  - `faceGroup(suit: Suit): FaceGroup`
  - `postCountForPlayers(playerCount: number): number` — 5 if 2 players else 3
  - `canPlayToCenter(card: Card, stack: Card[]): boolean`
  - `canBuildOnPost(card: Card, stack: Card[]): boolean` — false on empty stacks
  - `refillPosts(t: Tableau): Tableau` — pure; empty post stacks take the blitz top
  - `sourceTop(t: Tableau, source: PlaySource): Card | null`
  - `takeCard(t: Tableau, source: PlaySource): { next: Tableau; card: Card } | null` — removes the source top, applies `refillPosts`; null if source empty
  - `placeOnPost(t: Tableau, source: PlaySource, postIndex: number): Tableau | null` — validated post build (null if illegal, including building from a post onto itself)
  - `hasLegalMove(t: Tableau, spaces: CenterSpace[]): boolean`

Card shorthand used in all tests below (put at top of each test file that needs it):

```ts
import type { Card, Suit } from './types';
const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });
```

- [ ] **Step 1: Write failing rules tests**

Create `src/game/rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  faceGroup, postCountForPlayers, canPlayToCenter, canBuildOnPost,
  refillPosts, sourceTop, takeCard, placeOnPost, hasLegalMove,
} from './rules';
import type { Card, Suit, Tableau, CenterSpace } from './types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });
const space = (stack: Card[] = []): CenterSpace => ({ stack, history: [] });
const tab = (p: Partial<Tableau> = {}): Tableau =>
  ({ blitz: [], post: [[], [], []], wood: [], woodIndex: 0, ...p });

describe('faceGroup', () => {
  it('red+blue are boy, yellow+green are girl', () => {
    expect(faceGroup('red')).toBe('boy');
    expect(faceGroup('blue')).toBe('boy');
    expect(faceGroup('yellow')).toBe('girl');
    expect(faceGroup('green')).toBe('girl');
  });
});

describe('postCountForPlayers', () => {
  it('5 posts for 2 players, 3 otherwise', () => {
    expect(postCountForPlayers(2)).toBe(5);
    expect(postCountForPlayers(3)).toBe(3);
    expect(postCountForPlayers(8)).toBe(3);
  });
});

describe('canPlayToCenter', () => {
  it('only a 1 starts an empty space', () => {
    expect(canPlayToCenter(c(1, 'red'), [])).toBe(true);
    expect(canPlayToCenter(c(2, 'red'), [])).toBe(false);
  });
  it('requires same suit and exactly +1', () => {
    const stack = [c(1, 'red'), c(2, 'red')];
    expect(canPlayToCenter(c(3, 'red', 'other'), stack)).toBe(true);
    expect(canPlayToCenter(c(3, 'blue'), stack)).toBe(false);
    expect(canPlayToCenter(c(4, 'red'), stack)).toBe(false);
  });
});

describe('canBuildOnPost', () => {
  it('requires descending by 1 with alternating face group', () => {
    expect(canBuildOnPost(c(7, 'yellow'), [c(8, 'red')])).toBe(true);   // girl on boy
    expect(canBuildOnPost(c(7, 'green'), [c(8, 'blue')])).toBe(true);
    expect(canBuildOnPost(c(7, 'blue'), [c(8, 'red')])).toBe(false);    // boy on boy
    expect(canBuildOnPost(c(6, 'yellow'), [c(8, 'red')])).toBe(false);  // gap of 2
    expect(canBuildOnPost(c(9, 'yellow'), [c(8, 'red')])).toBe(false);  // ascending
  });
  it('checks the TOP of a stack, and rejects empty stacks', () => {
    expect(canBuildOnPost(c(6, 'red'), [c(8, 'red'), c(7, 'green')])).toBe(true);
    expect(canBuildOnPost(c(7, 'yellow'), [])).toBe(false); // empty slots refill from blitz only
  });
});

describe('refillPosts', () => {
  it('moves blitz top into each empty post slot', () => {
    const t = tab({ blitz: [c(4, 'red'), c(9, 'blue')], post: [[], [c(5, 'green')], []] });
    const out = refillPosts(t);
    expect(out.post[0]).toEqual([c(9, 'blue')]); // blitz TOP (last element) fills first
    expect(out.post[1]).toEqual([c(5, 'green')]);
    expect(out.post[2]).toEqual([c(4, 'red')]);
    expect(out.blitz).toEqual([]);
  });
  it('leaves slots empty when blitz is exhausted, and is a no-op otherwise', () => {
    const t = tab({ blitz: [], post: [[], [c(5, 'green')], []] });
    expect(refillPosts(t)).toEqual(t);
  });
});

describe('sourceTop / takeCard', () => {
  const t = tab({
    blitz: [c(4, 'red'), c(9, 'blue')],
    post: [[c(8, 'red'), c(7, 'green')], [c(2, 'blue')], [c(3, 'green')]],
    wood: [c(1, 'red'), c(2, 'red'), c(3, 'red'), c(4, 'blue')],
    woodIndex: 3,
  });
  it('reads tops without mutating', () => {
    expect(sourceTop(t, { kind: 'blitz' })).toEqual(c(9, 'blue'));
    expect(sourceTop(t, { kind: 'post', index: 0 })).toEqual(c(7, 'green'));
    expect(sourceTop(t, { kind: 'wood' })).toEqual(c(3, 'red')); // wood[woodIndex-1]
    expect(sourceTop(tab(), { kind: 'blitz' })).toBeNull();
    expect(sourceTop(tab({ wood: [c(1, 'red')] }), { kind: 'wood' })).toBeNull(); // nothing flipped
  });
  it('takeCard removes blitz top and refills empty posts from new blitz top', () => {
    const r = takeCard({ ...t, post: [[], [c(2, 'blue')], [c(3, 'green')]] }, { kind: 'blitz' })!;
    expect(r.card).toEqual(c(9, 'blue'));
    expect(r.next.post[0]).toEqual([c(4, 'red')]); // refilled from remaining blitz
    expect(r.next.blitz).toEqual([]);
  });
  it('takeCard from wood decrements woodIndex', () => {
    const r = takeCard(t, { kind: 'wood' })!;
    expect(r.card).toEqual(c(3, 'red'));
    expect(r.next.wood).toEqual([c(1, 'red'), c(2, 'red'), c(4, 'blue')]);
    expect(r.next.woodIndex).toBe(2);
  });
  it('takeCard from a post refills the emptied slot from blitz', () => {
    const r = takeCard(t, { kind: 'post', index: 1 })!;
    expect(r.card).toEqual(c(2, 'blue'));
    expect(r.next.post[1]).toEqual([c(9, 'blue')]);
    expect(r.next.blitz).toEqual([c(4, 'red')]);
  });
  it('returns null for empty sources', () => {
    expect(takeCard(tab(), { kind: 'blitz' })).toBeNull();
    expect(takeCard(tab(), { kind: 'post', index: 0 })).toBeNull();
    expect(takeCard(tab(), { kind: 'wood' })).toBeNull();
  });
});

describe('placeOnPost', () => {
  const t = tab({
    blitz: [c(9, 'blue')],
    post: [[c(8, 'red')], [c(2, 'blue')], [c(5, 'yellow')]],
    wood: [c(7, 'green'), c(4, 'blue')],
    woodIndex: 1,
  });
  it('moves a legal wood card onto a post stack', () => {
    const out = placeOnPost(t, { kind: 'wood' }, 0)!; // green 7 on red 8
    expect(out.post[0]).toEqual([c(8, 'red'), c(7, 'green')]);
    expect(out.wood).toEqual([c(4, 'blue')]);
    expect(out.woodIndex).toBe(0);
  });
  it('moves post top to another post; source slot refills from blitz', () => {
    const t2 = tab({ blitz: [c(9, 'blue')], post: [[c(8, 'red')], [c(7, 'green')], [c(2, 'blue')]] });
    const out = placeOnPost(t2, { kind: 'post', index: 1 }, 0)!;
    expect(out.post[0]).toEqual([c(8, 'red'), c(7, 'green')]);
    expect(out.post[1]).toEqual([c(9, 'blue')]);
    expect(out.blitz).toEqual([]);
  });
  it('rejects illegal builds, empty targets, and self-moves', () => {
    expect(placeOnPost(t, { kind: 'wood' }, 1)).toBeNull();          // 7 on 2
    expect(placeOnPost(t, { kind: 'post', index: 0 }, 0)).toBeNull(); // self
    expect(placeOnPost(tab({ blitz: [c(7, 'green')], post: [[c(8, 'red')], []] }), { kind: 'blitz' }, 1)).toBeNull(); // empty target
  });
});

describe('hasLegalMove', () => {
  it('true when a source can reach the center', () => {
    const t = tab({ blitz: [c(1, 'red')] });
    expect(hasLegalMove(t, [space()])).toBe(true);
  });
  it('true when only a post build exists', () => {
    const t = tab({ blitz: [c(9, 'blue')], post: [[c(8, 'red')], [c(7, 'green')], [c(3, 'blue')]] });
    // post[1] green 7 fits on post[0] red 8; nothing fits center (no 1s, center empty needs 1)
    expect(hasLegalMove(t, [space()])).toBe(true);
  });
  it('false when nothing fits anywhere', () => {
    const t = tab({ blitz: [c(9, 'blue')], post: [[c(8, 'blue')], [c(4, 'yellow')], [c(3, 'green')]],
                    wood: [c(10, 'green')], woodIndex: 1 });
    expect(hasLegalMove(t, [space([c(1, 'red')])])).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./rules`.

- [ ] **Step 3: Implement rules.ts**

```ts
import type { Card, CenterSpace, FaceGroup, PlaySource, Suit, Tableau } from './types';

export function faceGroup(suit: Suit): FaceGroup {
  return suit === 'red' || suit === 'blue' ? 'boy' : 'girl';
}

export function postCountForPlayers(playerCount: number): number {
  return playerCount === 2 ? 5 : 3;
}

export function canPlayToCenter(card: Card, stack: Card[]): boolean {
  if (stack.length === 0) return card.v === 1;
  const top = stack[stack.length - 1];
  return card.suit === top.suit && card.v === top.v + 1;
}

export function canBuildOnPost(card: Card, stack: Card[]): boolean {
  if (stack.length === 0) return false;
  const top = stack[stack.length - 1];
  return card.v === top.v - 1 && faceGroup(card.suit) !== faceGroup(top.suit);
}

export function refillPosts(t: Tableau): Tableau {
  if (!t.post.some(s => s.length === 0) || t.blitz.length === 0) return t;
  const blitz = [...t.blitz];
  const post = t.post.map(s => {
    if (s.length > 0 || blitz.length === 0) return s;
    return [blitz.pop() as Card];
  });
  return { ...t, blitz, post };
}

export function sourceTop(t: Tableau, source: PlaySource): Card | null {
  if (source.kind === 'blitz') return t.blitz[t.blitz.length - 1] ?? null;
  if (source.kind === 'wood') return t.woodIndex > 0 ? t.wood[t.woodIndex - 1] ?? null : null;
  const stack = t.post[source.index];
  return stack ? stack[stack.length - 1] ?? null : null;
}

export function takeCard(t: Tableau, source: PlaySource): { next: Tableau; card: Card } | null {
  const card = sourceTop(t, source);
  if (!card) return null;
  let next: Tableau;
  if (source.kind === 'blitz') {
    next = { ...t, blitz: t.blitz.slice(0, -1) };
  } else if (source.kind === 'wood') {
    const wood = [...t.wood];
    wood.splice(t.woodIndex - 1, 1);
    next = { ...t, wood, woodIndex: t.woodIndex - 1 };
  } else {
    next = { ...t, post: t.post.map((s, i) => (i === source.index ? s.slice(0, -1) : s)) };
  }
  return { next: refillPosts(next), card };
}

export function placeOnPost(t: Tableau, source: PlaySource, postIndex: number): Tableau | null {
  if (source.kind === 'post' && source.index === postIndex) return null;
  const card = sourceTop(t, source);
  const target = t.post[postIndex];
  if (!card || !target || !canBuildOnPost(card, target)) return null;
  const taken = takeCard(t, source);
  if (!taken) return null;
  // note: takeCard already refilled slots; now add the card to the target stack
  const post = taken.next.post.map((s, i) => (i === postIndex ? [...s, card] : s));
  return refillPosts({ ...taken.next, post });
}

export function hasLegalMove(t: Tableau, spaces: CenterSpace[]): boolean {
  const sources: PlaySource[] = [
    { kind: 'blitz' }, { kind: 'wood' },
    ...t.post.map((_, index) => ({ kind: 'post' as const, index })),
  ];
  for (const source of sources) {
    const card = sourceTop(t, source);
    if (!card) continue;
    if (spaces.some(sp => canPlayToCenter(card, sp.stack))) return true;
    for (let j = 0; j < t.post.length; j++) {
      if (source.kind === 'post' && source.index === j) continue;
      if (canBuildOnPost(card, t.post[j])) return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "feat: core rules - center plays, post builds, refills, stuck detection"
```

---

### Task 4: Wood pile mechanics — flip cycle and standstill rotation

**Files:**
- Create: `src/game/wood.ts`
- Test: `src/game/wood.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`Tableau`)
- Produces:
  - `flipWood(t: Tableau): Tableau` — advances `woodIndex` by 3 (capped at `wood.length`); when everything is already flipped, turns the pile over (index restarts at `min(3, wood.length)`); no-op on empty wood
  - `rotateWood(t: Tableau): Tableau` — official standstill rule: first card moves to the bottom, `woodIndex` resets to 0; no-op on wood with < 2 cards

- [ ] **Step 1: Write failing wood tests**

Create `src/game/wood.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { flipWood, rotateWood } from './wood';
import type { Card, Suit, Tableau } from './types';

const c = (v: number, suit: Suit): Card => ({ v, suit, owner: 'me' });
const woodTab = (wood: Card[], woodIndex = 0): Tableau =>
  ({ blitz: [], post: [[], [], []], wood, woodIndex });
const cards = (n: number) => Array.from({ length: n }, (_, i) => c((i % 10) + 1, 'red'));

describe('flipWood', () => {
  it('advances by 3, capping at the end (partial last flip)', () => {
    const t = woodTab(cards(7));
    const f1 = flipWood(t);
    expect(f1.woodIndex).toBe(3);
    const f2 = flipWood(f1);
    expect(f2.woodIndex).toBe(6);
    const f3 = flipWood(f2);
    expect(f3.woodIndex).toBe(7); // partial group of 1
  });
  it('turns the pile over after full traversal and starts again', () => {
    const t = woodTab(cards(7), 7);
    expect(flipWood(t).woodIndex).toBe(3);
  });
  it('handles piles smaller than 3 and empty piles', () => {
    expect(flipWood(woodTab(cards(2))).woodIndex).toBe(2);
    expect(flipWood(woodTab(cards(2), 2)).woodIndex).toBe(2); // turn over -> min(3, 2)
    expect(flipWood(woodTab([]))).toEqual(woodTab([]));
  });
  it('never mutates card order', () => {
    const t = woodTab(cards(7));
    expect(flipWood(t).wood).toEqual(t.wood);
  });
});

describe('rotateWood', () => {
  it('moves the first card to the bottom and resets the flip cycle', () => {
    const t = woodTab([c(1, 'red'), c(2, 'blue'), c(3, 'green')], 3);
    const out = rotateWood(t);
    expect(out.wood).toEqual([c(2, 'blue'), c(3, 'green'), c(1, 'red')]);
    expect(out.woodIndex).toBe(0);
  });
  it('is a no-op for 0 or 1 cards', () => {
    const t = woodTab([c(1, 'red')], 1);
    expect(rotateWood(t)).toEqual(t);
    expect(rotateWood(woodTab([]))).toEqual(woodTab([]));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./wood`.

- [ ] **Step 3: Implement wood.ts**

```ts
import type { Tableau } from './types';

export function flipWood(t: Tableau): Tableau {
  const len = t.wood.length;
  if (len === 0) return t;
  const woodIndex = t.woodIndex >= len ? Math.min(3, len) : Math.min(t.woodIndex + 3, len);
  return { ...t, woodIndex };
}

export function rotateWood(t: Tableau): Tableau {
  if (t.wood.length < 2) return t;
  return { ...t, wood: [...t.wood.slice(1), t.wood[0]], woodIndex: 0 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "feat: wood pile flip cycle and standstill rotation"
```

---

### Task 5: Center-space transaction function, RTDB normalization, reconciliation

Firebase RTDB strips empty arrays/objects from stored data (an empty `stack` comes back as `undefined`, an empty room node as `null`). All data crossing the RTDB boundary goes through the normalizers below. The transaction update function is pure so the race-refereeing logic is unit-testable without any emulator.

**Files:**
- Create: `src/game/center.ts`
- Test: `src/game/center.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `rules.ts` (`canPlayToCenter`)
- Produces:
  - `normalizeSpace(raw: unknown): CenterSpace` — tolerates `null`/missing fields
  - `normalizeSpaces(raw: unknown): CenterSpace[]` — always length 16
  - `normalizeTableau(raw: unknown, postCount: number): Tableau` — restores empty arrays (RTDB drops them); `post` always has `postCount` slots
  - `centerPlayTxn(card: Card): (raw: unknown) => CenterSpace | undefined` — returns `undefined` to abort (illegal/lost race); archives a completed 1..10 stack into `history` and empties `stack` in the same result
  - `reconcileTableau(t: Tableau, spaces: CenterSpace[]): Tableau` — removes any of MY cards that already exist in the center (self-heal after a crash between transaction commit and tableau persist)

- [ ] **Step 1: Write failing center tests**

Create `src/game/center.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeSpace, normalizeSpaces, normalizeTableau, centerPlayTxn, reconcileTableau } from './center';
import type { Card, Suit, CenterSpace } from './types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });

describe('normalize', () => {
  it('fills missing space fields', () => {
    expect(normalizeSpace(null)).toEqual({ stack: [], history: [] });
    expect(normalizeSpace({ stack: [c(1, 'red')] })).toEqual({ stack: [c(1, 'red')], history: [] });
  });
  it('always returns 16 spaces', () => {
    expect(normalizeSpaces(null)).toHaveLength(16);
    const arr = normalizeSpaces({ 3: { stack: [c(1, 'red')] } });
    expect(arr[3].stack).toEqual([c(1, 'red')]);
    expect(arr[0]).toEqual({ stack: [], history: [] });
  });
  it('restores tableau shape with fixed post count', () => {
    const t = normalizeTableau({ blitz: [c(2, 'red')], woodIndex: 0 }, 3);
    expect(t).toEqual({ blitz: [c(2, 'red')], post: [[], [], []], wood: [], woodIndex: 0 });
    const t5 = normalizeTableau({ post: { 1: [c(4, 'blue')] } }, 5);
    expect(t5.post).toEqual([[], [c(4, 'blue')], [], [], []]);
  });
});

describe('centerPlayTxn', () => {
  it('starts a pile with a 1 on an empty/null space', () => {
    expect(centerPlayTxn(c(1, 'red'))(null)).toEqual({ stack: [c(1, 'red')], history: [] });
  });
  it('appends a legal next card', () => {
    const space: CenterSpace = { stack: [c(1, 'red')], history: [] };
    expect(centerPlayTxn(c(2, 'red', 'other'))(space)!.stack).toHaveLength(2);
  });
  it('aborts (undefined) on an illegal play - the lost-race case', () => {
    const space: CenterSpace = { stack: [c(1, 'red'), c(2, 'red')], history: [] };
    expect(centerPlayTxn(c(2, 'red'))(space)).toBeUndefined();
    expect(centerPlayTxn(c(1, 'blue'))(space)).toBeUndefined();
  });
  it('archives a completed 1..10 stack and frees the space atomically', () => {
    const stack = Array.from({ length: 9 }, (_, i) => c(i + 1, 'green'));
    const out = centerPlayTxn(c(10, 'green'))({ stack, history: [] })!;
    expect(out.stack).toEqual([]);
    expect(out.history).toHaveLength(1);
    expect(out.history[0]).toHaveLength(10);
  });
});

describe('reconcileTableau', () => {
  it('drops my cards that already made it to the center', () => {
    const dupe = c(3, 'red', 'me');
    const t = { blitz: [dupe, c(9, 'blue', 'me')], post: [[c(3, 'red', 'other')]],
                wood: [c(5, 'green', 'me')], woodIndex: 0 };
    const spaces = normalizeSpaces({ 0: { stack: [c(3, 'red', 'me')] } });
    const out = reconcileTableau(t, spaces);
    expect(out.blitz).toEqual([c(9, 'blue', 'me')]);
    expect(out.post).toEqual([[c(3, 'red', 'other')]]); // other players' ids never match mine
    expect(out.wood).toEqual([c(5, 'green', 'me')]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./center`.

- [ ] **Step 3: Implement center.ts**

```ts
import type { Card, CenterSpace, Tableau } from './types';
import { cardId } from './types';
import { canPlayToCenter } from './rules';

function asCards(raw: unknown): Card[] {
  return Array.isArray(raw) ? (raw as Card[]) : raw ? (Object.values(raw) as Card[]) : [];
}

export function normalizeSpace(raw: unknown): CenterSpace {
  const r = (raw ?? {}) as { stack?: unknown; history?: unknown };
  const history = r.history
    ? (Array.isArray(r.history) ? r.history : Object.values(r.history)).map(asCards)
    : [];
  return { stack: asCards(r.stack), history };
}

export function normalizeSpaces(raw: unknown): CenterSpace[] {
  const r = (raw ?? {}) as Record<number, unknown>;
  return Array.from({ length: 16 }, (_, i) => normalizeSpace(r[i]));
}

export function normalizeTableau(raw: unknown, postCount: number): Tableau {
  const r = (raw ?? {}) as { blitz?: unknown; post?: unknown; wood?: unknown; woodIndex?: number };
  const rawPost = (r.post ?? {}) as Record<number, unknown>;
  return {
    blitz: asCards(r.blitz),
    post: Array.from({ length: postCount }, (_, i) => asCards(rawPost[i])),
    wood: asCards(r.wood),
    woodIndex: r.woodIndex ?? 0,
  };
}

export function centerPlayTxn(card: Card) {
  return (raw: unknown): CenterSpace | undefined => {
    const space = normalizeSpace(raw);
    if (!canPlayToCenter(card, space.stack)) return undefined;
    const stack = [...space.stack, card];
    if (stack.length === 10) return { stack: [], history: [...space.history, stack] };
    return { ...space, stack };
  };
}

export function reconcileTableau(t: Tableau, spaces: CenterSpace[]): Tableau {
  const centerIds = new Set(
    spaces.flatMap(s => [...s.stack, ...s.history.flat()]).map(cardId),
  );
  if (centerIds.size === 0) return t;
  const keep = (c: Card) => !centerIds.has(cardId(c));
  return {
    ...t,
    blitz: t.blitz.filter(keep),
    post: t.post.map(s => s.filter(keep)),
    wood: t.wood.filter(keep),
    woodIndex: Math.min(t.woodIndex, t.wood.filter(keep).length),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "feat: center-space transaction fn, RTDB normalizers, crash reconciliation"
```

---

### Task 6: Scoring

**Files:**
- Create: `src/game/scoring.ts`
- Test: `src/game/scoring.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`Card`, `CenterSpace`, `Tableau`, `RoundScore`)
- Produces:
  - `scoreRound(spaces: CenterSpace[], tableaus: Record<string, Tableau>): Record<string, RoundScore>` — counts every card in `stack` AND `history` per owner; `delta = centerCount - 2 * blitzLeft`; every uid in `tableaus` gets an entry
  - `winnerIds(scores: Record<string, number>, target: number): string[]` — uids at/above target holding the max score; `[]` if none reached target

- [ ] **Step 1: Write failing scoring tests**

Create `src/game/scoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreRound, winnerIds } from './scoring';
import type { Card, Suit, CenterSpace, Tableau } from './types';

const c = (v: number, suit: Suit, owner: string): Card => ({ v, suit, owner });
const tab = (blitz: Card[]): Tableau => ({ blitz, post: [[], [], []], wood: [], woodIndex: 0 });
const empty = (): CenterSpace => ({ stack: [], history: [] });

describe('scoreRound', () => {
  it('counts stack + history cards per owner, minus 2 per blitz card', () => {
    const spaces = [
      { stack: [c(1, 'red', 'a'), c(2, 'red', 'b')], history: [[c(1, 'blue', 'a'), c(2, 'blue', 'a')]] },
      empty(),
    ];
    const scores = scoreRound(spaces, {
      a: tab([c(9, 'green', 'a')]),
      b: tab([]),
    });
    expect(scores.a).toEqual({ centerCount: 3, blitzLeft: 1, delta: 1 });
    expect(scores.b).toEqual({ centerCount: 1, blitzLeft: 0, delta: 1 });
  });
  it('gives players with no center cards an entry (pure blitz penalty)', () => {
    const scores = scoreRound([empty()], { z: tab([c(1, 'red', 'z'), c(2, 'red', 'z')]) });
    expect(scores.z).toEqual({ centerCount: 0, blitzLeft: 2, delta: -4 });
  });
});

describe('winnerIds', () => {
  it('empty when nobody reached the target', () => {
    expect(winnerIds({ a: 40, b: 74 }, 75)).toEqual([]);
  });
  it('highest scorer at/above target wins; ties return multiple', () => {
    expect(winnerIds({ a: 80, b: 76, c: 10 }, 75)).toEqual(['a']);
    expect(winnerIds({ a: 80, b: 80, c: 79 }, 75)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./scoring`.

- [ ] **Step 3: Implement scoring.ts**

```ts
import type { CenterSpace, RoundScore, Tableau } from './types';

export function scoreRound(
  spaces: CenterSpace[], tableaus: Record<string, Tableau>,
): Record<string, RoundScore> {
  const centerCounts: Record<string, number> = {};
  for (const s of spaces) {
    for (const card of [...s.stack, ...s.history.flat()]) {
      centerCounts[card.owner] = (centerCounts[card.owner] ?? 0) + 1;
    }
  }
  const out: Record<string, RoundScore> = {};
  for (const [uid, t] of Object.entries(tableaus)) {
    const centerCount = centerCounts[uid] ?? 0;
    const blitzLeft = t.blitz.length;
    out[uid] = { centerCount, blitzLeft, delta: centerCount - 2 * blitzLeft };
  }
  return out;
}

export function winnerIds(scores: Record<string, number>, target: number): string[] {
  const reached = Object.entries(scores).filter(([, s]) => s >= target);
  if (reached.length === 0) return [];
  const max = Math.max(...reached.map(([, s]) => s));
  return reached.filter(([, s]) => s === max).map(([uid]) => uid).sort();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "feat: round scoring and game winner detection"
```

---

### Task 7: Firebase wiring, security rules, emulator config

No unit tests here (nothing but glue); the deliverable is verified by booting the emulator and signing in. Rules get exercised by Task 8's emulator-gated tests.

**Files:**
- Create: `src/net/firebaseConfig.ts`, `src/net/firebase.ts`, `database.rules.json`, `firebase.json`, `.firebaserc`
- Modify: `.gitignore` (append emulator artifacts)

**Interfaces:**
- Consumes: nothing in-repo
- Produces:
  - `firebaseConfig.ts`: `firebaseConfig` object; `isConfigured: boolean` (false while placeholder)
  - `firebase.ts`: `db: Database`; `auth: Auth`; `ensureSignedIn(): Promise<string>` (resolves to uid); `usingEmulator: boolean`

- [ ] **Step 1: Write firebaseConfig.ts (committed placeholder)**

```ts
// Paste your Firebase web-app config here (Firebase console -> Project settings -> Your apps).
// Committing it is safe by design: security comes from database.rules.json, not secrecy.
export const firebaseConfig = {
  apiKey: 'PASTE_ME',
  authDomain: 'PASTE_ME',
  databaseURL: 'PASTE_ME',
  projectId: 'PASTE_ME',
  appId: 'PASTE_ME',
};

export const isConfigured = firebaseConfig.apiKey !== 'PASTE_ME';
```

- [ ] **Step 2: Write firebase.ts with emulator fallback**

When no real config is pasted yet (or in dev), the app runs fully against the local emulator — the game is playable locally before any Firebase account exists.

```ts
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, type Database } from 'firebase/database';
import { firebaseConfig, isConfigured } from './firebaseConfig';

export const usingEmulator = !isConfigured;

const app = initializeApp(
  usingEmulator
    ? { apiKey: 'demo', projectId: 'demo-blitz', databaseURL: 'http://127.0.0.1:9000?ns=demo-blitz' }
    : firebaseConfig,
);

export const db: Database = getDatabase(app);
export const auth: Auth = getAuth(app);

if (usingEmulator) {
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

export function ensureSignedIn(): Promise<string> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  return signInAnonymously(auth).then(cred => cred.user.uid);
}
```

- [ ] **Step 3: Write database.rules.json**

Trust model (per spec): knowing a room code = membership. Tableaus and player records are owner-writable (host may also write, for dealing and score commits). Meta is writable by any signed-in user to allow room creation and host transfer — acceptable for casual play.

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": {
      "$code": {
        ".read": "auth != null",
        "meta": { ".write": "auth != null" },
        "players": {
          "$uid": {
            ".write": "auth != null && (auth.uid === $uid || root.child('rooms').child($code).child('meta').child('hostId').val() === auth.uid)"
          }
        },
        "round": {
          "spaces": { ".write": "auth != null" },
          "blitzedBy": { ".write": "auth != null" },
          "scores": { ".write": "auth != null" },
          "stuckRounds": { ".write": "auth != null" },
          "startedAt": { ".write": "auth != null" },
          ".write": "auth != null && root.child('rooms').child($code).child('meta').child('hostId').val() === auth.uid",
          "tableaus": {
            "$uid": {
              ".write": "auth != null && (auth.uid === $uid || root.child('rooms').child($code).child('meta').child('hostId').val() === auth.uid)"
            }
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Write firebase.json and .firebaserc**

`firebase.json`:

```json
{
  "database": { "rules": "database.rules.json" },
  "emulators": {
    "database": { "port": 9000 },
    "auth": { "port": 9099 },
    "ui": { "enabled": true }
  }
}
```

`.firebaserc` (placeholder project id; updated when the real project exists):

```json
{ "projects": { "default": "demo-blitz" } }
```

Append to `.gitignore`:

```
firebase-debug.log
database-debug.log
ui-debug.log
.firebase/
```

- [ ] **Step 5: Verify emulator boots and app signs in**

Prerequisite: Java 11+ on PATH (`java -version`) — the RTDB emulator is a JAR. If Java is missing, install Temurin JRE first; all emulator steps in later tasks share this prerequisite.

Run: `npm run emu` (leave running) — Expected: "All emulators ready!" with Database on 9000, Auth on 9099.
Run (second terminal): `npm run dev`, open `http://localhost:5173` — Expected: Home renders; browser console free of Firebase errors after adding a temporary `ensureSignedIn().then(uid => console.log('uid', uid))` call in `src/main.tsx`; remove the temporary line after confirming a uid prints.

- [ ] **Step 6: Verify build stays clean**

Run: `npm run build`
Expected: tsc clean (firebase imports typecheck).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: firebase init with emulator fallback, RTDB security rules"
```

---

### Task 8: Room lifecycle — codes, create, join, watch, presence

**Files:**
- Create: `src/net/roomCodes.ts`, `src/net/rooms.ts`
- Test: `src/net/roomCodes.test.ts` (pure), `src/net/rooms.emu.test.ts` (gated: runs only with `EMULATOR=1` + emulator up)

**Interfaces:**
- Consumes: `firebase.ts` (`db`, `ensureSignedIn`), `types.ts`, `badges.ts`, `center.ts` (normalizers)
- Produces:
  - `roomCodes.ts`: `CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`; `makeRoomCode(rng?: Rng): string` (6 chars)
  - `rooms.ts`:
    - `ROOM_TTL_MS = 24 * 60 * 60 * 1000`
    - `type JoinResult = { ok: true; code: string } | { ok: false; reason: 'not-found' | 'expired' | 'full' | 'badge-taken' | 'started' }`
    - `createRoom(name: string, badgeId: BadgeId): Promise<string>` — signs in, writes meta (creator = host, `targetScore: 75`, `phase: 'lobby'`, `roundNumber: 0`) + player record, starts presence; returns code
    - `joinRoom(code: string, name: string, badgeId: BadgeId): Promise<JoinResult>` — validates existence/expiry/8-cap/badge uniqueness/phase (rejoin of an existing uid is always allowed, any phase)
    - `watchRoom(code: string, cb: (room: Room | null) => void): () => void` — single `onValue` on `rooms/{code}`, normalized via `normalizeRoom`
    - `normalizeRoom(raw: unknown): Room | null` — exported for tests; applies `normalizeSpaces`/`normalizeTableau` (post count from player count) and defaults
    - `setTargetScore(code: string, target: number): Promise<void>`
    - `startPresence(code: string, uid: string): void` — `.info/connected` listener + `onDisconnect(connected).set(false)`
  - RTDB paths it owns: `rooms/{code}/meta`, `rooms/{code}/players/{uid}`

- [ ] **Step 1: Write failing roomCodes test**

Create `src/net/roomCodes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CODE_ALPHABET, makeRoomCode } from './roomCodes';

describe('makeRoomCode', () => {
  it('emits 6 chars from the unambiguous alphabet', () => {
    const code = makeRoomCode();
    expect(code).toHaveLength(6);
    expect([...code].every(ch => CODE_ALPHABET.includes(ch))).toBe(true);
  });
  it('excludes lookalike characters 0 O 1 I', () => {
    for (const bad of ['0', 'O', '1', 'I']) expect(CODE_ALPHABET.includes(bad)).toBe(false);
  });
  it('is deterministic under an injected rng', () => {
    expect(makeRoomCode(() => 0)).toBe('AAAAAA');
    expect(makeRoomCode(() => 0.999999)).toBe('999999');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./roomCodes`.

- [ ] **Step 3: Implement roomCodes.ts**

```ts
import type { Rng } from '../game/deck';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(rng: Rng = Math.random): string {
  return Array.from({ length: 6 },
    () => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join('');
}
```

Run: `npm test` — Expected: pass.

- [ ] **Step 4: Implement rooms.ts**

```ts
import {
  get, onDisconnect, onValue, ref, serverTimestamp, set, update,
} from 'firebase/database';
import { db, ensureSignedIn } from './firebase';
import { makeRoomCode } from './roomCodes';
import type { BadgeId } from '../game/badges';
import type { PlayerInfo, Room, RoomMeta, RoundState } from '../game/types';
import { normalizeSpaces, normalizeTableau } from '../game/center';
import { postCountForPlayers } from '../game/rules';

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_PLAYERS = 8;

export type JoinResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'not-found' | 'expired' | 'full' | 'badge-taken' | 'started' };

const roomRef = (code: string) => ref(db, `rooms/${code}`);

export function normalizeRoom(raw: unknown): Room | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { meta?: RoomMeta; players?: Record<string, PlayerInfo>; round?: unknown };
  if (!r.meta || !r.players) return null;
  const players: Record<string, PlayerInfo> = {};
  for (const [uid, p] of Object.entries(r.players)) {
    players[uid] = { stuckAt: null, connected: false, score: 0, ...p };
  }
  const postCount = postCountForPlayers(Object.keys(players).length);
  let round: RoundState | null = null;
  if (r.round && typeof r.round === 'object') {
    const rr = r.round as Partial<RoundState> & { tableaus?: Record<string, unknown> };
    round = {
      spaces: normalizeSpaces(rr.spaces),
      tableaus: Object.fromEntries(
        Object.entries(rr.tableaus ?? {}).map(([uid, t]) => [uid, normalizeTableau(t, postCount)]),
      ),
      blitzedBy: rr.blitzedBy ?? null,
      scores: rr.scores ?? null,
      stuckRounds: rr.stuckRounds ?? 0,
      startedAt: rr.startedAt ?? 0,
    };
  }
  return { meta: r.meta, players, round };
}

function playerRecord(name: string, badgeId: BadgeId): Omit<PlayerInfo, 'joinedAt'> & { joinedAt: object } {
  return { name, badgeId, joinedAt: serverTimestamp(), connected: true, stuckAt: null, score: 0 };
}

export async function createRoom(name: string, badgeId: BadgeId): Promise<string> {
  const uid = await ensureSignedIn();
  const code = makeRoomCode();
  const meta: Omit<RoomMeta, 'createdAt'> & { createdAt: object } = {
    createdAt: serverTimestamp(), hostId: uid, targetScore: 75, phase: 'lobby', roundNumber: 0,
  };
  await set(roomRef(code), { meta, players: { [uid]: playerRecord(name, badgeId) } });
  startPresence(code, uid);
  return code;
}

export async function joinRoom(code: string, name: string, badgeId: BadgeId): Promise<JoinResult> {
  const uid = await ensureSignedIn();
  const snap = await get(roomRef(code));
  const room = normalizeRoom(snap.val());
  if (!room) return { ok: false, reason: 'not-found' };
  if (Date.now() - room.meta.createdAt > ROOM_TTL_MS) return { ok: false, reason: 'expired' };
  const rejoining = uid in room.players;
  if (!rejoining) {
    if (room.meta.phase !== 'lobby') return { ok: false, reason: 'started' };
    if (Object.keys(room.players).length >= MAX_PLAYERS) return { ok: false, reason: 'full' };
    if (Object.values(room.players).some(p => p.badgeId === badgeId)) {
      return { ok: false, reason: 'badge-taken' };
    }
    await set(ref(db, `rooms/${code}/players/${uid}`), playerRecord(name, badgeId));
  } else {
    await update(ref(db, `rooms/${code}/players/${uid}`), { connected: true });
  }
  startPresence(code, uid);
  return { ok: true, code };
}

export function watchRoom(code: string, cb: (room: Room | null) => void): () => void {
  return onValue(roomRef(code), snap => cb(normalizeRoom(snap.val())));
}

export function setTargetScore(code: string, target: number): Promise<void> {
  return set(ref(db, `rooms/${code}/meta/targetScore`), target);
}

export function startPresence(code: string, uid: string): void {
  const connectedRef = ref(db, '.info/connected');
  const myConnected = ref(db, `rooms/${code}/players/${uid}/connected`);
  onValue(connectedRef, snap => {
    if (snap.val() === true) {
      onDisconnect(myConnected).set(false);
      set(myConnected, true);
    }
  });
}
```

- [ ] **Step 5: Write emulator-gated integration test**

Create `src/net/rooms.emu.test.ts`. Note the gate: without `EMULATOR=1` the whole file is skipped, so `npm test` stays green on machines without Java.

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createRoom, joinRoom, normalizeRoom } from './rooms';
import { get, ref } from 'firebase/database';

const emu = describe.runIf(process.env.EMULATOR === '1');

emu('rooms against emulator', () => {
  beforeAll(async () => {
    const { ensureSignedIn } = await import('./firebase');
    await ensureSignedIn();
  });

  it('createRoom writes meta + host player; joinRoom rejects bad codes', async () => {
    const code = await createRoom('Dav', 'tulip');
    expect(code).toHaveLength(6);
    const { db } = await import('./firebase');
    const snap = await get(ref(db, `rooms/${code}`));
    const room = normalizeRoom(snap.val())!;
    expect(room.meta.phase).toBe('lobby');
    expect(room.meta.targetScore).toBe(75);
    expect(Object.keys(room.players)).toHaveLength(1);

    const bad = await joinRoom('ZZZZZZ', 'Eve', 'star');
    expect(bad).toEqual({ ok: false, reason: 'not-found' });
    // same anonymous uid rejoining its own room is always ok
    const rejoin = await joinRoom(code, 'Dav', 'tulip');
    expect(rejoin).toEqual({ ok: true, code });
  });
});
```

Add script to `package.json`:

```json
"test:emu": "firebase emulators:exec --only database,auth --project demo-blitz \"cross-env EMULATOR=1 vitest run\""
```

- [ ] **Step 6: Run both test modes**

Run: `npm test` — Expected: emulator suite reported as skipped; everything else passes.
Run: `npm run test:emu` — Expected: emulator boots, all tests including `rooms against emulator` pass. (Requires Java; if unavailable on this machine, record that and rely on `npm test`.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: room create/join/watch with presence, codes, expiry"
```

---

### Task 9: Round flow networking — deal, plays, stuck cycle, round end, host transfer

The optimistic-play contract (used by the store in Task 10): UI removes the card locally first; `playToCenter` runs the RTDB transaction; on commit the caller persists the updated tableau, on abort the caller restores the pre-play tableau. Rollback animation is pure UI.

**Files:**
- Create: `src/net/plays.ts`
- Test: `src/net/plays.test.ts` (pure helpers), extend `src/net/rooms.emu.test.ts` patterns in a new gated file `src/net/plays.emu.test.ts`

**Interfaces:**
- Consumes: `firebase.ts`, `rooms.ts` (`normalizeRoom`), `game/*` (deal pipeline, `centerPlayTxn`, `scoreRound`, `winnerIds`, `flipWood`, `rotateWood`, `takeCard`)
- Produces:
  - Pure (exported for tests): `pickNextHost(players: Record<string, PlayerInfo>): string | null` — connected player with lowest `joinedAt` (uid tiebreak); `allConnectedStuck(players: Record<string, PlayerInfo>): boolean` — true when every connected player has `stuckAt != null` (false if none connected)
  - `startRound(code: string, room: Room, rng?: Rng): Promise<void>` — HOST ONLY: builds+shuffles a deck per player, deals with `postCountForPlayers`, writes in ONE `update()`: fresh `round` (tableaus, empty spaces, `stuckRounds: 0`, `blitzedBy: null`, `scores: null`, `startedAt: serverTimestamp()`), `meta/phase: 'playing'`, `meta/roundNumber: room.meta.roundNumber + 1`, and `players/*/stuckAt: null`
  - `playToCenter(code: string, spaceIndex: number, card: Card): Promise<boolean>` — `runTransaction(ref(rooms/{code}/round/spaces/{spaceIndex}), centerPlayTxn(card), { applyLocally: false })`; returns `committed`
  - `persistTableau(code: string, uid: string, t: Tableau): Promise<void>` — `set` on own tableau path
  - `clearStuck(code: string, uid: string): Promise<void>` / `declareStuck(code: string, uid: string): Promise<void>` (`stuckAt: serverTimestamp()`); `playToCenter` itself writes `round/stuckRounds: 0` on every committed play
  - `announceBlitz(code: string, uid: string): Promise<void>` — one `update()`: `round/blitzedBy = uid`, `meta/phase = 'roundEnd'`
  - `endRoundStalled(code: string): Promise<void>` — HOST ONLY: `meta/phase = 'roundEnd'` with `blitzedBy: null`
  - `commitScores(code: string, room: Room): Promise<void>` — HOST ONLY, idempotent: skips if `round.scores` already set; computes `scoreRound`, writes `round/scores` + each `players/{uid}/score` (+= delta) in one `update()`; if `winnerIds` non-empty afterwards also sets `meta/phase = 'gameOver'`
  - `nextRound(code: string, room: Room): Promise<void>` — HOST ONLY: delegates to `startRound`
  - `rematch(code: string, room: Room): Promise<void>` — HOST ONLY: one `update()`: every `players/{uid}/score = 0`, `meta/phase = 'lobby'`, `meta/roundNumber = 0`, `round = null`
  - `claimHost(code: string, uid: string): Promise<void>` — transaction on `meta/hostId`: only overwrites if current host is disconnected in latest snapshot passed by caller (guard is client-side; casual trust model)
  - `incrementStuckRounds(code: string): Promise<number>` — HOST ONLY transaction, returns new value

- [ ] **Step 1: Write failing pure-helper tests**

Create `src/net/plays.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickNextHost, allConnectedStuck } from './plays';
import type { PlayerInfo } from '../game/types';

const p = (joinedAt: number, connected: boolean, stuckAt: number | null = null): PlayerInfo =>
  ({ name: 'x', badgeId: 'tulip', joinedAt, connected, stuckAt, score: 0 });

describe('pickNextHost', () => {
  it('picks the connected player with the earliest join', () => {
    expect(pickNextHost({ a: p(200, true), b: p(100, true), c: p(50, false) })).toBe('b');
  });
  it('breaks joinedAt ties by uid, returns null when nobody is connected', () => {
    expect(pickNextHost({ b: p(100, true), a: p(100, true) })).toBe('a');
    expect(pickNextHost({ a: p(100, false) })).toBeNull();
  });
});

describe('allConnectedStuck', () => {
  it('true only when every connected player is stuck', () => {
    expect(allConnectedStuck({ a: p(1, true, 5), b: p(2, true, 9) })).toBe(true);
    expect(allConnectedStuck({ a: p(1, true, 5), b: p(2, true) })).toBe(false);
    expect(allConnectedStuck({ a: p(1, false, null), b: p(2, true, 3) })).toBe(true); // disconnected ignored
    expect(allConnectedStuck({ a: p(1, false) })).toBe(false); // nobody connected
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./plays`.

- [ ] **Step 3: Implement plays.ts**

```ts
import { ref, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import { db } from './firebase';
import type { Card, PlayerInfo, Room, Tableau } from '../game/types';
import { buildDeck, deal, shuffle, type Rng } from '../game/deck';
import { postCountForPlayers } from '../game/rules';
import { centerPlayTxn } from '../game/center';
import { scoreRound, winnerIds } from '../game/scoring';

const r = (code: string, path = '') => ref(db, `rooms/${code}${path ? '/' + path : ''}`);

export function pickNextHost(players: Record<string, PlayerInfo>): string | null {
  const connected = Object.entries(players).filter(([, p]) => p.connected);
  if (connected.length === 0) return null;
  connected.sort(([ua, a], [ub, b]) => a.joinedAt - b.joinedAt || (ua < ub ? -1 : 1));
  return connected[0][0];
}

export function allConnectedStuck(players: Record<string, PlayerInfo>): boolean {
  const connected = Object.values(players).filter(p => p.connected);
  return connected.length > 0 && connected.every(p => p.stuckAt != null);
}

export async function startRound(code: string, room: Room, rng?: Rng): Promise<void> {
  const uids = Object.keys(room.players);
  const postCount = postCountForPlayers(uids.length);
  const tableaus: Record<string, Tableau> = {};
  for (const uid of uids) tableaus[uid] = deal(shuffle(buildDeck(uid), rng), postCount);
  const patch: Record<string, unknown> = {
    round: { tableaus, stuckRounds: 0, blitzedBy: null, scores: null, startedAt: serverTimestamp() },
    'meta/phase': 'playing',
    'meta/roundNumber': room.meta.roundNumber + 1,
  };
  for (const uid of uids) patch[`players/${uid}/stuckAt`] = null;
  await update(r(code), patch);
}

export async function playToCenter(code: string, spaceIndex: number, card: Card): Promise<boolean> {
  const result = await runTransaction(
    r(code, `round/spaces/${spaceIndex}`), centerPlayTxn(card), { applyLocally: false },
  );
  if (result.committed) void set(r(code, 'round/stuckRounds'), 0);
  return result.committed;
}

export function persistTableau(code: string, uid: string, t: Tableau): Promise<void> {
  return set(r(code, `round/tableaus/${uid}`), t);
}

export function declareStuck(code: string, uid: string): Promise<void> {
  return set(r(code, `players/${uid}/stuckAt`), serverTimestamp());
}

export function clearStuck(code: string, uid: string): Promise<void> {
  return set(r(code, `players/${uid}/stuckAt`), null);
}

export function announceBlitz(code: string, uid: string): Promise<void> {
  return update(r(code), { 'round/blitzedBy': uid, 'meta/phase': 'roundEnd' });
}

export function endRoundStalled(code: string): Promise<void> {
  return update(r(code), { 'round/blitzedBy': null, 'meta/phase': 'roundEnd' });
}

export async function incrementStuckRounds(code: string): Promise<number> {
  const res = await runTransaction(r(code, 'round/stuckRounds'), (n: number | null) => (n ?? 0) + 1);
  return (res.snapshot.val() as number) ?? 0;
}

export async function commitScores(code: string, room: Room): Promise<void> {
  if (!room.round || room.round.scores) return; // idempotent
  const scores = scoreRound(room.round.spaces, room.round.tableaus);
  const patch: Record<string, unknown> = { 'round/scores': scores };
  const totals: Record<string, number> = {};
  for (const [uid, p] of Object.entries(room.players)) {
    totals[uid] = p.score + (scores[uid]?.delta ?? 0);
    patch[`players/${uid}/score`] = totals[uid];
  }
  if (winnerIds(totals, room.meta.targetScore).length > 0) patch['meta/phase'] = 'gameOver';
  await update(r(code), patch);
}

export function nextRound(code: string, room: Room): Promise<void> {
  return startRound(code, room);
}

export async function rematch(code: string, room: Room): Promise<void> {
  const patch: Record<string, unknown> = {
    'meta/phase': 'lobby', 'meta/roundNumber': 0, round: null,
  };
  for (const uid of Object.keys(room.players)) patch[`players/${uid}/score`] = 0;
  await update(r(code), patch);
}

export function claimHost(code: string, uid: string): Promise<unknown> {
  return runTransaction(r(code, 'meta/hostId'), (current: string | null) =>
    current === uid ? undefined : uid,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: pure helper tests pass; suite green.

- [ ] **Step 5: Write emulator-gated race test**

Create `src/net/plays.emu.test.ts` — proves the transaction referees a simultaneous play (the core multiplayer guarantee):

```ts
import { describe, it, expect } from 'vitest';
import { createRoom } from './rooms';
import { playToCenter, startRound } from './plays';
import { get, ref } from 'firebase/database';
import type { Card, Room } from '../game/types';

const emu = describe.runIf(process.env.EMULATOR === '1');

emu('center transactions against emulator', () => {
  it('exactly one of two same-card racers wins a space', async () => {
    const code = await createRoom('Host', 'tulip');
    const { db, ensureSignedIn } = await import('./firebase');
    const uid = await ensureSignedIn();
    const room: Room = {
      meta: { createdAt: Date.now(), hostId: uid, targetScore: 75, phase: 'lobby', roundNumber: 0 },
      players: { [uid]: { name: 'Host', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, score: 0 } },
      round: null,
    };
    await startRound(code, room);
    const one: Card = { v: 1, suit: 'red', owner: uid };
    const results = await Promise.all([
      playToCenter(code, 0, one),
      playToCenter(code, 0, one), // same card racing itself: second must abort
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const snap = await get(ref(db, `rooms/${code}/round/spaces/0/stack`));
    expect(snap.val()).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run both test modes**

Run: `npm test` — Expected: green, emulator files skipped.
Run: `npm run test:emu` — Expected: green including the race test (skip if no Java, as in Task 8).

- [ ] **Step 7: Commit**

```bash
git add src/net
git commit -m "feat: round dealing, transactional center plays, stuck cycle, scoring commit, host transfer"
```

---

### Task 10: Client store — snapshots, optimistic plays, host duties

Design: the store is created by a factory `createGameStore(deps)` so tests inject fake net functions (no vi.mock, no emulator). `src/state/store.ts` exports the factory plus the real singleton hook `useGameStore` wired to `src/net/*`. My tableau is client-authoritative during a round (only I write it); the RTDB copy is for opponents' rendering and crash recovery.

**Files:**
- Create: `src/state/store.ts`
- Test: `src/state/store.test.ts`

**Interfaces:**
- Consumes: everything from `src/game/*` and `src/net/*`
- Produces (consumed by all UI tasks):
  - `Deps` type mirroring the net functions it calls: `{ ensureSignedIn, watchRoom, joinRoom, createRoom, setTargetScore, startRound, playToCenter, persistTableau, declareStuck, clearStuck, announceBlitz, endRoundStalled, incrementStuckRounds, commitScores, nextRound, rematch, claimHost }`
  - `createGameStore(deps: Deps)` returning a zustand store of `GameStore`:
    - state: `uid: string | null; code: string | null; room: Room | null; tableau: Tableau | null; selection: PlaySource | null; lastRejected: { card: Card; at: number } | null; joinPhase: 'idle' | 'joining' | 'in-room'; joinError: string | null`
    - actions: `hostRoom(name, badgeId): Promise<string>`; `enterRoom(code, name, badgeId): Promise<JoinResult>` (rejoining players reuse their anonymous uid, so this also covers resume-after-disconnect); `leave(): void`; `select(source: PlaySource): void` (tap same source again = deselect); `playTo(target: { space: number } | { post: number }): Promise<void>` (uses `selection`; clears it); `flip(): void`; `markStuck(): void`; `setTarget(n: number): void`; `start(): void`; `next(): void`; `again(): void`
    - derived helpers (exported pure): `isHost(s): boolean`; `myPlayer(s): PlayerInfo | null`; `legalTargets(t: Tableau, source: PlaySource, spaces: CenterSpace[]): { spaces: number[]; posts: number[] }`
  - `useGameStore` — the wired singleton
- Snapshot side-effects (inside the `watchRoom` callback):
  1. adopt tableau on (re)join: if `phase === 'playing'`, my store `tableau` is null, and the snapshot has my tableau → `reconcileTableau(snapshotTableau, spaces)`, persist if it changed
  2. blitz: after MY successful center play empties my blitz → `announceBlitz` (done in `playTo`, not the watcher)
  3. all-stuck: if `allConnectedStuck(players)` and my `stuckAt != null` → `rotateWood` my tableau, `persistTableau`, `clearStuck`; host additionally `incrementStuckRounds`, and on value >= 3 → `endRoundStalled`
  4. host duties: if I am host and `phase === 'roundEnd'` and `round.scores == null` → `commitScores`
  5. host transfer: if host player exists and `connected === false`, start a 5s timer; if still disconnected and `pickNextHost(players) === uid` → `claimHost`; cancel timer when host reconnects

- [ ] **Step 1: Write failing store tests**

Create `src/state/store.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createGameStore, legalTargets, type Deps } from './store';
import { deal, buildDeck } from '../game/deck';
import type { Card, Suit, Room, Tableau } from '../game/types';

const c = (v: number, suit: Suit, owner = 'me'): Card => ({ v, suit, owner });

function fakeDeps(over: Partial<Deps> = {}): Deps {
  return {
    ensureSignedIn: vi.fn(async () => 'me'),
    watchRoom: vi.fn(() => () => {}),
    joinRoom: vi.fn(async code => ({ ok: true as const, code })),
    createRoom: vi.fn(async () => 'ABCDEF'),
    setTargetScore: vi.fn(async () => {}),
    startRound: vi.fn(async () => {}),
    playToCenter: vi.fn(async () => true),
    persistTableau: vi.fn(async () => {}),
    declareStuck: vi.fn(async () => {}),
    clearStuck: vi.fn(async () => {}),
    announceBlitz: vi.fn(async () => {}),
    endRoundStalled: vi.fn(async () => {}),
    incrementStuckRounds: vi.fn(async () => 1),
    commitScores: vi.fn(async () => {}),
    nextRound: vi.fn(async () => {}),
    rematch: vi.fn(async () => {}),
    claimHost: vi.fn(async () => {}),
    ...over,
  };
}

const seededTableau = (): Tableau => deal(buildDeck('me'), 3);

function playingRoom(tableau: Tableau): Room {
  return {
    meta: { createdAt: 1, hostId: 'me', targetScore: 75, phase: 'playing', roundNumber: 1 },
    players: { me: { name: 'D', badgeId: 'tulip', joinedAt: 1, connected: true, stuckAt: null, score: 0 } },
    round: { spaces: Array.from({ length: 16 }, () => ({ stack: [], history: [] })),
             tableaus: { me: tableau }, blitzedBy: null, scores: null, stuckRounds: 0, startedAt: 1 },
  };
}

describe('legalTargets', () => {
  it('lists center spaces and post stacks the source card fits', () => {
    const t: Tableau = { blitz: [c(1, 'red')], post: [[c(8, 'red')], [c(2, 'blue')], [c(7, 'green')]],
                         wood: [], woodIndex: 0 };
    const spaces = Array.from({ length: 16 }, () => ({ stack: [] as Card[], history: [] as Card[][] }));
    const fromBlitz = legalTargets(t, { kind: 'blitz' }, spaces);
    expect(fromBlitz.spaces).toHaveLength(16); // a 1 starts any empty space
    expect(fromBlitz.posts).toEqual([]);
    const fromPost2 = legalTargets(t, { kind: 'post', index: 2 }, spaces); // green 7 -> red 8
    expect(fromPost2.spaces).toEqual([]);
    expect(fromPost2.posts).toEqual([0]);
  });
});

describe('optimistic play', () => {
  it('removes the card locally, persists on committed transaction', async () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    const t = seededTableau();
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(t), tableau: t });

    store.getState().select({ kind: 'blitz' });
    const top = t.blitz[t.blitz.length - 1];
    // force the top card to be a red 1 so space 0 is legal
    const rigged: Tableau = { ...t, blitz: [...t.blitz.slice(0, -1), c(1, 'red')] };
    store.setState({ tableau: rigged });
    await store.getState().playTo({ space: 0 });

    expect(deps.playToCenter).toHaveBeenCalledWith('ABCDEF', 0, c(1, 'red'));
    expect(deps.persistTableau).toHaveBeenCalled();
    expect(store.getState().tableau!.blitz).toHaveLength(9);
    expect(store.getState().selection).toBeNull();
    expect(top).toBeDefined(); // silence unused warning
  });

  it('restores the tableau when the transaction loses the race', async () => {
    const deps = fakeDeps({ playToCenter: vi.fn(async () => false) });
    const store = createGameStore(deps);
    const t = seededTableau();
    const rigged: Tableau = { ...t, blitz: [...t.blitz.slice(0, -1), c(1, 'red')] };
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(rigged), tableau: rigged });

    store.getState().select({ kind: 'blitz' });
    await store.getState().playTo({ space: 0 });

    expect(store.getState().tableau).toEqual(rigged); // rolled back
    expect(store.getState().lastRejected?.card).toEqual(c(1, 'red'));
  });

  it('announces blitz when the last blitz card is played', async () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    const t = seededTableau();
    const oneLeft: Tableau = { ...t, blitz: [c(1, 'red')] };
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(oneLeft), tableau: oneLeft });

    store.getState().select({ kind: 'blitz' });
    await store.getState().playTo({ space: 0 });

    expect(deps.announceBlitz).toHaveBeenCalledWith('ABCDEF', 'me');
  });

  it('illegal target is a no-op (no net call, tableau unchanged)', async () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    const t = seededTableau();
    const rigged: Tableau = { ...t, blitz: [...t.blitz.slice(0, -1), c(5, 'red')] };
    store.setState({ uid: 'me', code: 'ABCDEF', room: playingRoom(rigged), tableau: rigged });
    store.getState().select({ kind: 'blitz' });
    await store.getState().playTo({ space: 0 }); // 5 on empty space: illegal
    expect(deps.playToCenter).not.toHaveBeenCalled();
    expect(store.getState().tableau).toEqual(rigged);
  });
});

describe('selection', () => {
  it('toggles off when the same source is selected twice', () => {
    const deps = fakeDeps();
    const store = createGameStore(deps);
    store.getState().select({ kind: 'blitz' });
    expect(store.getState().selection).toEqual({ kind: 'blitz' });
    store.getState().select({ kind: 'blitz' });
    expect(store.getState().selection).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Implement store.ts**

```ts
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { BadgeId } from '../game/badges';
import type { Card, CenterSpace, PlayerInfo, PlaySource, Room, Tableau } from '../game/types';
import { canBuildOnPost, canPlayToCenter, hasLegalMove, placeOnPost, sourceTop, takeCard } from '../game/rules';
import { flipWood, rotateWood } from '../game/wood';
import { reconcileTableau } from '../game/center';
import * as netRooms from '../net/rooms';
import * as netPlays from '../net/plays';
import { pickNextHost, allConnectedStuck } from '../net/plays';
import type { JoinResult } from '../net/rooms';

export interface Deps {
  ensureSignedIn(): Promise<string>;
  watchRoom(code: string, cb: (room: Room | null) => void): () => void;
  joinRoom(code: string, name: string, badgeId: BadgeId): Promise<JoinResult>;
  createRoom(name: string, badgeId: BadgeId): Promise<string>;
  setTargetScore(code: string, n: number): Promise<void>;
  startRound(code: string, room: Room): Promise<void>;
  playToCenter(code: string, space: number, card: Card): Promise<boolean>;
  persistTableau(code: string, uid: string, t: Tableau): Promise<void>;
  declareStuck(code: string, uid: string): Promise<void>;
  clearStuck(code: string, uid: string): Promise<void>;
  announceBlitz(code: string, uid: string): Promise<void>;
  endRoundStalled(code: string): Promise<void>;
  incrementStuckRounds(code: string): Promise<number>;
  commitScores(code: string, room: Room): Promise<void>;
  nextRound(code: string, room: Room): Promise<void>;
  rematch(code: string, room: Room): Promise<void>;
  claimHost(code: string, uid: string): Promise<unknown>;
}

export interface GameStore {
  uid: string | null;
  code: string | null;
  room: Room | null;
  tableau: Tableau | null;
  selection: PlaySource | null;
  lastRejected: { card: Card; at: number } | null;
  joinPhase: 'idle' | 'joining' | 'in-room';
  joinError: string | null;
  hostRoom(name: string, badgeId: BadgeId): Promise<string>;
  enterRoom(code: string, name: string, badgeId: BadgeId): Promise<JoinResult>;
  leave(): void;
  select(source: PlaySource): void;
  playTo(target: { space: number } | { post: number }): Promise<void>;
  flip(): void;
  markStuck(): void;
  setTarget(n: number): void;
  start(): void;
  next(): void;
  again(): void;
}

export function legalTargets(
  t: Tableau, source: PlaySource, spaces: CenterSpace[],
): { spaces: number[]; posts: number[] } {
  const card = sourceTop(t, source);
  if (!card) return { spaces: [], posts: [] };
  return {
    spaces: spaces.flatMap((s, i) => (canPlayToCenter(card, s.stack) ? [i] : [])),
    posts: t.post.flatMap((s, i) =>
      source.kind === 'post' && source.index === i ? [] : canBuildOnPost(card, s) ? [i] : []),
  };
}

export function isHost(s: { uid: string | null; room: Room | null }): boolean {
  return !!s.uid && s.room?.meta.hostId === s.uid;
}

export function myPlayer(s: { uid: string | null; room: Room | null }): PlayerInfo | null {
  return (s.uid && s.room?.players[s.uid]) || null;
}

export function createGameStore(deps: Deps): StoreApi<GameStore> {
  let unwatch: (() => void) | null = null;
  let hostTimer: ReturnType<typeof setTimeout> | null = null;

  const store = createStore<GameStore>((set, get) => {

    async function persist(t: Tableau) {
      const { code, uid } = get();
      if (code && uid) await deps.persistTableau(code, uid, t);
    }

    function onSnapshot(room: Room | null) {
      const s = get();
      set({ room });
      if (!room || !s.uid) return;
      const me = s.uid;
      const phase = room.meta.phase;

      // (1) adopt tableau on (re)join
      if (phase === 'playing' && !get().tableau && room.round?.tableaus[me]) {
        const adopted = reconcileTableau(room.round.tableaus[me], room.round.spaces);
        set({ tableau: adopted });
        void persist(adopted);
      }
      if (phase !== 'playing' && get().tableau) set({ tableau: null, selection: null });

      // (3) all-stuck rotation
      const meP = room.players[me];
      if (phase === 'playing' && meP?.stuckAt != null && allConnectedStuck(room.players)) {
        const t = get().tableau;
        if (t) {
          const rotated = rotateWood(t);
          set({ tableau: rotated });
          void persist(rotated);
        }
        void deps.clearStuck(get().code!, me);
        if (isHost({ uid: me, room })) {
          void deps.incrementStuckRounds(get().code!).then(n => {
            if (n >= 3) void deps.endRoundStalled(get().code!);
          });
        }
      }

      // (4) host commits scores once
      if (isHost({ uid: me, room }) && phase === 'roundEnd' && room.round && !room.round.scores) {
        void deps.commitScores(get().code!, room);
      }

      // (5) host transfer watchdog
      const hostP = room.players[room.meta.hostId];
      if (hostP && !hostP.connected && phase !== 'lobby') {
        hostTimer ??= setTimeout(() => {
          hostTimer = null;
          const cur = get().room;
          if (!cur) return;
          const curHost = cur.players[cur.meta.hostId];
          if (curHost && !curHost.connected && pickNextHost(cur.players) === me) {
            void deps.claimHost(get().code!, me);
          }
        }, 5000);
      } else if (hostTimer) {
        clearTimeout(hostTimer);
        hostTimer = null;
      }
    }

    function watch(code: string, uid: string) {
      unwatch?.();
      unwatch = deps.watchRoom(code, onSnapshot);
      set({ code, uid, joinPhase: 'in-room' });
    }

    return {
      uid: null, code: null, room: null, tableau: null, selection: null,
      lastRejected: null, joinPhase: 'idle', joinError: null,

      async hostRoom(name, badgeId) {
        set({ joinPhase: 'joining', joinError: null });
        const uid = await deps.ensureSignedIn();
        const code = await deps.createRoom(name, badgeId);
        watch(code, uid);
        return code;
      },

      async enterRoom(code, name, badgeId) {
        set({ joinPhase: 'joining', joinError: null });
        const uid = await deps.ensureSignedIn();
        const res = await deps.joinRoom(code, name, badgeId);
        if (res.ok) watch(code, uid);
        else set({ joinPhase: 'idle', joinError: res.reason });
        return res;
      },

      leave() {
        unwatch?.();
        unwatch = null;
        set({ code: null, room: null, tableau: null, selection: null, joinPhase: 'idle' });
      },

      select(source) {
        const cur = get().selection;
        set({ selection: JSON.stringify(cur) === JSON.stringify(source) ? null : source });
      },

      async playTo(target) {
        const { tableau, selection, code, uid, room } = get();
        if (!tableau || !selection || !code || !uid) return;
        set({ selection: null });

        if ('post' in target) {
          const next = placeOnPost(tableau, selection, target.post);
          if (!next) return;
          set({ tableau: next });
          void persist(next);
          void deps.clearStuck(code, uid);
          return;
        }

        const card = sourceTop(tableau, selection);
        const spaceState = room?.round?.spaces[target.space];
        if (!card || !spaceState || !canPlayToCenter(card, spaceState.stack)) return;
        const taken = takeCard(tableau, selection);
        if (!taken) return;
        set({ tableau: taken.next }); // optimistic
        const committed = await deps.playToCenter(code, target.space, card);
        if (!committed) {
          set({ tableau, lastRejected: { card, at: Date.now() } }); // rollback
          return;
        }
        void persist(taken.next);
        void deps.clearStuck(code, uid);
        if (taken.next.blitz.length === 0) void deps.announceBlitz(code, uid);
      },

      flip() {
        const t = get().tableau;
        if (!t) return;
        const next = flipWood(t);
        set({ tableau: next, selection: null });
        void persist(next);
      },

      markStuck() {
        const { code, uid, tableau, room } = get();
        if (!code || !uid || !tableau || !room?.round) return;
        if (hasLegalMove(tableau, room.round.spaces)) return; // button is a claim; verify it
        void deps.declareStuck(code, uid);
      },

      setTarget(n) { const c = get().code; if (c) void deps.setTargetScore(c, n); },
      start() { const { code, room } = get(); if (code && room) void deps.startRound(code, room); },
      next() { const { code, room } = get(); if (code && room) void deps.nextRound(code, room); },
      again() { const { code, room } = get(); if (code && room) void deps.rematch(code, room); },
    };
  });

  return store;
}

const realDeps: Deps = {
  ensureSignedIn: () => import('../net/firebase').then(m => m.ensureSignedIn()),
  watchRoom: netRooms.watchRoom,
  joinRoom: netRooms.joinRoom,
  createRoom: netRooms.createRoom,
  setTargetScore: netRooms.setTargetScore,
  startRound: netPlays.startRound,
  playToCenter: netPlays.playToCenter,
  persistTableau: netPlays.persistTableau,
  declareStuck: netPlays.declareStuck,
  clearStuck: netPlays.clearStuck,
  announceBlitz: netPlays.announceBlitz,
  endRoundStalled: netPlays.endRoundStalled,
  incrementStuckRounds: netPlays.incrementStuckRounds,
  commitScores: netPlays.commitScores,
  nextRound: netPlays.nextRound,
  rematch: netPlays.rematch,
  claimHost: netPlays.claimHost,
};

export const gameStore = createGameStore(realDeps);
export function useGameStore<T>(selector: (s: GameStore) => T): T {
  return useStore(gameStore, selector);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass (store suite 6 tests). If `zustand/vanilla` import fails, check zustand v4+ is installed (`npm ls zustand`).

- [ ] **Step 5: Commit**

```bash
git add src/state
git commit -m "feat: game store with optimistic plays, rollback, host duties, stuck cycle"
```

---

### Task 11: UI — Home, Join, Lobby, invite sharing

UI tasks verify manually against the emulator (checklists below); game-logic behavior is already covered by unit tests. Keep all screen files under ~150 lines.

**Files:**
- Create: `src/ui/screens/Home.tsx`, `src/ui/screens/Join.tsx`, `src/ui/screens/Lobby.tsx`, `src/ui/screens/RoomScreen.tsx`, `src/ui/components/BadgePicker.tsx`, `src/ui/components/ShareInvite.tsx`, `src/ui/ui.css`
- Modify: `src/App.tsx` (route to screens), `src/net/rooms.ts` (add `peekRoom`)

**Interfaces:**
- Consumes: `useGameStore`, `gameStore`, `BADGES`/`BADGE_IDS`, `Route`/`useRoute`, `peekRoom`
- Produces:
  - `peekRoom(code: string): Promise<Room | null>` in `rooms.ts` — one `get` + `normalizeRoom` (lets Join grey out taken badges before joining)
  - `<BadgePicker value onChange taken>` with `taken: BadgeId[]`
  - `<ShareInvite code>` — native share sheet or clipboard fallback
  - `<RoomScreen code>` — phase switch: no membership -> `<Join>`, `lobby` -> `<Lobby>`, else `<Game>` placeholder (`<p>game soon</p>` until Task 12)
  - localStorage keys: `bz.name`, `bz.badge` (prefill across screens)

- [ ] **Step 1: Add peekRoom to rooms.ts**

```ts
export async function peekRoom(code: string): Promise<Room | null> {
  await ensureSignedIn();
  const snap = await get(roomRef(code));
  return normalizeRoom(snap.val());
}
```

- [ ] **Step 2: Create BadgePicker + ShareInvite + ui.css**

`src/ui/components/BadgePicker.tsx`:

```tsx
import { BADGES, BADGE_IDS, type BadgeId } from '../../game/badges';

export function BadgePicker(props: {
  value: BadgeId | null; onChange: (b: BadgeId) => void; taken: BadgeId[];
}) {
  return (
    <div className="badge-grid" role="radiogroup" aria-label="Pick your badge">
      {BADGE_IDS.map(id => {
        const b = BADGES[id];
        const taken = props.taken.includes(id);
        return (
          <button key={id} role="radio" aria-checked={props.value === id} disabled={taken}
            className={`badge-chip${props.value === id ? ' selected' : ''}`}
            style={{ ['--badge' as string]: b.color }}
            onClick={() => props.onChange(id)}>
            <span className="badge-glyph">{b.glyph}</span>
            <span>{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

`src/ui/components/ShareInvite.tsx`:

```tsx
import { useState } from 'react';

export function inviteUrl(code: string): string {
  return `${location.origin}${location.pathname}#/room/${code}`;
}

export function ShareInvite({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(code);
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: 'German Spree', text: `Join my game! ${url}` }); } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }
  return (
    <button className="btn btn-primary" onClick={share}>
      {copied ? 'Link copied!' : 'Invite friends'}
    </button>
  );
}
```

`src/ui/ui.css` (import from `App.tsx` after theme.css):

```css
.badge-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.badge-chip { display: flex; flex-direction: column; align-items: center; gap: 2px;
  min-height: 56px; padding: 6px 2px; border-radius: var(--radius); font-size: 11px;
  border: 2px solid var(--line); background: var(--surface); color: var(--ink); }
.badge-chip.selected { border-color: var(--badge); box-shadow: 0 0 0 2px var(--badge) inset; }
.badge-chip:disabled { opacity: .3; }
.badge-glyph { font-size: 20px; }
.stack { display: flex; flex-direction: column; gap: 12px; max-width: 420px; width: 100%; margin: 0 auto; }
.row { display: flex; gap: 8px; align-items: center; }
.spacer { flex: 1; }
.title { font-weight: 800; font-size: 28px; margin: 0; }
.muted { color: var(--ink-soft); }
.error { color: var(--danger); }
.player-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
.dot.off { background: var(--line); }
.chip { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center;
  background: color-mix(in srgb, var(--badge) 18%, transparent); }
.code-pill { font-family: ui-monospace, monospace; letter-spacing: .2em; font-weight: 800;
  background: var(--surface); border: 1px dashed var(--line); border-radius: var(--radius);
  padding: 8px 14px; }
```

- [ ] **Step 3: Create Home, Join, Lobby, RoomScreen**

`src/ui/screens/Home.tsx`:

```tsx
import { useState } from 'react';
import { useGameStore } from '../../state/store';
import { BadgePicker } from '../components/BadgePicker';
import type { BadgeId } from '../../game/badges';

export function Home() {
  const hostRoom = useGameStore(s => s.hostRoom);
  const joinPhase = useGameStore(s => s.joinPhase);
  const [name, setName] = useState(localStorage.getItem('bz.name') ?? '');
  const [badge, setBadge] = useState<BadgeId | null>(localStorage.getItem('bz.badge') as BadgeId | null);
  const [code, setCode] = useState('');
  const ready = name.trim().length > 0 && badge != null;

  function remember() {
    localStorage.setItem('bz.name', name.trim());
    if (badge) localStorage.setItem('bz.badge', badge);
  }
  async function create() {
    remember();
    const c = await hostRoom(name.trim(), badge!);
    location.hash = `#/room/${c}`;
  }
  function goJoin() {
    remember();
    location.hash = `#/room/${code.trim().toUpperCase()}`;
  }

  return (
    <div className="screen stack">
      <h1 className="title">German Spree</h1>
      <p className="muted">Fast-paced multiplayer card racing. Create a room, text the link, play.</p>
      <input className="field" placeholder="Your name" maxLength={14}
        value={name} onChange={e => setName(e.target.value)} />
      <BadgePicker value={badge} onChange={setBadge} taken={[]} />
      <button className="btn btn-primary" disabled={!ready || joinPhase === 'joining'} onClick={create}>
        Create room
      </button>
      <div className="row">
        <input className="field" placeholder="Room code" maxLength={6}
          value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
        <button className="btn" disabled={code.trim().length !== 6} onClick={goJoin}>Join</button>
      </div>
    </div>
  );
}
```

`src/ui/screens/Join.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useGameStore } from '../../state/store';
import { peekRoom } from '../../net/rooms';
import { ensureSignedIn } from '../../net/firebase';
import { BadgePicker } from '../components/BadgePicker';
import type { BadgeId } from '../../game/badges';

const REASONS: Record<string, string> = {
  'not-found': 'No room with that code.', expired: 'This room has expired.',
  full: 'Room is full (8 players).', 'badge-taken': 'That badge is taken - pick another.',
  started: 'This game already started without you.',
};

export function Join({ code }: { code: string }) {
  const enterRoom = useGameStore(s => s.enterRoom);
  const joinPhase = useGameStore(s => s.joinPhase);
  const joinError = useGameStore(s => s.joinError);
  const [name, setName] = useState(localStorage.getItem('bz.name') ?? '');
  const [badge, setBadge] = useState<BadgeId | null>(localStorage.getItem('bz.badge') as BadgeId | null);
  const [taken, setTaken] = useState<BadgeId[]>([]);

  useEffect(() => {
    // exclude my own badge so a reload mid-game can rejoin (rejoin ignores name/badge anyway)
    void Promise.all([peekRoom(code), ensureSignedIn()]).then(([room, uid]) => {
      if (room) {
        setTaken(Object.entries(room.players).filter(([id]) => id !== uid).map(([, p]) => p.badgeId));
      }
    });
  }, [code]);

  const effBadge = badge && !taken.includes(badge) ? badge : null;
  const ready = name.trim().length > 0 && effBadge != null;

  async function join() {
    localStorage.setItem('bz.name', name.trim());
    localStorage.setItem('bz.badge', effBadge!);
    await enterRoom(code, name.trim(), effBadge!);
  }

  return (
    <div className="screen stack">
      <h1 className="title">Join room</h1>
      <div className="code-pill">{code}</div>
      <input className="field" placeholder="Your name" maxLength={14}
        value={name} onChange={e => setName(e.target.value)} />
      <BadgePicker value={effBadge} onChange={setBadge} taken={taken} />
      {joinError && <p className="error">{REASONS[joinError] ?? joinError}</p>}
      <button className="btn btn-primary" disabled={!ready || joinPhase === 'joining'} onClick={join}>
        {joinPhase === 'joining' ? 'Joining…' : 'Join game'}
      </button>
    </div>
  );
}
```

`src/ui/screens/Lobby.tsx`:

```tsx
import { useGameStore, isHost } from '../../state/store';
import { BADGES } from '../../game/badges';
import { ShareInvite } from '../components/ShareInvite';

export function Lobby({ code }: { code: string }) {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const host = isHost({ uid, room });
  const setTarget = useGameStore(s => s.setTarget);
  const start = useGameStore(s => s.start);
  const players = Object.entries(room.players).sort(([, a], [, b]) => a.joinedAt - b.joinedAt);

  return (
    <div className="screen stack">
      <h1 className="title">Lobby</h1>
      <div className="row"><span className="code-pill">{code}</span><ShareInvite code={code} /></div>
      {players.map(([id, p]) => (
        <div className="player-row" key={id}>
          <span className="chip" style={{ ['--badge' as string]: BADGES[p.badgeId].color }}>
            {BADGES[p.badgeId].glyph}
          </span>
          <span>{p.name}{id === room.meta.hostId ? ' (host)' : ''}</span>
          <span className="spacer" />
          <span className={`dot${p.connected ? '' : ' off'}`} />
        </div>
      ))}
      <div className="row">
        <label className="muted" htmlFor="target">Play to</label>
        <select id="target" className="field" disabled={!host} value={room.meta.targetScore}
          onChange={e => setTarget(Number(e.target.value))}>
          {[25, 50, 75, 100].map(n => <option key={n} value={n}>{n} points</option>)}
        </select>
      </div>
      {host
        ? <button className="btn btn-primary" disabled={players.length < 2} onClick={start}>
            {players.length < 2 ? 'Waiting for players…' : 'Start game'}
          </button>
        : <p className="muted">Waiting for the host to start…</p>}
    </div>
  );
}
```

`src/ui/screens/RoomScreen.tsx`:

```tsx
import { useGameStore } from '../../state/store';
import { Join } from './Join';
import { Lobby } from './Lobby';

export function RoomScreen({ code }: { code: string }) {
  const joinPhase = useGameStore(s => s.joinPhase);
  const room = useGameStore(s => s.room);
  if (joinPhase !== 'in-room' || !room) return <Join code={code} />;
  if (room.meta.phase === 'lobby') return <Lobby code={code} />;
  return <div className="screen"><p>game soon</p></div>; // replaced in Task 12
}
```

- [ ] **Step 4: Wire routes in App.tsx**

Replace the `App` component body (keep `parseHash`/`useRoute` exports):

```tsx
import { Home } from './ui/screens/Home';
import { RoomScreen } from './ui/screens/RoomScreen';
import './theme.css';
import './ui/ui.css';

export default function App() {
  const route = useRoute();
  return route.screen === 'room' ? <RoomScreen code={route.code} /> : <Home />;
}
```

- [ ] **Step 5: Verify tests + manual lobby checklist**

Run: `npm test` — Expected: green (no regressions).
Run: `npm run emu` (terminal 1), `npm run dev` (terminal 2), then in the browser:

1. Tab A: enter name, pick Tulip, Create room → lands on `#/room/XXXXXX`, Lobby shows you as host with green dot.
2. Tab B (incognito so it gets a fresh anonymous uid): open the same URL → Join screen shows Tulip greyed out → pick Star, join → both tabs list 2 players live.
3. Tab A: change target to 50 → Tab B sees "50 points". Tab B's selector is disabled.
4. Tab A: "Invite friends" on desktop copies the URL ("Link copied!").
5. Close Tab B → Tab A shows B's dot hollow within ~seconds (presence works).
6. Start button: enabled in Tab A only with 2+ players; clicking flips both tabs to the "game soon" placeholder (phase `playing`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: home/join/lobby screens with badge picker and invite sharing"
```

---

### Task 12: UI — Game screen with drag and tap play

Portrait layout: opponents strip / 4x4 center grid / my tableau in the bottom thumb zone. Both input paths ship here: tap-select + tap-target, and pointer drag with drop hit-testing. Legal targets highlight for whichever is active.

**Files:**
- Create: `src/ui/screens/Game.tsx`, `src/ui/components/CardView.tsx`, `src/ui/components/CenterGrid.tsx`, `src/ui/components/TableauView.tsx`, `src/ui/components/OpponentStrip.tsx`, `src/ui/components/ConnectionPill.tsx`, `src/ui/useDrag.ts`, `src/ui/game.css`
- Modify: `src/ui/screens/RoomScreen.tsx` (render `<Game>`), `src/net/firebase.ts` (add `watchConnected`)

**Interfaces:**
- Consumes: store (`useGameStore`, `legalTargets`, `isHost`), `BADGES`, game types, `cardId`
- Produces:
  - `watchConnected(cb: (ok: boolean) => void): () => void` in `firebase.ts` (listens to `.info/connected`)
  - `<CardView card size? selected? dimmed?>` — `size: 'md' | 'sm'` (default `md`)
  - `useDrag(onDrop)` hook returning `{ drag, startDrag }`; drop targets are any element with `data-drop="space:N"` or `data-drop="post:N"`
  - CSS classes reused by Task 14: `.card .card-back .pile-space .glow .game-grid .tableau-zone`

- [ ] **Step 1: Add watchConnected to firebase.ts**

```ts
import { onValue, ref } from 'firebase/database';

export function watchConnected(cb: (ok: boolean) => void): () => void {
  return onValue(ref(db, '.info/connected'), snap => cb(snap.val() === true));
}
```

- [ ] **Step 2: CardView + game.css**

`src/ui/components/CardView.tsx` — face shows the value in the suit color, the face-group glyph (boy = filled diamond, girl = open circle — colorblind-safe redundancy for the alternation rule), and the owner badge chip:

```tsx
import { BADGES, type BadgeId } from '../../game/badges';
import { faceGroup } from '../../game/rules';
import type { Card } from '../../game/types';

export function CardView(props: {
  card: Card; badgeId: BadgeId; size?: 'md' | 'sm'; selected?: boolean; dimmed?: boolean;
}) {
  const { card, badgeId } = props;
  const b = BADGES[badgeId];
  return (
    <div
      className={`card ${props.size ?? 'md'}${props.selected ? ' selected' : ''}${props.dimmed ? ' dimmed' : ''}`}
      style={{ ['--suit' as string]: `var(--suit-${card.suit})`, ['--badge' as string]: b.color }}
    >
      <span className="card-v">{card.v}</span>
      <span className="card-group">{faceGroup(card.suit) === 'boy' ? '◆' : '○'}</span>
      <span className="card-badge">{b.glyph}</span>
    </div>
  );
}

export function CardBack({ badgeId, size }: { badgeId: BadgeId; size?: 'md' | 'sm' }) {
  const b = BADGES[badgeId];
  return (
    <div className={`card card-back ${size ?? 'md'}`} style={{ ['--badge' as string]: b.color }}>
      <span className="card-badge-big">{b.glyph}</span>
    </div>
  );
}
```

`src/ui/game.css`:

```css
.game { display: grid; grid-template-rows: auto auto 1fr auto; height: 100dvh; gap: 8px;
  padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right))
           max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; overflow: hidden; }
.game-head { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.game-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px;
  align-content: center; justify-items: center; min-height: 0; }
.pile-space { width: var(--card-w); height: var(--card-h); border-radius: var(--radius);
  border: 1.5px dashed var(--line); display: grid; place-items: center; position: relative; }
.pile-space .card { position: absolute; inset: 0; }
.card { width: var(--card-w); height: var(--card-h); border-radius: var(--radius);
  background: var(--surface); box-shadow: var(--shadow); border: 1px solid var(--line);
  display: grid; place-items: center; position: relative; touch-action: none; }
.card.sm { --card-w: clamp(30px, 8vw, 48px); }
.card-v { font-size: calc(var(--card-w) * .52); font-weight: 800; color: var(--suit); }
.card-group { position: absolute; top: 4px; left: 6px; font-size: calc(var(--card-w) * .2);
  color: var(--suit); }
.card-badge { position: absolute; bottom: 3px; right: 5px; font-size: calc(var(--card-w) * .24); }
.card-back { background: color-mix(in srgb, var(--badge) 22%, var(--surface));
  border-color: color-mix(in srgb, var(--badge) 45%, var(--line)); }
.card-badge-big { font-size: calc(var(--card-w) * .5); opacity: .9; }
.card.selected { outline: 3px solid var(--accent); outline-offset: 1px; }
.card.dimmed { opacity: .55; }
.glow { border-color: #22c55e; border-style: solid; box-shadow: 0 0 0 3px rgb(34 197 94 / .35); }
.tableau-zone { display: flex; gap: 10px; align-items: flex-end; justify-content: center;
  padding-bottom: 4px; }
.pile-label { font-size: 10px; text-align: center; color: var(--ink-soft); margin-top: 3px; }
.count-bubble { position: absolute; top: -6px; right: -6px; background: var(--accent);
  color: var(--bg); font-size: 11px; font-weight: 800; border-radius: 999px;
  min-width: 20px; height: 20px; display: grid; place-items: center; padding: 0 4px; }
.opp-strip { display: flex; gap: 6px; overflow-x: auto; }
.opp { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: var(--radius);
  background: var(--surface); border: 1px solid var(--line); font-size: 12px; white-space: nowrap; }
.opp.away { opacity: .5; }
.opp-blitz { font-weight: 800; color: var(--badge); }
.drag-ghost { position: fixed; z-index: 50; pointer-events: none; will-change: transform; }
.stuck-btn { min-height: 44px; }
.conn-pill { margin-left: auto; font-size: 11px; padding: 3px 10px; border-radius: 999px;
  background: var(--danger); color: #fff; }
```

- [ ] **Step 3: useDrag hook**

`src/ui/useDrag.ts`:

```ts
import { useRef, useState } from 'react';
import type React from 'react'; // React.PointerEvent type only (new-JSX files do not auto-import React)
import type { Card, PlaySource } from '../game/types';

export type DropTarget = { space: number } | { post: number };

export interface DragState { card: Card; source: PlaySource; x: number; y: number }

export function parseDrop(el: Element | null): DropTarget | null {
  const host = el?.closest('[data-drop]');
  const v = host?.getAttribute('data-drop');
  if (!v) return null;
  const [kind, n] = v.split(':');
  if (kind === 'space') return { space: Number(n) };
  if (kind === 'post') return { post: Number(n) };
  return null;
}

export function useDrag(onDrop: (source: PlaySource, target: DropTarget) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const active = useRef<{ pointerId: number } | null>(null);

  function startDrag(e: React.PointerEvent, card: Card, source: PlaySource) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    active.current = { pointerId: e.pointerId };
    setDrag({ card, source, x: e.clientX, y: e.clientY });

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== active.current?.pointerId) return;
      setDrag(d => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d));
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== active.current?.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      active.current = null;
      setDrag(null);
      if (ev.type === 'pointerup') {
        const target = parseDrop(document.elementFromPoint(ev.clientX, ev.clientY));
        if (target) onDrop(source, target);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  return { drag, startDrag };
}
```

- [ ] **Step 4: CenterGrid, TableauView, OpponentStrip, ConnectionPill**

`src/ui/components/CenterGrid.tsx`:

```tsx
import { CardView } from './CardView';
import type { CenterSpace } from '../../game/types';
import type { BadgeId } from '../../game/badges';

export function CenterGrid(props: {
  spaces: CenterSpace[]; highlight: number[]; badgeOf: (owner: string) => BadgeId;
  onTap: (i: number) => void;
}) {
  return (
    <div className="game-grid">
      {props.spaces.map((s, i) => {
        const top = s.stack[s.stack.length - 1];
        return (
          <div key={i} data-drop={`space:${i}`} onClick={() => props.onTap(i)}
            className={`pile-space${props.highlight.includes(i) ? ' glow' : ''}`}>
            {top && <CardView card={top} badgeId={props.badgeOf(top.owner)} />}
          </div>
        );
      })}
    </div>
  );
}
```

`src/ui/components/TableauView.tsx` — my three piles; drag or tap on the playable tops:

```tsx
import type React from 'react';
import { CardBack, CardView } from './CardView';
import type { BadgeId } from '../../game/badges';
import type { Card, PlaySource, Tableau } from '../../game/types';

export function TableauView(props: {
  t: Tableau; badgeId: BadgeId; selection: PlaySource | null; postHighlight: number[];
  onSelect: (s: PlaySource) => void; onFlip: () => void; onTapPost: (i: number) => void;
  startDrag: (e: React.PointerEvent, card: Card, source: PlaySource) => void;
}) {
  const { t, badgeId } = props;
  const woodTop = t.woodIndex > 0 ? t.wood[t.woodIndex - 1] : null;
  const blitzTop = t.blitz[t.blitz.length - 1] ?? null;
  const sel = JSON.stringify(props.selection);
  const isSel = (s: PlaySource) => sel === JSON.stringify(s);

  return (
    <div className="tableau-zone">
      <div>
        <div style={{ position: 'relative' }} onClick={props.onFlip}>
          {t.wood.length > t.woodIndex ? <CardBack badgeId={badgeId} /> : <div className="pile-space" />}
          {woodTop && (
            <div style={{ position: 'absolute', inset: 0 }}
              onClick={e => { e.stopPropagation(); props.onSelect({ kind: 'wood' }); }}
              onPointerDown={e => props.startDrag(e, woodTop, { kind: 'wood' })}>
              <CardView card={woodTop} badgeId={badgeId} selected={isSel({ kind: 'wood' })} />
            </div>
          )}
        </div>
        <div className="pile-label">wood {t.wood.length}</div>
      </div>

      {t.post.map((stack, i) => {
        const top = stack[stack.length - 1] ?? null;
        const source: PlaySource = { kind: 'post', index: i };
        return (
          <div key={i}>
            <div data-drop={`post:${i}`} onClick={() => props.onTapPost(i)}
              className={`pile-space${props.postHighlight.includes(i) ? ' glow' : ''}`}>
              {top && (
                <div onClick={e => { e.stopPropagation(); props.onSelect(source); }}
                  onPointerDown={e => props.startDrag(e, top, source)}>
                  <CardView card={top} badgeId={badgeId} selected={isSel(source)} />
                </div>
              )}
            </div>
            <div className="pile-label">{stack.length > 1 ? `+${stack.length - 1}` : ' '}</div>
          </div>
        );
      })}

      <div>
        <div style={{ position: 'relative' }}>
          {blitzTop ? (
            <div onClick={() => props.onSelect({ kind: 'blitz' })}
              onPointerDown={e => props.startDrag(e, blitzTop, { kind: 'blitz' })}>
              <CardView card={blitzTop} badgeId={badgeId} selected={isSel({ kind: 'blitz' })} />
              <span className="count-bubble">{t.blitz.length}</span>
            </div>
          ) : <div className="pile-space" />}
        </div>
        <div className="pile-label">blitz</div>
      </div>
    </div>
  );
}
```

`src/ui/components/OpponentStrip.tsx`:

```tsx
import { BADGES } from '../../game/badges';
import type { PlayerInfo, Tableau } from '../../game/types';

export function OpponentStrip(props: {
  me: string; players: Record<string, PlayerInfo>; tableaus: Record<string, Tableau>;
}) {
  const rows = Object.entries(props.players)
    .filter(([uid]) => uid !== props.me)
    .sort(([, a], [, b]) => a.joinedAt - b.joinedAt);
  return (
    <div className="opp-strip">
      {rows.map(([uid, p]) => {
        const b = BADGES[p.badgeId];
        const t = props.tableaus[uid];
        return (
          <div key={uid} className={`opp${p.connected ? '' : ' away'}`}
            style={{ ['--badge' as string]: b.color }}>
            <span>{b.glyph}</span>
            <span>{p.name}</span>
            <span className="opp-blitz">{t ? t.blitz.length : '-'}</span>
            {p.stuckAt != null && <span title="stuck">⏳</span>}
          </div>
        );
      })}
    </div>
  );
}
```

`src/ui/components/ConnectionPill.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { watchConnected } from '../../net/firebase';

export function ConnectionPill() {
  const [ok, setOk] = useState(true);
  useEffect(() => watchConnected(setOk), []);
  return ok ? null : <span className="conn-pill">reconnecting…</span>;
}
```

- [ ] **Step 5: Game screen assembly**

`src/ui/screens/Game.tsx`:

```tsx
import { useGameStore, legalTargets, gameStore } from '../../state/store';
import { hasLegalMove } from '../../game/rules';
import type { BadgeId } from '../../game/badges';
import { CardView } from '../components/CardView';
import { CenterGrid } from '../components/CenterGrid';
import { TableauView } from '../components/TableauView';
import { OpponentStrip } from '../components/OpponentStrip';
import { ConnectionPill } from '../components/ConnectionPill';
import { useDrag, type DropTarget } from '../useDrag';
import type { PlaySource } from '../../game/types';
import '../game.css';

export function Game() {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid)!;
  const tableau = useGameStore(s => s.tableau);
  const selection = useGameStore(s => s.selection);
  const select = useGameStore(s => s.select);
  const playTo = useGameStore(s => s.playTo);
  const flip = useGameStore(s => s.flip);
  const markStuck = useGameStore(s => s.markStuck);

  const round = room.round;
  const me = room.players[uid];
  const badgeOf = (owner: string): BadgeId => room.players[owner]?.badgeId ?? me.badgeId;

  const { drag, startDrag } = useDrag((source: PlaySource, target: DropTarget) => {
    gameStore.setState({ selection: source }); // direct set - select() would TOGGLE an already-selected source off
    void playTo(target);                       // playTo consumes the selection
  });

  if (!round || !tableau) return <div className="screen"><p className="muted">dealing…</p></div>;

  const active = drag ? drag.source : selection;
  const targets = active ? legalTargets(tableau, active, round.spaces) : { spaces: [], posts: [] };
  const stuckAvailable = !hasLegalMove(tableau, round.spaces);

  return (
    <div className="game">
      <div className="game-head">
        <strong>Round {room.meta.roundNumber}</strong>
        <span className="muted">{me.name} · {me.score} pts · to {room.meta.targetScore}</span>
        <ConnectionPill />
      </div>
      <OpponentStrip me={uid} players={room.players} tableaus={round.tableaus} />
      <CenterGrid spaces={round.spaces} highlight={targets.spaces} badgeOf={badgeOf}
        onTap={i => void playTo({ space: i })} />
      <div>
        <TableauView t={tableau} badgeId={me.badgeId} selection={selection}
          postHighlight={targets.posts} onSelect={select} onFlip={flip}
          onTapPost={i => void playTo({ post: i })} startDrag={startDrag} />
        <button className="btn stuck-btn" disabled={!stuckAvailable || me.stuckAt != null}
          onClick={markStuck} style={{ width: '100%', marginTop: 6 }}>
          {me.stuckAt != null ? 'Waiting for others…' : "I'm stuck"}
        </button>
      </div>
      {drag && (
        <div className="drag-ghost"
          style={{ transform: `translate(${drag.x - 28}px, ${drag.y - 40}px)` }}>
          <CardView card={drag.card} badgeId={me.badgeId} />
        </div>
      )}
    </div>
  );
}
```

Update `src/ui/screens/RoomScreen.tsx` — replace the placeholder return:

```tsx
import { Game } from './Game';
// ...
  if (room.meta.phase === 'lobby') return <Lobby code={code} />;
  return <Game />;
```

- [ ] **Step 6: Verify tests + manual game checklist**

Run: `npm test` — Expected: green.
With emulator + dev server, two tabs (host + incognito join), start the game:

1. Both tabs show 16 dashed spaces, own tableau at bottom with **5 post slots** (2-player rule), opponent chip on top with blitz count 10.
2. Tap your blitz top: it outlines; legal spaces glow green (only spaces if it is a 1; try until a 1 is on top or flip wood). Tap a glowing space: card lands; the OTHER tab sees it appear.
3. Drag the wood top over a glowing space and release: it plays. Drag to a non-target: it snaps back (ghost disappears, tableau unchanged).
4. Post build: when legal, target post glows; tap/drop moves the card and the post shows a `+1` stack count.
5. Wood pile: tap the back to flip 3 (top changes); play the top; the card underneath becomes playable.
6. Both players race for the same space (have both 1s ready, tap fast): exactly one wins, the loser's card returns.
7. "I'm stuck" only enables when nothing is playable; when BOTH press it, both wood piles rotate and buttons reset.
8. Blitz count bubbles decrement in the opponent strip as cards leave blitz piles.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: game screen - center grid, tableau, opponents, drag and tap play"
```

---

### Task 13: UI — Blitz splash, round-end scores, game over, rematch

**Files:**
- Create: `src/ui/components/BlitzSplash.tsx`, `src/ui/components/RoundEndOverlay.tsx`, `src/ui/components/GameOverOverlay.tsx`
- Modify: `src/ui/screens/RoomScreen.tsx`, `src/ui/ui.css` (overlay styles)

**Interfaces:**
- Consumes: store, `BADGES`, `winnerIds`, framer-motion (`motion`, `AnimatePresence`)
- Produces: `<RoundEndOverlay>` (shown when `phase === 'roundEnd'` and `round.scores` set), `<GameOverOverlay>` (`phase === 'gameOver'`), `<BlitzSplash name>` (1.6s interstitial while `roundEnd` but scores not yet committed, or first 1.6s after commit)

- [ ] **Step 1: Overlay styles (append to ui.css)**

```css
.overlay { position: fixed; inset: 0; background: rgb(0 0 0 / .45); display: grid;
  place-items: center; z-index: 100; padding: 16px; }
.sheet { background: var(--bg); border-radius: 16px; padding: 20px; width: min(440px, 100%);
  max-height: 85dvh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.score-row { display: grid; grid-template-columns: 28px 1fr auto auto auto; gap: 8px;
  align-items: center; padding: 8px 10px; border-radius: var(--radius);
  background: var(--surface); border: 1px solid var(--line); font-size: 14px; }
.score-neg { color: var(--danger); }
.score-total { font-weight: 800; }
.blitz-splash { position: fixed; inset: 0; display: grid; place-items: center; z-index: 110;
  pointer-events: none; }
.blitz-word { font-size: clamp(48px, 18vw, 120px); font-weight: 800; letter-spacing: .02em;
  color: var(--accent); text-shadow: 0 4px 24px rgb(0 0 0 / .25); }
```

- [ ] **Step 2: BlitzSplash**

`src/ui/components/BlitzSplash.tsx`:

```tsx
import { motion } from 'framer-motion';

export function BlitzSplash({ name }: { name: string }) {
  return (
    <div className="blitz-splash">
      <motion.div initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
        <div className="blitz-word">BLITZ!</div>
        <p style={{ textAlign: 'center', fontWeight: 600 }}>{name}</p>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 3: RoundEndOverlay + GameOverOverlay**

`src/ui/components/RoundEndOverlay.tsx`:

```tsx
import { useGameStore, isHost } from '../../state/store';
import { BADGES } from '../../game/badges';

export function RoundEndOverlay() {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const next = useGameStore(s => s.next);
  const host = isHost({ uid, room });
  const scores = room.round?.scores;
  if (!scores) return null;
  const rows = Object.entries(room.players)
    .sort(([, a], [, b]) => b.score - a.score);
  const blitzer = room.round?.blitzedBy ? room.players[room.round.blitzedBy]?.name : null;

  return (
    <div className="overlay">
      <div className="sheet">
        <h2 style={{ margin: 0 }}>{blitzer ? `${blitzer} blitzed!` : 'Round over (all stuck)'}</h2>
        {rows.map(([id, p]) => {
          const s = scores[id];
          return (
            <div className="score-row" key={id}>
              <span className="chip" style={{ ['--badge' as string]: BADGES[p.badgeId].color }}>
                {BADGES[p.badgeId].glyph}
              </span>
              <span>{p.name}</span>
              <span>+{s?.centerCount ?? 0}</span>
              <span className="score-neg">-{2 * (s?.blitzLeft ?? 0)}</span>
              <span className="score-total">{p.score}</span>
            </div>
          );
        })}
        {host
          ? <button className="btn btn-primary" onClick={next}>Next round</button>
          : <p className="muted" style={{ textAlign: 'center' }}>Waiting for the host…</p>}
      </div>
    </div>
  );
}
```

`src/ui/components/GameOverOverlay.tsx`:

```tsx
import { useGameStore, isHost } from '../../state/store';
import { BADGES } from '../../game/badges';
import { winnerIds } from '../../game/scoring';

export function GameOverOverlay() {
  const room = useGameStore(s => s.room)!;
  const uid = useGameStore(s => s.uid);
  const again = useGameStore(s => s.again);
  const host = isHost({ uid, room });
  const totals = Object.fromEntries(Object.entries(room.players).map(([id, p]) => [id, p.score]));
  const winners = winnerIds(totals, room.meta.targetScore);
  const rows = Object.entries(room.players).sort(([, a], [, b]) => b.score - a.score);

  return (
    <div className="overlay">
      <div className="sheet">
        <h2 style={{ margin: 0 }}>
          🏆 {winners.map(w => room.players[w]?.name).join(' & ')} wins!
        </h2>
        {rows.map(([id, p]) => (
          <div className="score-row" key={id}>
            <span className="chip" style={{ ['--badge' as string]: BADGES[p.badgeId].color }}>
              {BADGES[p.badgeId].glyph}
            </span>
            <span>{p.name}</span><span /><span />
            <span className="score-total">{p.score}</span>
          </div>
        ))}
        {host
          ? <button className="btn btn-primary" onClick={again}>Rematch</button>
          : <p className="muted" style={{ textAlign: 'center' }}>Waiting for the host…</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire phases in RoomScreen**

Replace `src/ui/screens/RoomScreen.tsx` entirely:

```tsx
import { useEffect, useState } from 'react';
import { useGameStore } from '../../state/store';
import { Join } from './Join';
import { Lobby } from './Lobby';
import { Game } from './Game';
import { BlitzSplash } from '../components/BlitzSplash';
import { RoundEndOverlay } from '../components/RoundEndOverlay';
import { GameOverOverlay } from '../components/GameOverOverlay';

export function RoomScreen({ code }: { code: string }) {
  const joinPhase = useGameStore(s => s.joinPhase);
  const room = useGameStore(s => s.room);
  const phase = room?.meta.phase;
  const blitzedBy = room?.round?.blitzedBy ?? null;
  const [splashUntil, setSplashUntil] = useState(0);

  useEffect(() => {
    if (phase === 'roundEnd' && blitzedBy) setSplashUntil(Date.now() + 1600);
  }, [phase, blitzedBy]);
  const [, force] = useState(0);
  useEffect(() => {
    if (splashUntil > Date.now()) {
      const t = setTimeout(() => force(x => x + 1), splashUntil - Date.now());
      return () => clearTimeout(t);
    }
  }, [splashUntil]);

  if (joinPhase !== 'in-room' || !room) return <Join code={code} />;
  if (phase === 'lobby') return <Lobby code={code} />;

  const splashing = splashUntil > Date.now();
  const blitzerName = blitzedBy ? room.players[blitzedBy]?.name ?? '' : '';
  return (
    <>
      <Game />
      {splashing && blitzerName && <BlitzSplash name={blitzerName} />}
      {!splashing && phase === 'roundEnd' && <RoundEndOverlay />}
      {!splashing && phase === 'gameOver' && <GameOverOverlay />}
    </>
  );
}
```

- [ ] **Step 5: Verify tests + manual round-cycle checklist**

Run: `npm test` — Expected: green.
Emulator + two tabs, play a round to completion (2-player games go quickly; temporarily setting target to 25 in the lobby speeds this up):

1. Empty one blitz pile → BOTH tabs show the "BLITZ! <name>" splash, then the score sheet: +center / −2×blitz / running totals, sorted.
2. Non-host tab shows "Waiting for the host…"; host tab has "Next round" → both tabs deal fresh tableaus, roundNumber increments, scores persist in the header.
3. Force an all-stuck stall 3 times (or temporarily set the threshold to 1) → round ends with "Round over (all stuck)" and no blitz bonus.
4. Reach the target → GameOverOverlay with 🏆 and final table on both tabs; host "Rematch" returns everyone to the lobby with scores reset to 0.
5. Mid-round, reload the non-host tab → Join screen (own badge NOT greyed) → rejoin → tableau restored, game continues.
6. Mid-round, close the HOST tab entirely for >5s → the other tab becomes host (its lobby/overlays show host controls), then reopen the old host link → rejoins as a regular player.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: blitz splash, round-end scoring sheet, game over and rematch"
```

---

### Task 14: Animations and mobile hardening

All motion is `transform`/`opacity` only. Framer Motion's layout animations handle card slides; explicit variants handle flips, pops, and rejections. `MotionConfig reducedMotion="user"` honors OS settings globally.

**Files:**
- Modify: `src/App.tsx`, `src/ui/components/CardView.tsx`, `src/ui/components/CenterGrid.tsx`, `src/ui/components/TableauView.tsx`, `src/ui/screens/Game.tsx`, `src/theme.css`

**Interfaces:**
- Consumes: everything shipped in Tasks 11-13
- Produces: `<CardView>` gains optional `layoutId?: string` and `flipKey?: number` props (same call sites, new behavior); no other API changes

- [ ] **Step 1: Global MotionConfig + touch polish**

In `src/App.tsx`, wrap the returned screen:

```tsx
import { MotionConfig } from 'framer-motion';
// in App():
return (
  <MotionConfig reducedMotion="user">
    {route.screen === 'room' ? <RoomScreen code={route.code} /> : <Home />}
  </MotionConfig>
);
```

Append to `src/theme.css`:

```css
button, [data-drop], .card { touch-action: manipulation; }
.card, .card * { user-select: none; -webkit-user-select: none; }
html { -webkit-text-size-adjust: 100%; }
```

(`touch-action: none` from `.card` in game.css still wins for draggables — `manipulation` here kills double-tap zoom on the buttons and drop zones.)

- [ ] **Step 2: Animated CardView**

Replace the `CardView` function in `src/ui/components/CardView.tsx` with (props gain `layoutId`/`flipKey`; `CardBack` stays as-is):

```tsx
import { motion } from 'framer-motion';

export function CardView(props: {
  card: Card; badgeId: BadgeId; size?: 'md' | 'sm'; selected?: boolean; dimmed?: boolean;
  layoutId?: string; flipKey?: number;
}) {
  const { card, badgeId } = props;
  const b = BADGES[badgeId];
  return (
    <motion.div
      layoutId={props.layoutId}
      key={props.flipKey}
      initial={props.flipKey != null ? { rotateY: 90, opacity: 0.5 } : false}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={`card ${props.size ?? 'md'}${props.selected ? ' selected' : ''}${props.dimmed ? ' dimmed' : ''}`}
      style={{ ['--suit' as string]: `var(--suit-${card.suit})`, ['--badge' as string]: b.color }}
    >
      <span className="card-v">{card.v}</span>
      <span className="card-group">{faceGroup(card.suit) === 'boy' ? '◆' : '○'}</span>
      <span className="card-badge">{b.glyph}</span>
    </motion.div>
  );
}
```

Call-site updates:
- `TableauView` wood top: `<CardView ... flipKey={t.woodIndex} />` (each flip re-mounts with a 3D turn); blitz top and post tops: `layoutId={cardId(top)}` (import `cardId` from `../../game/types`).
- `CenterGrid` top card: `layoutId={cardId(top)}` — a card played from the tableau now VISIBLY SLIDES from your pile into the space (same layoutId across containers), including for opponents' plays arriving via snapshots.

- [ ] **Step 3: Completion pop + rejection shake**

`CenterGrid`: wrap the top card in `AnimatePresence` keyed by stack identity so a completed pile pops away:

```tsx
import { AnimatePresence, motion } from 'framer-motion';
import { cardId } from '../../game/types';
// inside each pile-space:
<AnimatePresence>
  {top && (
    <motion.div key={`${i}:${s.history.length}`}
      exit={{ scale: 1.35, opacity: 0, transition: { duration: 0.35 } }}
      style={{ position: 'absolute', inset: 0 }}>
      <CardView card={top} badgeId={props.badgeOf(top.owner)} layoutId={cardId(top)} />
    </motion.div>
  )}
</AnimatePresence>
```

(When the 10th card lands, `history.length` increments, the keyed wrapper unmounts, and the exit pop plays while the space clears.)

`Game.tsx` rejection shake — animate the tableau zone when a play bounces:

```tsx
import { motion } from 'framer-motion';
const lastRejected = useGameStore(s => s.lastRejected);
// wrap <TableauView ...> in:
<motion.div key={lastRejected?.at ?? 0}
  animate={lastRejected ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
  transition={{ duration: 0.35 }}>
  <TableauView ... />
</motion.div>
```

- [ ] **Step 4: Verify feel + tests**

Run: `npm test` — Expected: green (animation props don't touch logic).
Manual with emulator, two tabs:

1. Playing a card slides it from your pile into the center (no teleport); opponent plays slide in on your screen too.
2. Wood flips turn with a 3D flip; completing a pile (play 1..10 of one suit) pops and frees the space.
3. Losing a race shakes the tableau and the card is back where it was.
4. OS-level "reduce motion" ON (Windows: Settings > Accessibility > Visual effects > Animation effects off) → cards appear/disappear without slides.
5. DevTools mobile emulation (iPhone 14, 6x CPU throttle) → Performance panel while spam-playing: no layout thrash warnings, animation frames stay under ~16ms.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: card slide/flip/pop animations, rejection shake, reduced-motion support"
```

---

### Task 15: Deploy — GitHub Pages workflow, Firebase setup guide, device pass

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`
- Modify: `.firebaserc` (real project id, during setup)

**Interfaces:**
- Consumes: the finished app; `GITHUB_PAGES_BASE` env contract from Task 1's `vite.config.ts`
- Produces: live site at `https://<user>.github.io/<repo>/`; documented setup

- [ ] **Step 1: Write the deploy workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      GITHUB_PAGES_BASE: /${{ github.event.repository.name }}/
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write README.md**

```markdown
# German Spree

A mobile-first multiplayer Dutch Blitz card game for 2-8 players. Create a room,
text the invite link, race to empty your Blitz pile. React + Firebase Realtime
Database, hosted on GitHub Pages.

## Local development (no Firebase account needed)

Prereqs: Node 20+, Java 11+ (for the Firebase emulator).

    npm install
    npm run emu     # terminal 1: local Firebase emulator
    npm run dev     # terminal 2: Vite dev server

Open http://localhost:5173 in two windows (one incognito) to play yourself.

Tests: `npm test` (pure logic) · `npm run test:emu` (adds emulator integration tests)

## One-time Firebase setup (~10 min)

1. https://console.firebase.google.com -> Add project (no Analytics needed).
2. Build -> Authentication -> Get started -> enable **Anonymous**.
3. Build -> Realtime Database -> Create database (pick the region closest to
   your players) -> start in locked mode.
4. Project settings -> Your apps -> Web app (</>) -> register -> copy the
   `firebaseConfig` values into `src/net/firebaseConfig.ts`.
5. Put your project id in `.firebaserc`, then deploy the security rules:
   `npx firebase login` and `npx firebase deploy --only database`.
6. Commit and push. Committing the config is safe: access control lives in
   `database.rules.json`, not in the config values.

## Deploy to GitHub Pages

1. Push this repo to GitHub (default branch `main`).
2. Repo Settings -> Pages -> Source: **GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site lands at
   `https://<user>.github.io/<repo>/`.

## House rules vs. the physical game

16 fixed center spaces (completed piles clear to free their space) and digital
stuck-handling: when every player is stuck, wood piles rotate automatically;
three fruitless rotations end the round.
```

- [ ] **Step 3: Verify the workflow locally**

Run: `set GITHUB_PAGES_BASE=/german-spree/&& npm run build` (PowerShell: `$env:GITHUB_PAGES_BASE='/german-spree/'; npm run build`)
Expected: `dist/index.html` references assets under `/german-spree/assets/...`. Unset the var afterwards.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: GitHub Pages deploy workflow and setup docs"
```

- [ ] **Step 5: OWNER ACTIONS (David) — go live**

These need David's accounts; the implementer stops here and hands over:

1. Firebase setup per README (paste config, deploy rules).
2. Create the GitHub repo (suggested name `german-spree` — lowercase, no spaces), `git remote add origin ...`, push `main`, enable Pages -> GitHub Actions.
3. Confirm the Actions run goes green and the site loads at the Pages URL.

- [ ] **Step 6: Real-device acceptance pass (spec section 7)**

On the LIVE Pages URL with the real Firebase backend — one iPhone (Safari) + one Android phone (Chrome), plus a desktop tab as a third player:

1. Create a room on the desktop; text the invite via the phone share sheet from one phone to the other; both phones join via the link.
2. Full 3-player round start-to-finish: no pull-to-refresh, no rubber-band scroll, no double-tap zoom, no text-selection callouts while dragging cards.
3. Layout fills the screen edge-to-edge with no clipped controls behind the notch/home indicator (portrait), and stays usable in landscape.
4. Backgrounding the app mid-round and returning within a minute resumes cleanly; killing the tab and reopening the link rejoins.
5. Animations feel smooth on both phones (no visible jank during a fast flurry of plays).
6. Add-to-home-screen shows the icon and title; launching from it works.

Record any failures as bugs and fix before calling the project done (superpowers:systematic-debugging).

---

## Plan self-review notes (kept for the record)

- Spec coverage: architecture/stack (T1, T7), rules incl. post-building + face groups (T2-T6), rooms/invites/presence (T8, T11), transactions + optimistic rollback (T9, T10, T12), screens (T11-T13), scoring/rounds/rematch (T6, T9, T13), stuck cycle + stalled round end (T4, T9, T10, T12), host transfer (T9, T10, T13 checklist), mobile requirements + reduced motion (T1, T12, T14, T15), deployment + Firebase setup (T7, T15), testing strategy (unit throughout, emulator-gated integration in T8/T9, device pass in T15).
- Known simplifications vs spec, accepted: `meta` writable by any signed-in user (enables creation + host transfer under the casual trust model — noted in T7); `round/scores` writable by any member (idempotence guard is client-side).
- Fixture sanity: test fixtures in T3/T5/T10 were hand-checked against the rules (refill order, alternation legality, race abort).










