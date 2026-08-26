# Project Handoff — Deutsch Dash (Dutch Blitz web app)

_Last updated: 2026-08-24 — merged to `main`, 77/77 tests green including full
emulator coverage against real security rules._

## What this is

A mobile-first multiplayer Dutch Blitz card game for 2–8 players. Host creates a
room, texts the invite link, everyone plays in their phone browser. Frontend on
GitHub Pages (static), Firebase Realtime Database as the only backend, anonymous
auth. Verified against the official Dutch Blitz rules (post building, wood
flip-3 cycle, stuck rotation, +1/−2 scoring to a 75-point target).

## Status

**Complete and merged to `main`.** 15 planned tasks, each gated by an independent
review; a whole-branch review plus two fix waves; then server-side join limits
and an emulator-verification pass.

- **77 tests pass** — 65 pure-logic unit tests plus 12 emulator integration tests
  covering the live transaction race, the 8-player cap, badge uniqueness, and
  rejoin. Build and lint clean.
- Reviews caught and fixed three critical cross-layer bugs unit tests could not
  see (all-stuck snapshot recursion, Blitz missed when emptied via a post build,
  wood pile un-flippable after the first flip), plus presence teardown, score
  reconciliation, spec-correct tie handling, offline play blocking, and a
  compact 2-player tableau that fits 360px phones.
- **Server-side enforcement is real now.** The 8-player cap and badge uniqueness
  are enforced by Firebase rules, not just the client. The cap uses a
  `meta/playerCount` counter written with Firebase's `increment(1)` sentinel so
  the server resolves it atomically — `numChildren()` is unsupported by the RTDB
  emulator's rules engine, so counting children was not an option.
- **Emulator now tests the real rules.** The app previously connected to database
  namespace `demo-blitz`, where the emulator serves wide-open rules, while
  `database.rules.json` loads into `demo-blitz-default-rtdb`. Every emulator test
  before this fix ran with rules disabled. Corrected in `src/net/firebase.ts`;
  a regression canary test now fails loudly if it ever regresses.

## Key documents

| Doc | Purpose |
|---|---|
| [Design spec](docs/superpowers/specs/2026-08-23-dutch-blitz-design.md) | Approved requirements |
| [Implementation plan](docs/superpowers/plans/2026-08-23-dutch-blitz.md) | The 15 tasks as executed |
| [README](README.md) | Setup, local dev, deploy, house rules |
| `.superpowers/sdd/progress.md` | Execution ledger: per-task commits, every finding + disposition |

## How to run

```
npm install
npm test         # 65 unit tests, no emulator needed
npm run dev      # local dev server
npm run emu      # Firebase emulator (portable JRE at .tools/, gitignored)
npm run test:emu # all 77 tests, emulator included
```

Java is not installed system-wide; a portable Temurin JRE 21 lives in `.tools/`
(gitignored) and `scripts/with-java.mjs` puts it on PATH for the emulator
scripts automatically. On another machine, either install Java 11+ or re-download
that JRE.

## Verified against production (2026-08-25)

Firebase project `holland-hustle` is wired and its rules are deployed. A live
two-client test through the production build confirmed the whole path works:
anonymous auth issuing two distinct identities, room creation, a second client
joining (with the host's badge correctly greyed out), real-time lobby sync, the
host deal (5 post piles for a 2-player game, 25-card wood, 10-card blitz), and a
card played to the centre landing on the opponent's screen with the correct owner
badge. No console errors at any point.

Two test rooms (`WMTGGM`, `DX44BC`) are left in the database; they are harmless
and ignored after the 24h expiry check.

## Host continuity (fixed 2026-08-25, verified in production)

**Rule: the room's creator is host whenever they are present; while they are away,
the longest-present connected player stands in.**

- `meta.creatorId` is immutable and set at room creation. The creator reclaims host
  automatically the moment they are back — no button, no timer.
- If the host goes quiet, a stand-in takes over after `HOST_AWAY_MS` (30s, exported
  from `src/state/store.ts`). Transfer now works in the lobby too, so a host who
  closes their tab before starting no longer kills the room.
- The 30s grace exists because tapping "Invite friends" opens the mobile share
  sheet, which backgrounds the tab and drops the socket. Most invite round-trips
  finish inside it; if one doesn't, reclaim puts things right anyway.
- Non-hosts see "Host is away — someone else can start shortly…" instead of an
  unexplained wait.
- **Auto-resume:** anyone already in a room who reopens its link goes straight back
  in (brief "Rejoining…" state) instead of re-picking a name and badge. Players who
  are not members still get the normal join form, with taken badges greyed out.

Verified live against production, two clients on separate origins: host away →
grace held → stand-in took over and could start → original host returned and
reclaimed instantly. Auto-resume verified separately: closing and reopening the
host's tab lands directly in the lobby, still host, while a different identity
opening the same link still sees the join form.

## Remaining work

~~Anonymous auth, Realtime Database, config paste, rules deploy, GitHub repo,
Pages deploy~~ — all done.

**Live at https://sonofwatt.github.io/deutsch-dash/** — repo `sonofwatt/deutsch-dash`,
deployed by GitHub Actions on every push to `main` (CI runs the tests first).
Verified on the live origin: anonymous auth works from `sonofwatt.github.io`,
rules enforce (authenticated room read returns data, unauthenticated returns 401),
and the deployed bundle carries the current code. Copy-link confirmed on a real
phone.

Still outstanding:

1. **A full multi-round game with real players.** Production testing covered
   setup, joining, dealing and a single card play — not a round played to
   completion (blitz call, scoring overlay, next round, rematch) or the
   stuck-rotation path. This is the last untested behaviour of any size.
2. **Real-device acceptance pass (spec §7)** beyond copy-link: a full round on
   iPhone Safari and Android Chrome, checking no pull-to-refresh, no rubber-band
   scroll, no double-tap zoom, and no text selection while dragging cards.
3. The ledgered pointer-capture re-select check on mouse drags.

~~iOS home-screen icon~~ — fixed 2026-08-25: `public/icon-180.png` (apple-touch-icon)
and `public/icon-512.png` are generated from the same design as `icon.svg` by
`scripts/make-icons.py`; re-run it if the artwork changes.

Note on PowerShell: `npx` is blocked by the execution policy on this machine; use
`npx.cmd` (or Git Bash) for `firebase` commands.

**Triaged fix-later list (non-blocking, in the ledger):** ShareInvite clipboard
try/catch; rejection-shake remounts the tableau; room-code collision check on
create; bundle code-split; ~~combined roundEnd→gameOver snapshot skips the final
score breakdown~~ (fixed 2026-08-25: the game-over sheet now carries the final
round's +center/-blitz breakdown and the target); kite/bell badge hues sit near
suit blue/red; host transfer disabled in lobby (deliberate).

## Playtest pass — 2026-08-25 (2 players, Android + Windows Chrome)

First real two-player game. Everything in this pass came out of that session:

- **Darker slot outlines** — `--pile-line`/`--pile-fill` in `theme.css`, a
  deliberately heavy token separate from `--line`, because a hairline at card
  size reads as nothing on a phone.
- **Completed piles stay put**, turned face down, retiring their space. Enforced
  in both directions: `canPlayToSpace` on the client, and `centerPlayTxn`
  rejecting a finished space server-side so a stale client cannot revive one.
- **Washroom pictograms** replace the ◆/○ boy/girl dingbats (`FaceGlyph` in
  `CardView.tsx`) — post building turns on that distinction, so it has to read
  at a glance.
- **Pile depth cues** (`PileStack`) under the wood draw pile, the turned-over
  wood group (max 2, matching a flip of 3), the Blitz pile and post stacks.
- **Wood recycle** is now reachable from the turned-over pile itself (a ↻ button
  that does not steal the tap-to-play target) as well as from the empty draw
  slot, which now shows ↻ rather than looking like dead space.
- **Board sizing is height-aware** — `min(12vw, 8vh)`. The board is a fixed
  four-row layout in 100dvh, and the new opponent row plus the peek reserve
  would otherwise push the bottom row under `overflow: hidden` on a short
  window. Grid columns are fixed card widths and centre, instead of `1fr`
  columns scattering the piles across a desktop window.
- **Opponents' face-up cards** are mirrored in the opponent strip (wood top,
  post tops, Blitz top + count) — all public information in the physical game.
- **"I'm stuck" hidden** behind `ENABLE_STUCK_BUTTON`. See the caveat in the
  README: with it off, a genuine stalemate has no way out.
- **One-tap join** — Home joins outright with the name and badge already on
  screen; the Join form is now only the fallback for an invite link (or a
  rejected join, whose reason it still shows).
- **Game-over threshold pinned by test** (`plays.emu.test.ts`): target-1 keeps
  playing, target ends it, asserted through the real write path. The playtest
  report of "the game ended at 24" turned out to be the ROUND-end sheet (it
  carries a "Next round" button); the emulator test now replays that exact board
  — Dave +24/-0, sonofwatt +8/-20, target 25 — and asserts both that the game
  does not end and that "Next round" deals round 2.
- **Host actions no longer fail silently.** `start` / `next` / `again` / bot
  management were `void`-ed promises, so a rejected or dropped write left the
  button looking dead with nothing on screen. They now land in `actionError`,
  rendered by the lobby and both overlays.
- **AI players** (`src/game/bot.ts`, driver in `store.ts`, lobby UI). See the
  README section for the design and why bots are host-driven.

## Second pass — 2026-08-25

- **Finished piles clear again** and show on rails flanking the board. The
  dead-space rule lasted one iteration; clearing removes the starvation question
  entirely and the rails keep the information the vanishing cards used to lose.
- **Board is 4 x players spaces, capped at 24** (`spaceCountForPlayers`). 32 at
  eight players was too cluttered to be worth the theoretical guarantee, and with
  clearing restored the guarantee is no longer needed - a full board is transient.
- **Automatic stuck detection** (`isStuck` in `rules.ts`, `syncStuck` in
  `store.ts`) replaces the button, covers bots, and rotates bot wood piles on the
  all-stuck path (nobody else can - the host owns their hands).
- **Snap-to-nearest drop band** under the board (`nearestOf` / `nearestSpace` in
  `useDrag.ts`). Tap works too, for the tap-to-play path.
- **Cards are poker-standard 2.5 x 3.5** via `aspect-ratio`, which also makes the
  `--card-h` class of bug structurally impossible to reintroduce.
