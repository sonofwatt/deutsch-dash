# Project Handoff — Holland Hustle (Dutch Blitz web app)

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

## Remaining work

**Owner actions (David) — the Firebase project `holland-hustle` already exists:**

1. In the Firebase console: enable **Anonymous** sign-in (Authentication →
   Sign-in method), then create a **Realtime Database** (pick the region closest
   to your players, start in locked mode).
2. Project settings → Your apps → add a **Web app**, copy the config values into
   `src/net/firebaseConfig.ts`. Committing them is safe: access control lives in
   `database.rules.json`. Until this is done the app shows a "Not configured"
   banner instead of a white screen.
3. Deploy the rules: `npx firebase login` then `npx firebase deploy --only database`.
   (`.firebaserc` already points at `holland-hustle`.)
4. GitHub: create the repo (name it `holland-hustle` so the Pages base path
   matches), push `main`, then Settings → Pages → Source: **GitHub Actions**.
   Confirm the workflow run goes green.
5. Real-device acceptance pass (spec §7) on the live URL: iPhone Safari +
   Android Chrome. Two known items to check there: the iOS home-screen icon
   needs a PNG `apple-touch-icon` (SVG is ignored by iOS), and the ledgered
   pointer-capture re-select check on mouse drags.
6. The two-tab manual checklists from plan Tasks 11–13 (lobby/presence, game
   input including wood flip and race behaviour, round cycle, host transfer).
   These can be run locally against the emulator before deploying.

**Triaged fix-later list (non-blocking, in the ledger):** ShareInvite clipboard
try/catch; rejection-shake remounts the tableau; room-code collision check on
create; bundle code-split; combined roundEnd→gameOver snapshot skips the final
score breakdown; kite/bell badge hues sit near suit blue/red; host transfer
disabled in lobby (deliberate).
