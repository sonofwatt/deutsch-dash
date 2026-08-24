# Project Handoff — Holland Hustle (Dutch Blitz web app)

_Last updated: 2026-08-24 — implementation complete on `feature/dutch-blitz`, final review verdict: READY._

## What this is

A mobile-first multiplayer Dutch Blitz card game for 2–8 players. Host creates a
room, texts the invite link, everyone plays in their phone browser. Frontend on
GitHub Pages (static), Firebase Realtime Database as the only backend, anonymous
auth. Verified against the official Dutch Blitz rules (post building, wood
flip-3 cycle, stuck rotation, +1/−2 scoring to a 75-point target).

## Status

**All 15 plan tasks implemented, each gated by an independent review; a final
whole-branch review (plus two fix waves) closed with READY at commit `358f1ac`.**

- 65 unit tests passing, 2 emulator-gated integration files (skip without
  `EMULATOR=1`), `npm run build` and lint clean.
- The final review caught and fixed 3 critical cross-layer bugs unit tests
  couldn't see (all-stuck snapshot recursion, Blitz missed when emptied via a
  post build, wood pile un-flippable after first flip) plus presence teardown,
  score reconciliation, spec-correct tie handling, environment gating with a
  "Not configured" banner (verified live), offline play blocking, and a compact
  2-player tableau that fits 360px phones.

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
npm test        # 65 tests, no emulator needed
npm run dev     # local dev (expects the Firebase emulator for multiplayer)
npm run emu     # Firebase emulator — REQUIRES JAVA 11+ (not installed on this machine)
```

## Remaining work before calling it done

**Blocked on Java/emulator (decision needed — install Java, or approve a
portable JRE under the project, or run on another machine):**

1. `npm run test:emu` green — the two integration suites (room lifecycle, live
   transaction race) have never executed anywhere.
2. Implement + emulator-test the `players/$uid` `.validate` rule closing the
   join race (8-player cap / badge uniqueness are client-side-only today);
   proposed rule text is in the ledger under Task 8.
3. The two-tab manual checklists from plan Tasks 11–13 (lobby/presence, game
   input incl. wood flip + race behavior, round cycle/host transfer), plus the
   ledgered pointer-capture re-select check.

**Owner actions (David):**

4. Firebase setup per README (~10 min): project, Anonymous auth, RTDB, paste
   config into `src/net/firebaseConfig.ts`, deploy `database.rules.json`.
5. GitHub: create repo (suggest `holland-hustle`), push, Settings → Pages →
   Source: GitHub Actions; confirm the workflow deploys green.
6. Real-device acceptance pass (spec §7) on the live URL: iPhone Safari +
   Android Chrome. Known item: iOS home-screen icon needs a PNG
   `apple-touch-icon` (currently SVG, which iOS ignores).

**Triaged fix-later list (non-blocking, in the ledger):** ShareInvite clipboard
try/catch; rejection-shake remounts the tableau; room-code collision check on
create; bundle code-split; combined roundEnd→gameOver snapshot skips the final
score breakdown; kite/bell badge hues sit near suit blue/red; host transfer
disabled in lobby (deliberate); harmless WS retry noise behind the
"Not configured" banner.
