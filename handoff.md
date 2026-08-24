# Project Handoff — German Spree (Dutch Blitz web app)

_Last updated: 2026-08-24 (execution in progress — Task 1 of 15 complete)_

## What this is

A mobile-first multiplayer Dutch Blitz card game for 2–8 players. Host creates a
room, texts the invite link, everyone plays in their phone browser. Frontend on
GitHub Pages (static), Firebase Realtime Database as the only backend, anonymous
auth. Priority requirement: flawless on iOS Safari and Android Chrome.

## Key documents

| Doc | Purpose |
|---|---|
| [Design spec](docs/superpowers/specs/2026-08-23-dutch-blitz-design.md) | Approved requirements: rules (verified against official Dutch Blitz), architecture, screens, mobile acceptance criteria |
| [Implementation plan](docs/superpowers/plans/2026-08-23-dutch-blitz.md) | 15 TDD tasks with complete code per step; checkboxes track intent, ledger tracks truth |
| `.superpowers/sdd/progress.md` | Execution ledger (git-ignored): which tasks are actually complete + minor findings parked for final review |

## Status

- **Done:** Task 1 — Vite + React 19 + TS(strict) scaffold, theme tokens, hash
  router (`#/room/CODE`), Vitest wiring, GH-Pages `base` config. Committed on
  branch `feature/dutch-blitz`.
- **In progress:** Tasks 2–15 executing via subagent-per-task with review gates.
- **Versions note:** scaffold uses newer majors than the plan text assumed
  (React 19, Vite 8, Vitest 4, TS 6, zustand 5, framer-motion 13). Plan code is
  applied on top, adapting only where typecheck demands; deviations are recorded
  in `.superpowers/sdd/task-N-report.md` files.

## How to run (current state)

```
npm install
npm test        # pure-logic tests (no emulator needed)
npm run dev     # Vite dev server
```

The Firebase emulator (`npm run emu`, arrives in Task 7) needs Java 11+, which
is NOT installed on this machine — the executor will use a portable JRE under
the project (no system changes) or skip emulator-gated tests (they auto-skip
without `EMULATOR=1`).

## Owner actions still ahead (David)

1. **Firebase project** (~10 min, after Task 15's README lands): create free
   project, enable Anonymous auth + Realtime Database, paste config into
   `src/net/firebaseConfig.ts`, deploy `database.rules.json` via Firebase CLI.
2. **GitHub**: create repo (suggest `german-spree`), push, Settings → Pages →
   Source: GitHub Actions.
3. **Device pass**: run the plan's Task 15 real-device checklist (iPhone Safari
   + Android Chrome) on the live URL.

## Conventions that bind all work

TS strict, no `any`; last-array-element = top of every pile; Pointer Events
only; animations `transform`/`opacity` only; hash routing only; commits end with
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
