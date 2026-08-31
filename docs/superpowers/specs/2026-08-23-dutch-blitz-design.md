# Dutch Blitz Web App - Design Spec

**Date:** 2026-08-23
**Name:** Deutsch Dash (chosen 2026-08-25; repo `deutsch-dash`, Firebase project id `holland-hustle` - project ids are immutable and never shown to players)
**Status:** Approved by David 2026-08-23

## 1. Summary

A free, mobile-first multiplayer web version of the card game Dutch Blitz for 2-8 players.
A host creates a room and texts an invite link to friends; everyone plays in their phone
browser in real time. Static frontend hosted on GitHub Pages; Firebase Realtime Database
(RTDB) is the only backend - there is no server.

**Priority requirement: flawless play on iOS Safari and Android Chrome.** Desktop is a
supported adaptation, not the design target.

## 2. Goals / Non-goals

**Goals**

1. Real-time simultaneous play (no turns) for 2-8 players with fair conflict resolution.
2. Room creation + invite via the phone's native share sheet (SMS-friendly link).
3. Classic Dutch Blitz rules with multi-round scoring to a target score.
4. Slick, clean, modern aesthetic; smooth 60fps card flip/move animations on mid-range phones.
5. Zero hosting cost: GitHub Pages + Firebase free (Spark) tier.

**Non-goals (v1)**

- Accounts, profiles, or persistent stats. Anonymous auth only.
- Bots / solo play, spectators, in-game chat, sound effects.
- Anti-cheat beyond Firebase security rules (deck order is technically visible in dev
  tools; acceptable for casual play among friends).
- Room persistence: rooms are treated as expired 24h after creation.

## 3. Architecture

### 3.1 Stack

- **Frontend:** Vite + React 18 + TypeScript. Animations: Framer Motion (`motion`).
- **Backend:** Firebase Realtime Database + Firebase anonymous auth. Client SDK only.
- **Hosting:** GitHub Pages, deployed by a GitHub Actions workflow on push to `main`
  (`actions/upload-pages-artifact` + `actions/deploy-pages`). Vite `base` set to the repo
  path (or `/` if a custom domain is added later).
- **Routing:** hash-based (`#/room/ABC123`) so GitHub Pages needs no 404 rewrite trick.
  Invite link format: `https://<user>.github.io/<repo>/#/room/<CODE>`.

### 3.2 Module boundaries

| Module | Purpose | Depends on |
|---|---|---|
| `src/game/` | Pure TS game logic: deck construction, shuffling, legal-move checks, scoring, stuck detection, badge definitions. No React, no Firebase. | nothing |
| `src/net/` | Firebase wrapper: room CRUD, subscriptions, transactional plays, presence, auth. Exposes typed functions + hooks; no component imports Firebase directly. | firebase, `src/game/` types |
| `src/ui/` | React components + Framer Motion animation. Screens: Home, Join, Lobby, Game, RoundEnd, GameOver. | `src/game/`, `src/net/` |
| `src/state/` | Client-side store (Zustand): merges local optimistic state with RTDB snapshots. | `src/game/`, `src/net/` |

Rationale: game rules are unit-testable without any I/O; Firebase can be swapped or
emulated without touching UI; UI renders from one store.

### 3.3 Data model (RTDB)

```
rooms/{roomCode}/
  meta/            { createdAt, hostId, targetScore, phase, roundNumber }
                   phase: "lobby" | "playing" | "roundEnd" | "gameOver"
  players/{uid}/   { name, badgeId, joinedAt, connected, stuckAt, score }
  round/
    piles/{0..15}/ { suit, cards: [{ v, suit, owner }] }   // center grid spaces
    tableaus/{uid}/{ blitz: [card], post: [[card]], wood: [card], woodIndex }
                   // post is an array of stacks (descending, alternating face group)
    blitzedBy      uid | null
    startedAt
```

- **Write rules:** a player may write only `players/{their uid}` and
  `round/tableaus/{their uid}`. Center `piles/*` are writable by any room member via
  transaction. `meta` is writable by the current host. Rules live in
  `database.rules.json` in the repo and are deployed with the Firebase CLI.
- **Conflict resolution:** playing a card to space *i* runs an RTDB **transaction** on
  `round/piles/{i}` that validates (empty space + card is a 1) or (same suit + value is
  exactly one higher than current top). Losers of a race get a rejected transaction and
  the UI rolls the card back.
- **Attribution:** every card in a center pile records its `owner`, so round scoring is
  computed deterministically from the final round state by every client; the host commits
  the score summary.
- **Presence:** `onDisconnect` handlers flip `connected` to false.
- **Race window honesty:** a play that lands within the ~100ms window around a Blitz call
  still counts (equivalent to a card already in the air in the physical game).

## 4. Game rules implemented

- Each of up to 8 players uses a 40-card deck: values 1-10 in the four shared suit colors
  (red, blue, green, yellow). Every card also belongs to one of two **face groups** -
  red & blue ("boy" in the physical game) and yellow & green ("girl") - which governs
  post-pile building. Our design shows the group as a subtle, colorblind-safe face
  marking (e.g. two distinct corner glyph shapes).
- **Badges:** each player picks one of 8 badge combos (distinct hue + unique symbol,
  e.g. windmill, tulip, clog, bicycle, lantern, plough, wheat sheaf, star). The badge
  appears on card backs, as a small corner mark on played faces, and on avatars. Badge
  hues must stay distinguishable from the four suit colors and from each other
  (final palette chosen during visual design against a contrast checklist).
- **Setup per round:** 10 cards to the Blitz pile (face up, top card playable); post
  piles - 3, or 5 in a 2-player game - one face-up card each; the rest is the face-down
  wood pile, flipped three at a time (top of the flipped three is playable). When the
  wood pile is exhausted it is turned over unshuffled and reused.
- **Playable to the center:** the top card of any post pile, the Blitz top, or the
  current wood flip top.
- **Post-pile building (official rule):** a player may also move the Blitz top, the wood
  flip top, or the top card of one of their own post piles onto another of their own
  post piles, one card at a time, in **descending sequence, alternating face group**
  (e.g. yellow 7 on red 8 is legal; blue 7 on red 8 is not). When a post pile empties
  completely, the slot refills immediately from the Blitz top.
- **Center grid:** fixed 4×4 = 16 spaces. A 1 of any suit starts a pile in any empty
  space; piles build 1→10 in a single suit. Officially the 10 "finishes" a pile; as a
  digital adaptation for the fixed grid, a finished pile auto-clears after a short
  celebratory animation, freeing its space (played cards still count for scoring).
- **Round end:** first player to empty their Blitz pile ends the round ("Blitz!" splash
  for everyone). Scoring: +1 per own card in the center, −2 per card left in own Blitz
  pile. Running scoreboard; first to the target (default 75, host-configurable in lobby)
  wins the game. Ties at/above target: highest total wins; if still tied, play another round.
- **Stuck handling:** an "I'm stuck" button (stuck = no legal play to the center *and*
  no legal post-pile build). When every connected player is stuck, all wood piles rotate
  one card (top card moves to bottom, shifting the flip-of-three cycle - the official
  standstill rule) and stuck flags clear. If three
  consecutive rotations produce zero plays, the round ends and is scored with no Blitz
  bonus to anyone.

## 5. Screens & flow

1. **Home:** logo + "Create room" / "Join with code". Creating generates a 6-character
   room code (unambiguous alphabet, no 0/O/1/I) and lands the host in the lobby.
2. **Join:** the invite link opens directly into name entry + badge picker (taken badges
   greyed out). Full rooms (8) show a friendly "room full" state.
3. **Lobby:** player list with badges and connection dots; host sets target score and
   taps Start (enabled at 2+ players). Invite button: `navigator.share` on mobile
   (drops into Messages/WhatsApp), clipboard copy on desktop.
4. **Game (portrait phone layout):** opponents as a compact top strip (badge, Blitz
   count, card count, stuck indicator) → center 4×4 grid → own tableau fixed in the
   bottom thumb zone (wood pile left, post slots center, Blitz pile right). Landscape
   and desktop widen the grid and move opponents to a side rail.
5. **Round end:** overlay with per-player breakdown (+center / −blitz / round total /
   running total), sorted by score; host taps "Next round". **Game over:** winner
   celebration + final table; host taps "Rematch" (same room, scores reset).

## 6. Interaction & animation

- **Input:** Pointer Events only (one code path for touch + mouse). Two equal ways to
  play a card: drag-and-drop with valid-target highlighting, or tap-to-select then
  tap-a-target. Valid targets include center spaces and the player's own post piles
  (post builds). Wood pile flips on tap.
- **Touch requirements:** touch/drag targets ≥ 44px; generous drop zones (nearest valid
  space within a radius); no hover-dependent affordances.
- **Animations (Framer Motion, `transform`/`opacity` only):** 3D flip for wood-pile
  flips and post refills; spring slides for card movement; pop-and-fade for completed
  piles; rollback slide when a transaction loses; "Blitz!" full-screen moment. Target
  60fps on mid-range phones; respect `prefers-reduced-motion`.
- **Aesthetic:** neutral light background, soft shadows, rounded cards, restrained
  motion, one accent per player badge, single display font (Google Fonts) with system
  fallback. Dark mode follows the OS via `prefers-color-scheme`.

## 7. Mobile platform requirements (acceptance criteria)

Every feature is verified on real iOS Safari and Android Chrome before it counts as done:

1. Viewport uses `100dvh`; layout respects safe-area insets (notch, home bar).
2. During play: no pull-to-refresh, no rubber-band scroll, no double-tap zoom, no
   long-press text selection/callout on cards (`overscroll-behavior`, `touch-action:
   none` on draggables, `user-select: none`, `-webkit-touch-callout: none`).
3. Native share sheet works from the lobby on both platforms.
4. PWA-lite: correct viewport meta, `theme-color`, home-screen icon + title.
5. A full 4-player round is playable without visual glitches on a mid-range Android
   phone and an iPhone.

## 8. Edge cases & failure handling

- **Player disconnects mid-round:** marked away, tableau freezes, game continues; their
  played cards still score. Reopening the link resumes via the same anonymous auth uid.
- **Host leaves:** host role auto-transfers to the longest-connected player (room state
  lives in Firebase, not the host's tab).
- **Room expiry:** joining a room with `createdAt` older than 24h shows "room expired".
  No deletion job (would require Cloud Functions); abandoned rooms are simply ignored
  and storage stays trivially small.
- **Firebase limits (Spark tier):** 100 simultaneous connections, 1GB storage, 10GB/mo
  transfer - orders of magnitude above friends-scale. No quota handling in v1 beyond a
  generic connection-error banner with retry.
- **Offline/flaky network:** RTDB SDK reconnects automatically; UI shows a "reconnecting"
  pill and blocks plays while disconnected (prevents stale-state plays).

## 9. Testing strategy

1. **Unit (Vitest):** everything in `src/game/` - deck construction, legal moves, post
   refill, post-build legality (descending + alternating face group), wood flip/rotate
   cycle, scoring, stuck/round-end detection, badge uniqueness.
2. **Integration (Firebase Emulator Suite):** security rules (players can't write others'
   tableaus), pile transactions under simulated races, host transfer.
3. **Manual device pass per milestone:** scripted multi-tab desktop playtest + real
   iPhone and Android phone joining a live room.

## 10. Deployment & setup

1. GitHub repo; GitHub Actions workflow builds Vite and deploys to Pages on push to `main`.
2. One-time Firebase setup (David, ~10 min, guided): create free project, enable
   anonymous auth + RTDB, paste config into `src/net/firebaseConfig.ts` (committed -
   safe by design), deploy `database.rules.json` via Firebase CLI.
3. Local dev: `npm run dev` against the Firebase emulator; `npm test` for Vitest.
