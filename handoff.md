# Project Handoff — Deutsch Dash

_Last updated: 2026-08-28. Working tree clean, CI green including the emulator
suite. A commit sitting unpushed has already invalidated one playtest — what
people are playing is whatever last reached Pages — so check `git status -sb`
before trusting what a table reports._

_**329 tests green** (305 unit + 24 emulator). This is the only place in the repo
that quotes a count — it drifted three separate ways when it lived in four
places, so keep it here and nowhere else._

**The version is `src/version.ts` and nowhere else** — the same one-place rule the
test count above keeps. `v<major>.<minor>.<patch>`, shown at the foot of the home
and lobby screens so a report from a table can be tied to a build.

The minor and patch are **derived from two counters**, so bumping is incrementing
one number: a batch of feature work is worth **10** however many items it holds, a
small change is worth **1**, and the running total splits at 100 — which makes the
patch field exactly "feature batches this hundred, then small changes". **MAJOR is
manual** and moves only when the table calls a release major, never by arithmetic.
Bump it in the commit that earns it, or it will drift the way the test count did.

A mobile-first multiplayer Dutch Blitz game for 2–8 players, plus AI opponents.
Host creates a room, texts the invite link, everyone plays in their phone
browser. React + Firebase Realtime Database, static hosting on GitHub Pages,
anonymous auth. No server of our own.

- **Live:** https://sonofwatt.github.io/deutsch-dash/
- **Repo:** `sonofwatt/deutsch-dash`, deploys from `main` via GitHub Actions
- **Firebase project:** `holland-hustle` (id is immutable, never shown to players)

This file is the **why**. The README is the player-facing half — setup, the
security model, the host options and the house rules — so a change to what a
lobby toggle *does* belongs in both.

## How to run

```
npm install
npm test         # fast path: no Java, no emulator. The rules tests SKIP.
npm run test:emu # everything, emulator included. What CI runs.
npm run dev      # local dev server, always against the emulator
npm run emu      # Firebase emulator on its own
npm run build    # tsc -b then vite build
npm run lint     # oxlint — 7 warnings, 0 errors is the current clean state
```

Java is required for the emulator. A portable Temurin JRE lives in `.tools/`
(gitignored) and `scripts/with-java.mjs` puts it on PATH automatically, falling
back to system Java.

**Pushing:** the remote is SSH (`git@github.com:sonofwatt/deutsch-dash.git`) via
a repo deploy key at `~/.ssh/id_ed25519_deutsch_dash`. There are no HTTPS
credentials on this machine — switching the remote back to HTTPS breaks pushing
entirely. Confirm auth with `ssh -T git@github.com`.

---

## Before you change anything

These are the things that will cost you an afternoon if you don't know them.
Most are load-bearing decisions with a reason behind them, not accidents.

### Two traps that will bite almost any UI change

**`tsc -b` typechecks the test files.** `tsconfig.app.json` has
`"include": ["src"]`, and `npm run build` runs `tsc -b` first. `render.test.ts`
constructs `TableauView` / `CenterGrid` prop objects as complete literals, so
**adding a _required_ prop to either breaks the build**, not just the tests — and
`npm test` stays green while it does, because vitest does not typecheck. Make new
props optional, or update that file in the same commit. Half the features below
hit this.

**There is no DOM anywhere in the test suite.** `vite.config.ts` sets
`environment: 'node'`, so `localStorage` is undefined. **Any `localStorage` read
at module scope throws at import time**, and because `src/state/store.ts` builds
the `gameStore` singleton at module scope, that failure takes out every store
test at once. Hydrate preferences inside a component (as `Home.tsx` and
`Join.tsx` already do) or guard with `typeof localStorage !== 'undefined'`.
Also: `include` is `src/**/*.test.ts`, so a test file named `.test.tsx` is
silently never collected.

### Editing `database.rules.json` is half the job — deploying it is the other half

**After ANY change to the rules, run `npx firebase deploy --only database`.**
Nothing in the repo can tell you that you have not: the emulator always loads the
file from disk, so the whole suite passes happily against rules the live database
has never seen.

This has already cost a whole playtest. `stats` gained its own `.write` grant in
`a93e7d2`; the live database was still serving the rules from before it.
`commitScores` sent `round/scores`, every player's total and `stats` as **one
multi-path update** — and a multi-path update is atomic, so the denied stats write
rejected the entire round.

The symptoms are worth knowing, because not one of them points at permissions:

- The **host sees a score sheet** anyway. RTDB applies a write to the local cache
  and raises `onValue` locally before the server has answered.
- The rejection rolls that write back, raising **another** snapshot with
  `!room.round.scores` true again, which re-enters `commitScores`. A denied write
  every ~13ms for as long as the round is on screen.
- The host's header total therefore shows **that round's delta, not a running
  total** — the previous round's total was rolled back too.
- Every other client sees **nothing**: no sheet (`RoundEndOverlay` renders null
  without `round.scores`) and a permanent 0.

Three changes make it survivable now, all worth keeping:

- **Stats are a second, separate, best-effort write** (`commitScores`). They are
  commentary material; the scores are the game. Nothing that only decorates a
  round can lose it again. `plays.emu.test.ts` pins the separation by asserting
  there is a snapshot where the scores exist and the stats do not.
- **The commit is attempted once per round, not once per snapshot** (`store.ts`,
  `commitFailedFor`), so a rejection cannot loop. Cleared on reconnect, because
  offline is the one cause a retry fixes.
- **A refused commit is shown**, on the game screen as well as on the sheet — the
  write most likely to fail is the one that builds the sheet, so the sheet is not
  there to carry its own error.

The `races` (`7803a44`) and `duels` (`05516a8`) grants have the same exposure: a
skipped deploy makes race flashes and rivalry commentary silently vanish.

### Firebase and the emulator

- The emulator database URL in `src/net/firebase.ts` must stay
  `?ns=demo-blitz-default-rtdb`. The emulator only auto-loads
  `database.rules.json` into the `<project>-default-rtdb` namespace; any other
  namespace serves fully-open rules. **This bug already happened once** and
  silently ran every emulator test with rules disabled.
- The CANARY test in `rooms.emu.test.ts` ("a non-host cannot write another
  player's round/tableaus — proves rules are ON in this namespace") exists purely
  to fail loudly if that regresses. Do not weaken or delete it.
- `usingEmulator` is `forceEmu || (import.meta.env.DEV && !forceProd)`, so
  `npm run dev` and every test point at the emulator and can never write the live
  database. Only a production build reaches the real project. Opt in deliberately
  with `VITE_USE_PROD=1 npm run dev`.
- `createRoom` performs **two sequential writes, not one atomic `set()`**. The
  `players/$uid` validate rule cross-references `meta/phase`, and that only
  resolves reliably when meta is already committed. Collapsing them breaks room
  creation.
- `joinRoom` must write `meta/playerCount` with the `increment(1)` sentinel and
  never `snapshotCount + 1` — two racers reading 7 would both send the literal 8
  and both satisfy the validate. That's a confirmed race that admitted a 9th
  player while wedging the counter at 8.
- `MAX_PLAYERS = 8` in `src/net/rooms.ts` is mirrored as a bare literal `8` in
  `database.rules.json`. Change both or client and server disagree.
- **RTDB does not run validate rules on a delete.** That is what lets a player
  release a claimed badge with no rules change (see the lobby identity editor).
- **`players/$uid` no longer has a `.validate`.** It used to gate a brand-new
  player record on `meta/phase === 'lobby'`; a game in progress admits spectators
  now (see below), so that clause is gone and **deployed**. The 8-seat cap is
  untouched - `meta/playerCount`'s own validate is what enforces it, which is why
  it is a tracked counter rather than a live child count. Both halves are pinned
  in `rooms.emu.test.ts`: a mid-game join succeeds, a ninth player still fails.
- `createRoom`'s two sequential writes are kept. The reason given here used to be
  that `players/$uid`'s validate read `meta/phase`; with that gone, what remains
  is `meta/hostId`'s validate reading `players`. The shape is what the emulator
  tests seed against, so leave it alone unless you are prepared to re-prove it.

### CI runs the emulator suite — keep it that way

The emulator files gate every describe on
`describe.runIf(process.env.EMULATOR === '1')`. Without that variable their tests
**skip, and a skipped test reports green**. That is the right trade for the fast
local loop, but it means the only tests that exercise `database.rules.json` —
including the CANARY proving the rules are loaded at all — are invisible unless
something deliberately turns them on.

So CI runs `npm run test:emu`, not `npm test`. It is a strict superset, and
running the plain suite alongside it would just execute everything twice.

Running the emulator on a runner needs a JVM (`actions/setup-java`), and the
~30MB database-emulator jar is cached so a slow CDN cannot turn the rules tests
into a red build. Both are in the workflow.

`src/net/emulatorCoverage.test.ts` guards it. It reads the workflow rather than
checking env vars, deliberately: an env check only fails in the environment that
already broke, whereas this goes red in **any** run — local, CI, a contributor's
laptop — the moment the two drift apart. It also pins that the emu suites still
gate on `EMULATOR`, so if that changes, the reasoning behind the CI step gets
revisited rather than quietly rotting.

Locally, `npm test` skipping the rules tests is fine and intended — but run
`test:emu` before pushing anything touching `src/net/` or the rules.

### Trust model

**Knowing the room code is the credential.** Room `.read` and the writes to
`round/spaces`, `blitzedBy`, `scores` and `stuckRounds` are gated only on
`auth != null`, and anonymous tokens can be minted straight from the Firebase
REST API. Only `players/$uid` and `round/tableaus/$uid` are genuinely bound to a
uid. `endRoundStalled` and `incrementStuckRounds` are host-by-convention and
explicitly not enforced. See the README's security section for why this is
deliberate.

### State and host continuity

- **Firebase raises local `onValue` events synchronously from inside
  `set()`/`update()`**, so `onSnapshot` can re-enter itself. The `inSnapshot`
  flag lets re-entrant snapshots update `room` but skips all side effects. That's
  what stops the all-stuck rotation firing twice.
- Host continuity is two independent mechanisms: an immutable `meta.creatorId`
  that reclaims host instantly on any snapshot where `hostId !== me`, and a
  `HOST_AWAY_MS` (30s) stand-in watchdog handing host to the longest-present
  connected non-bot. `claimHost` is a transaction returning `undefined` when
  already host, so reclaim cannot loop.
- **Four separate things write `players/$uid`, from four places.** `startPresence`
  owns `connected` through `onDisconnect`, `syncStuck` owns `stuckAt`, the away
  timer owns `awayAt`, and the player's own controls own `ready` /
  `sittingOut`. Keep them apart: expressing "away" by writing `connected: false`
  in particular would fight the `onDisconnect` handler and make a present player
  look gone to the host watchdog.
- **Two phones do not agree on the time.** `awayAt` is only ever tested against
  null, and the lobby countdown is a digit the host writes rather than a deadline
  each client races its own clock to. Anything new that looks like a shared
  deadline needs the same treatment.
- Tests must build a store with `createGameStore(fakeDeps)` and never touch the
  exported `gameStore` singleton — importing it executes Firebase module side
  effects.

### Presence: away, and sitting out

Two different absences, and every table-wide rule has to skip both.

**Away** is how the idle-table hang was fixed (`034e313`). One human, two bots,
the human doing nothing: an idle player is never marked stuck — correctly, their
wood is untouched and their Blitz top will land somewhere — so `allConnectedStuck`
never came true, the rotation never fired, and the three-fruitless-rotations round
end was unreachable. A player with legal moves who is not playing is not stuck,
and the game waiting for them is right up until they have *gone*; so what is
detected is that they have gone.

`PlayerInfo.awayAt` is written by the player's **own** client off its own clock
after `AWAY_MS` (45s, in `store.ts`) of touching nothing, and `allConnectedStuck`
skips away players exactly as it skips disconnected ones. No rules change —
`players/$uid` was already writable by its owner, with emulator tests pinning both
that and that nobody else can write your `awayAt`. The reset is `noteActivity`,
wired to plays, flips and a pointerdown anywhere on the game screen — a wider net
than "made a legal move" on purpose, because a player weighing up the board is
present. Bots are never away: they have no client to notice, and the host either
plays their hand or marks them stuck.

`awayAt` means something different per phase, which is fine because the two never
run at once: during a round it is 45s of no input (the idle timer owns it); in the
lobby it is **the tab is hidden**, which the browser reports instantly, and
`noteVisible` owns it there. One writer per phase.

> **`allConnectedStuck` being true no longer implies *you* are stuck.** That
> implication used to be free — if everyone connected is stuck and I am connected,
> I am stuck too — and skipping away players broke it in exactly the shape that
> hangs a table: in the reported repro the away human is the host and the only
> client still running, so it would have seen `allConnectedStuck` come back true
> and then declined to act on it. An away client now rotates on the table's
> behalf, and its own wood rotates with everybody else's, a rotation being a
> table-wide event. `store.test.ts` has that exact shape ("an away host rotates on
> behalf of a table of stuck bots"). Anything newly gated on `allConnectedStuck`
> must say what it wants about the caller explicitly.

**There are now THREE ways to be present and not in the round**, and every one of
them found this trap independently: sitting out, being away, and - since a game in
progress admits spectators - having no hand at all. A player with no tableau can
never be stuck, so counted as present they are one more player the table waits on
forever. `allConnectedStuck` takes the round's `tableaus` and skips anybody who is
not in it. **Pass them wherever a round exists.** Two store fixtures had to grow
hands when this landed, which they should always have had - `startRound` deals one
to every player who is not sitting out.

**Sitting out** is `players/$uid/sittingOut`, owner-written like `ready` and
`awayAt`, so no rules change. It ejects the player from the round **in progress**,
forfeiting that round's arithmetic in both directions: no penalty for the Blitz
pile they abandoned, no credit for what they had already played. Cards already in
the centre stay there — other people are building on them.

**Sitting out keeps the hand**, and this is the part to not undo. The first cut
deleted the tableau, so returning meant waiting for the next deal. Re-dealing one
on return would have been worse than it sounds: `buildDeck` is per-player and
every card carries its owner, so a fresh deck mints duplicates of the cards that
player already has in the middle — same `cardId`, same layout id, playable twice.
Keeping the hand sidesteps that and restores exactly what they put down.

**So the flag, not the absence of a tableau, is what every rule reads.**
`startRound`, `allConnectedStuck` and `tableReady` skip them, `commitScores`
filters them out of `scoreRound` so a round played without them moves their total
not at all, `syncStuck` returns early (they still have a hand and would otherwise
be declared stuck for a round they are not in), and `playTo` refuses. A player who
missed the *deal* still has no hand and still waits for the next round — the
button says which case they are in. `tableReady` must then also check that at
least two players are actually left: a table of one plus three spectators is not a
game.

The board is sized on the WHOLE room, deliberately - sizing it on who is dealt in
would resize the grid under a hand somebody is holding the moment anyone sat down,
and a couple of spare spaces costs nothing.

**But the size is now fixed at the DEAL, not derived per client.** `startRound`
writes `round.spaceCount` and `normalizeRoom` reads it. Deriving it from the live
player count was safe only while that count could not change mid-round, and it can
now: a spectator joining a four-player game grew the board from 16 spaces to 20
under everybody's hands, which is exactly what sizing on the whole room was chosen
to avoid. A round dealt before the field existed falls back to the old derivation,
which is correct for it - nobody could join one of those late.

**A React trap this uncovered.** `useOpenings` used to be called AFTER the "no
board" early return, on the reasoning that a round either has a board for its
whole life or never does. Ejection is exactly the end of that: the hand vanishes
under a board that was rendering a moment ago, the early return fires, the hook
count changes and React tears the tree down — *"Rendered fewer hooks than
expected."* It is hoisted above every conditional return now and must stay there.
The stable `NO_SPACES` constant beside it is load-bearing too: the hook compares
`spaces` by reference, so a fresh `[]` per render would look like a change every
render, and it sets state.

### AI players

- **A bot can never be host.** `pickNextHost` filters `isBot`, which matters
  precisely because a bot's `connected` flag is written once and never cleared —
  without the filter it would always look like the longest-present live player,
  while having no client to run the room with. Asserted in `plays.test.ts`.
- **Only the host runs the bot loop.** `driveBot` bails on `isHost`. Bot hands
  live in client-only `botTableaus` state, and a new host re-adopts them from
  `room.round.tableaus[id]` via `reconcileTableau`.
- **Bots are excluded from `meta/playerCount`** because that validate rule
  forbids the value ever decreasing — counting a bot would permanently consume a
  seat when it was removed. The 8-seat total is enforced client-side in `Lobby`.
- A bot's badge is claimed **under the host's uid**, because
  `badges/$badgeId`'s validate requires `newData.val() === auth.uid` and bots have
  no auth identity. This still blocks a human taking that badge, with no rules
  change.
- The practical player ceiling is the 8 entries in `BADGE_IDS`.

### Game rules as implemented

- `centerPlayTxn` archives a pile into `space.history` and clears `stack` at
  exactly 10, freeing the space server-side, so a stale client cannot revive a
  finished pile. Finished piles show on the rails flanking the board — **except
  above 24 spaces** (`CROWDED_SPACES` in `CenterGrid.tsx`, i.e. seven and eight
  players), where the rails leave the board's column flow altogether and hang off
  the screen edges with a third of a chip showing. At eight columns every pixel a
  rail holds is one the slots do not get, and that alone is worth ~15% on the card
  size. The `+N` overflow marker is suppressed there — a 10px glyph sliced to a
  third is a smear rather than a number — but the rail's `aria-label` still
  carries the true count.
- Board size is `4 × players` — `spaceCountForPlayers`, capped only by
  `MAX_SPACES = 32`, which is `4 × MAX_PLAYERS` and so no longer binds. Four per
  player is **one space per Ace in the game**, and keeping that exact is what
  guarantees an Ace always has somewhere to go: if every space is occupied then
  every Ace is already down, so nobody can be holding one. The cap used to be 24
  and broke that at seven and eight players — survivable on an ordinary board,
  fatal on an orderly one, which cannot lend one suit's space to another.
- **`canPlayToSpace` is the single definition of "can this land here"**, and the
  orderly-grid suit constraint lives inside it for that reason. Anything that adds
  a rule about the centre goes there, or highlighting, `hasLegalMove`, `isStuck`,
  the bots, the hint and `centerPlayTxn` start disagreeing — and a player gets
  declared stuck holding a move they can see.
- **`centerPlayTxn` spreads the space it was given straight back into RTDB.** Two
  consequences: never put an `undefined` on a `CenterSpace` (RTDB rejects the whole
  write — `normalizeSpace` must leave `suit` *absent*, not empty), and never
  rebuild the space from scratch in the archive branch or its suit goes with it.
  Both of those were real bugs; both are pinned by tests now.
- **`ENABLE_STUCK_BUTTON` is `false`** and the whole stuck path still runs
  underneath. Being stuck is *detected* by `isStuck` + `syncStuck`, not declared.
- **Stuck is judged on what the wood can REACH, not on what is face up.** Turning
  three at a time only ever exposes every third card, and which third depends on
  where the index happens to sit - so a hand can be full of playable cards none of
  which can be reached. `woodCycleTops` walks the cycle from where the pile
  actually stands and `hasReachableMove` asks the question that matters. A move
  three turns down is a move this player has, and telling them they have none was
  simply wrong. `hasLegalMove` still answers "right now, with what is face up" and
  is what highlighting and the bots use; do not swap one for the other.
- Below that, `isStuck` still needs either zero wood or
  `flipsSinceProgress >= ceil(wood.length / step)` - a full cycle without progress.
  **The step is 1 while the host's rescue is on**, so that bar moves with it.
- That flip counter is a closure-scoped `Map` in `createGameStore`, never
  persisted — **it resets to zero on any page reload**.
- Tableau order is Blitz | posts | wood. Wood sits under the right thumb because
  it's the pile touched most, and `src/ui/prefs.ts` lets a device flip the two
  ends (see below). `render.test.ts` pins this order in both the tableau and the
  opponent strip.

### Sizing: what measures what

Both halves of the board measure the space they actually have, and the two
mechanisms are deliberately different.

- The centre grid takes the largest slot that fits in **both axes** (`--fit-w` /
  `--fit-h` in `.game-grid`). That needs `cqh`, which needs
  `container-type: **size**` on `.grid-wrap` — not `inline-size`. Its height is
  definite (`.game` is a fixed `100dvh` grid and this sits in one of its tracks),
  so containing the size costs nothing. `--rows` is passed in from `CenterGrid`
  because CSS cannot count grid rows.
- The tableau sizes to its own row from `--hand-card` on `.game`, fed by `--piles`
  and `--tgap` from `Game.tsx` — the only place that knows how many posts this
  round dealt.
- **The column COUNT is measured too**, in JS: `gridColumns` takes the box a
  `ResizeObserver` on `.grid-wrap` reports and picks the shape that buys the
  biggest slot. The constants it ranks with (gap, caption reserve, card ratio,
  the clamp ceiling) mirror `.game-grid` and are approximations **on purpose** —
  they only rank the candidates against each other, and CSS still does the
  sizing from the real box, so a drift there costs a slightly wrong shape and
  never a wrong size.

**An orderly board's columns are not a layout choice and must never become one.**
`suitForSpace` derives a space's suit from `index % columns`, and that suit is
what `canPlayToSpace` and `centerPlayTxn` enforce; re-shaping the grid would
recolour the board underneath the rule. `gridColumns` returns `orderlyColumns`
before it ever looks at the box, and `render.test.ts` pins that at every box it
is given.

The measurement cannot feed back on itself: `.grid-wrap` is `container-type:
size`, so its own box is fixed by the tracks around it and the grid inside it
cannot push on it. There is still an epsilon on the state write, for sub-pixel
churn while a window is being resized.

**Two traps in there.** `--hand-card` lives on `.game` and NOT on `.tableau-zone`
because **the drag ghost is a sibling of the tableau**, not a child: it cannot
inherit a size it is not inside, and a ghost that does not match the card it came
off is the original iPhone complaint all over again. And the width is derived
arithmetically (`min(100vw, 820px)` minus the safe-area padding) rather than
queried, because a container query on `.game` would mean `contain`, which would
make `.game` the containing block for that same fixed-position ghost.

**The vh cap on the hand (7.5vh) is deliberately mean, and it is the whole balance
of the change.** The wood column is two cards tall, so the tableau row runs about
3.7× the card size and every pixel of it comes off the board. On a tall window the
width term binds and the cap never applies; on a real Safari tab it is what stops
the hand eating the grid.

The 34px reserved for the drop zone's caption is reserved whether or not the
caption is showing: sizing against the leftover would shrink every card the moment
somebody picked one up, which is exactly when they must not move.

### The drag ghost, and iOS viewports

The ghost floated above the finger on two of three iPhones. It is
`position: fixed` driven by `clientX/clientY`; iOS Safari resolves fixed against
the *visual* viewport while pointer coordinates and `getBoundingClientRect()` stay
in the *layout* viewport, and the two part company around an address bar
mid-collapse. `DragGhost` measures where it actually rendered against where the
pointer actually was and translates by the difference (`ghostFix` in
`useDrag.ts`), in a **layout** effect so the corrected position is the first one
painted, re-measuring on `visualViewport` events. On a browser that was already
right the correction is zero. The `translate(-50%, -55%)` lift is intentional —
it keeps the card out from under the thumb.

### Where the OS gets to the swipe first

Two gestures the page never sees, both reported from real tables, and both cost
the player the round they were in.

- **iOS** takes an upward swipe from the bottom edge as "go home" — and the Blitz
  and wood piles sit at the bottom of the screen, which is where a drag begins.
- **Android** takes an inward swipe from either side edge as "back", which from
  the board is the lobby. Wood and Blitz are the two ENDS of the tableau row, so
  whichever way round the player has them (`prefs.ts`), one is against an edge.

**A system edge gesture is not the page's to cancel**, so there is nothing to
prevent and no handler to write: the only defence is keeping the piles out of the
strip the OS is watching. `ui/platform.ts` stamps `data-platform` on `<html>` once
at startup (from `main.tsx`, before the first paint) and `game.css` keys two
custom properties off it — `--tableau-lift` on iOS, `--edge-guard` on Android,
both `0px` everywhere else so a desktop pays nothing.

**`--edge-guard` has to come out of `--hand-w` as well as being padding.** The
five piles size themselves to that width; leave it alone and they would size to a
width they are no longer given, and the outer two would run back under the guard
that exists to keep them clear.

**`--edge-guard` is a FLOOR on the clearance, measured from the screen edge, and
not an offset added to the page padding.** This is the trap the first cut fell
into: the tableau row is **centred**, so a guard expressed as padding to add
moves nothing at all until it exceeds the slack the row already has. A 10px guard
bought exactly 1px — the cards sat 17px from the edge and ended up at 18px, while
the computed style read `padding-inline: 10px` and looked like a success.
**Measure the card rectangles, not the CSS.** Anything here that is not a
clearance a ruler could check on a screenshot is the wrong shape of number, which
is why `--page-l` / `--page-r` are named and the guard is `max()`-ed against
them rather than added to them.

**Android is set to 40dp, the widest its back-gesture inset goes** (the default
is 24dp, but the sensitivity is a system setting the page cannot read, so the
guard is set for the setting that reaches furthest in). Measured, four players:

| | before | after |
|---|---|---|
| 393x851 (home-screen app), card to side edge | 17px | **40px** |
| 393x727 (browser tab), card to side edge | 40px | 40px — already clear |
| 390x844 (iOS app), card to bottom edge | 44px | **54px** |

**It is not free on Android**: the home-screen card goes from 63.8px to 54.6px,
because narrowing a centred row is the only way to move it. The tab row is where
the floor earns its shape — the hand is bound by `7.5vh` there, the row already
had 40px of slack, and the guard costs nothing at all. It only bites in the case
that was actually broken.

`detectPlatform` is pure and tested, because the order of its checks is not
obvious: Android UAs carry "Linux", and **iPadOS 13+ reports itself as a desktop
Mac** — the only thing that gives it away is having a touchscreen at all, hence
`maxTouchPoints > 1` (a Mac with a trackpad can report 1).

**Ten pixels each, and no more.** Both come off the board, and the board is the
half that is hard to aim at.

### Any emoji the app prints needs `EMOJI` after it

`badges.ts` exports `EMOJI` (U+FE0F, VARIATION SELECTOR-16) and every glyph the
app renders is built with it. Without it the glyph is at the mercy of font
fallback: a monochrome outline from an earlier font in the chain wins for any
codepoint that also has a text form, so ⚓ and 😇 came out as **black line
drawings** while 💩 and ⭐ next to them were in full colour. It is redundant for
codepoints that already default to emoji presentation and harmless there, which
is why it goes on all of them rather than on a list somebody has to maintain.

It is not a headless-rendering artifact — it is what any device does whose font
chain offers a text glyph first.

### There is a second, offline app inside this one

`#/keeper` is a scorepad for people playing Dutch Blitz with a real deck. No
room, no account, no network: `src/keeper/` is the model and its localStorage,
and `Keeper.tsx` is the whole interface. It is routed **before** the
`configMissing` gate in `App.tsx` on purpose, so it works in a deployment with no
Firebase config at all.

It reuses the online game rather than copying it. A round is the same
`RoundScore`, which is what lets `ScoreList`, the ranking animation, `nextStats`
and the commentary all work without a card being dealt. The blitzer is inferred
rather than asked for: whoever is entered with an empty Blitz pile, or nobody if
two people are.

**Rounds are timed.** Dealing starts a clock and "Blitz! Count the cards" stops
it, which is what makes the speed remarks work at a table with real cards. A
length under ten seconds or over an hour is discarded rather than recorded
(`believableMs`) — it was a mis-tap or somebody went to lunch. The clock lives in
the saved game, not in component state, so it survives a screen lock, and
`pendingMs` carries a finished round's length between stopping the clock and
entering the numbers. `storage.ts` still reads rounds saved before any of this
existed, when a round was a bare map of scores.

**The badge is the player's identity**, because badges are unique per table and
that avoids inventing ids. It also means changing somebody's badge after a round
is entered would orphan their scores, which is why that is only offered during
setup.

Every localStorage read is guarded twice — `typeof localStorage` for the test
environment, try/catch for Safari in a private window, which throws on write
rather than failing quietly. Losing forty minutes of scores to a screen lock
would be the end of anybody using this, so the game is saved on every change and
resumed on open.

### The score sheets talk, and the rules live in one file

`src/ui/commentary.ts` turns a finished round into up to six remarks; the sheets
rotate them one at a time (`Commentary.tsx`). Adding a line is one `add(...)` call
in there — an id, a priority, two or more phrasings, and who it is about.

Three things about it that are not obvious:

- **No `Math.random`, ever.** The carousel re-renders on a timer, so a random
  phrasing would change mid-rotation, and oxlint's `react(purity)` rule objects to
  it during render anyway. Variants are picked by hashing `id:roundNumber:subject`,
  which means the same situation reads differently next round and never flickers
  within one.
- **`about` is load-bearing.** The rules overlap heavily on whoever had the big
  round, so the final pass drops a remark once *every* player it names has already
  had two. Naming both parties in a rivalry is what lets it survive that pass on
  the strength of the quieter one.
- **Two RTDB fields exist only for this.** `round/duels[loser][winner]` counts
  races (written by the loser, in the same write as the race flash, so the two can
  never disagree) and `round/endedAt` is stamped by `commitScores` to give the
  round a length. `duels` needs its own rules clause — the loser is usually not
  the host — and `endedAt` does not, because only the host writes it.

**`rooms/$code/stats` is the game-long half of it** (`src/game/stats.ts`).
`nextStats` is pure and the host calls it inside `commitScores`, in the same
idempotent write as the scores, so no round can be counted into it twice. It
carries blitz counts, last-place tallies and streaks, race wins and losses, the
fastest blitz and the best and worst round of the game, and the number of full
standstills. `rematch` clears it, because it describes one game.

Two traps that were caught only by playing it:

- **A level table has no bottom.** A round nobody scores in moves everyone by the
  same -20, and awarding the whole room a last place each had all three players on
  a "3 rounds running" losing streak by round three. `nextStats` now skips
  last-place accounting when the lowest total equals the highest, and `basement`
  in the commentary needs a player to be *strictly* lowest before it names them.
- **The round's length is the host's own clock** against a server timestamp: at
  commit time `round/endedAt` is still a sentinel, so the host cannot read it back.
  It is thrown away unless it lands between 3 seconds and 20 minutes, and only the
  game-record lines use it. The per-round "blitzed in Ns" reads
  `endedAt - startedAt`, which is server time at both ends.

---

## Decisions already taken

Everything in this section is **built and in `main`**. It is kept because it says
why each thing is shaped the way it is, not to track work. The playtest requests
were numbered #1–#23 as they were asked for; all are built except **#1 (retired)**
and **#4 (deferred, below)**. The numbers are kept in the headings so older notes
and commit messages still resolve.

### The drop zone and the board _(#8, #3, #21, #23)_

**The whole board area is the drop target, and the grid sits INSIDE it.** That is
the only arrangement that works: `parseDrop` walks *up* from whatever is under the
finger, so a sibling overlay is invisible to `closest()` however it is stacked.
Nesting also made the gaps *between* slots droppable, which they never were. The
dashed "drop here" box it replaced is gone; the grid kept the position it always
had, so nothing moved.

**Watch:** each slot's `onClick` calls `stopPropagation`, because it is inside the
zone's click handler. Without it a tap on a slot also runs `onSnapTap` — harmless
today, since `playTo` clears the selection synchronously and the second call finds
nothing to play, but one refactor away from not being. `render.test.ts` pins the
nesting itself, not a class name.

The zone is invisible at rest and only speaks when it has something to say: a soft
green wash plus a caption while a held card has somewhere to go, and the "no moves
left" note when it has not. The note lives in the zone's second grid row so it
sits at the tableau end and can never land on the grid — which also stopped the
board shifting up the screen the moment somebody got stuck.

- **Amber, not red**, and it was changed to red once and reverted on sight. Two
  tokens, `--warn` (fill) and `--warn-ink` (text), split for exactly the reason
  `--danger` is: dark mode needs the text to lift off the surface while the fill
  stays dark enough to carry white. Being stuck is a state, not an error, and red
  is spoken for — a scoring penalty, and the fill behind the disconnected pill.
- **`min-height`, not a fixed height.** Pinning it removes the growth escape
  hatch, so the copy shortened instead: "No moves left — waiting for the others",
  which fits one line at 360px in both themes. Longer copy still reflows.
- **The two messages can never collide**, so nothing had to be hidden: a stuck
  player has no legal targets, which is precisely when the zone is unlit.

**The grid picks its own shape from the box it has** _(#24, 2026-08-28)_. Four
rows was fixed by design — "height is the scarce axis on a phone" — which is right
on a tall screen and wrong on a short one: a four-player board in a Safari tab
was height-bound at 4×4 with width going spare on both sides. Measured, at 393px:

| | columns | slot |
|---|---|---|
| 851px tall (home-screen app) | 4 | 74.8px |
| 620px tall (Safari tab) | **6** | **51.0px** (44px at four columns) |

Two things follow from it that are deliberate. **The bottom row can be ragged** —
16 spaces at six columns is 6/6/4 — because a bigger card is worth more than a
tidy rectangle; holes are only ever used as a tie-break between shapes within a
pixel of each other. And **two phones at one table may lay the same board out
differently**, which is fine and already true of the rails: the shape is local
presentation, derived per client, and no rule reads it. The one board where it is
NOT free is the orderly one — see the sizing section.

**The corner island** (`.head-btns` / `.corner-btns`) is `--btn-w: 37px`, up from
30 — 20% wider. The extra went into the buttons rather than the gaps, so what grew
is the part a thumb has to hit. Height is unchanged: the head row is `auto` and
growing it would take the space off the board.

### The two edge guards _(#25, #26)_

`--tableau-lift: 10px` on iOS and `--edge-guard: 10px` on Android, both keyed off
`data-platform`. The reasoning, the iPadOS detection and the `--hand-w` trap are
in "Where the OS gets to the swipe first" above, because they are the sort of
thing somebody needs before they touch the tableau row rather than after.

The measurements are up there too, along with why the Android number is 40dp
rather than the 10px first asked for: a centred row swallows padding whole, so
the guard had to become a floor on the clearance, and it is set for the widest
back-gesture sensitivity rather than the default. **Neither has been on a real
phone**: what is proved is the geometry, not that the geometry is enough to stop
the gesture. That needs a thumb.

### Flicking a card at the board _(#27, #28)_

**The gesture is judged on the movement, not on where the finger came off the
glass.** A throw at the board is over long before the pointer is released, and a
fast one ends wherever it ends - short of the board, past the top of it, or on a
pixel the page does not own. Making the card go where it was *aimed* is what lets
a 30px flick place a card 400px away, which is the whole point of a flick.

Three signals, tried in this order (`useDrag.ts`, then the `nearest` branch of
`Game.tsx`):

1. **An explicit pile under the finger wins**, at any speed. That is somebody
   placing a card on a square they chose, and it must not be overruled by how
   fast they got there.
2. **The LINE of the throw** (`throwOf` → `aimedAt`). A flick says a direction
   and nothing dependable about distance, so the card goes to the legal space
   nearest the line of the throw. Aim at nothing and it does nothing - that is
   the wild-flick case, and it is deliberate, or the gesture becomes "shake the
   phone to play a card".
3. **Where they let go**, but only if that point means "the middle": over the
   board, or anywhere above the player's own hand (`[data-hand]`). This is what
   catches a throw that OVERSHOT - aim from a release point past the board points
   back down at it, so the aim finds nothing and the release decides instead.

**The candidates are always the LEGAL spaces**, which is what makes it forgiving
in the way the table asked for: aim at a space that is full, or at a pile this
card cannot follow, and it lands on a playable one rather than coming back.
Nothing is returned while there is anywhere for it to go.

Three things about `throwOf` that are not obvious:

- **It reads the FASTEST stretch in the window, not the average across it.** A
  thumb decelerates before it leaves the glass, so the last 120ms of a real flick
  is its slowest part - averaging it is what made a short flick fail while a long
  drag succeeded, which is exactly how it was reported.
- **`FLICK_MIN_TRAVEL` is checked once over the whole window, never per stretch.**
  Per stretch it discards the short fast ones at the end - the throw itself - and
  leaves only the long slow ones reaching back into the wind-up. That bug was in
  the first cut of this and it made the whole thing look like a threshold problem.
- **`FLICK_MIN_SPEED` (0.3 px/ms) sits nearer a drag than a flick on purpose.** A
  careful drag runs at 100-400px/s and a thumb flick at 1000px/s and up. The
  direction test is what rejects a wild throw; this only has to tell a throw from
  a reposition. `FLICK_MAX_AIM_DEG` (55°) is the other knob, and the only one in
  here that is a matter of feel rather than geometry.

**A cancelled pointer commits the throw.** `pointercancel` fires when the OS takes
the gesture away mid-air - an iOS home swipe, an Android back swipe, a second
finger - and the old handler discarded the drop outright, so the gesture most
likely to be stolen was also the one that silently did nothing. There is no
trustworthy release point in that case, so only signal 2 applies.

Measured against the emulator on both device profiles, with the card and the one
space it can follow rigged into place:

| gesture | result |
|---|---|
| 70px flick aimed at a space 391px away | lands there |
| 30px flick, same target | lands there |
| the same throw stolen by `pointercancel` | lands there |
| 70px flick aimed 90° away | nothing |
| the same 70px at 400ms - a reposition, not a throw | nothing |
| slow drag let go over the opponent strip | lands (signal 3) |

### The bot ladder moved down a rung _(#44)_

Easy was still beating a casual human after two tunings, so the third one moved
the whole ladder rather than nudging numbers: **medium inherited easy's settings,
hard inherited medium's**, and a genuinely feeble easy was written underneath.
**Genius** is new and is about twice the bot Hard used to be.

Effective rate is `delay / (1 - dither)`: easy ~9.2s per action, medium ~4.9s,
hard ~2.3s, genius ~0.5s. `bot.test.ts` pins the ORDER rather than the numbers,
so the next retune cannot put a level out of sequence by accident.

A bot punches above its settings because it never makes an illegal move and never
loses track of the board, so **the only honest handicaps are speed and
attention** - which is why none of the knobs is "plays worse cards".

### A wood turn deals three cards _(#45)_

It used to be one card flipping (`flipKey` on the top card). A turn brings three
cards over, so it now looks like three: `dealt` is the last `WOOD_STEP` face-up
cards, stacked in one grid cell and animated in 70ms apart. **Keyed by card**, so
only the ones that actually just arrived animate - after a short last turn, or a
single-card turn under the host's rescue, the cards already face up hold still and
one card lands on them.

Dropping `flipKey` also removed the static-render artifact it caused: a headless
shot no longer leaves the wood card frozen edge-on at `rotateY(90)`.

### Two small ones _(#46, #47)_

- **`.keep-back` is 44px tall.** It was a bare 13px line - about 20px of target -
  at the bottom of a sheet, which is a long way to reach for something that has to
  be hit exactly. Every other control on this board keeps to the touch floor.
- **Sitting out is a door** (🚪), not `‖`. The armed second tap still reads
  "out?", because that is the one that costs a round.

### What the hourglass means, and what the post piles allow

Two questions from the table, answered here because they will be asked again.

**⏳ beside a player in the opponent strip means STUCK** - the same state your own
board calls "No moves left". It had only a `title`, which a phone never shows, so
it now carries an `aria-label` with the board's own wording.

**Post piles build DOWN only**, and always have: `canBuildOnPost` takes a card one
lower of the other gender and nothing else. Reported as allowing both directions;
it does not, and `rules.test.ts` now pins every rejected case so the claim can be
settled by running the tests. **The likeliest thing behind the report is
`refillPosts`**: when a post empties, the Blitz top drops into it automatically, so
a card of any value can APPEAR on a post pile without anybody having built it
there. That is the rule, not a bug.

Terminology, since it has caused confusion: the **wood pile** is the face-down
draw pile turned over in threes, and the **post piles** are the three (or five, at
two players) build piles between Blitz and wood. The code has always used those
names.

### The round-end sheet _(#29-#34)_

**It is a gate now, the same shape as the lobby.** Everyone says when they have
finished reading their score; the host's button is primary once the table is with
them and **"Next round anyway (n/m ready)"** before that, because a dead phone
must not be able to strand a table between rounds either. Readying also calls
`noteActivity`, which clears an `awayAt` left over from a round somebody sat
quietly through - without that they would ready up and still block their own
count. `startRound` already cleared `ready` for everybody, so the gate re-arms
each round for free.

**"Ready?" then "Ready!"**, on both screens. "I'm Ready" then "Ready" were the
same word twice and nobody could tell which state they were looking at; the colour
was carrying the whole message on its own.

**The rule between the total and the round's arithmetic existed and could not be
seen** - a 1px hairline in `--line`, lost against the row's own border. It is full
height, in ink rather than furniture, with room on both sides. The **blitz bolt**
sits right of the total in a column that is reserved whether or not it holds one,
so the totals stay in a line down the sheet instead of the blitzer's row shunting
left.

**The carousel** dwelt 4.2s at 13px, which read as a slideshow being rushed past
you: 7s at 15px now, with arrows either side. Stepping bumps a counter the timer
depends on, so a manual step **restarts the dwell** - otherwise the next
auto-advance arrives a moment later and snatches back the line somebody just asked
for. Every remark has a third and sharper variant; `pick` hashes
`id:roundNumber:subject`, so the meanest phrasing is a third of the rounds rather
than every round.

### Losing a race you did not know you were in _(#35)_

A race was only ever visible when two plays collided inside one round trip, so the
server could see the abort. Miss by a tenth of a second more and the loser's own
snapshot has already caught up: `canPlayToSpace` refuses locally and **nothing
happens at all** - no scowl, no halo, no sign the race was run. That is the case
the table complained about, because it is the one that feels most unfair.

The store keeps `spaceTouched`: when each centre space last changed hands and to
whom, taken from snapshots because the board only ever says who owns a space *now*
and never when they took it. A play aimed at a space somebody took within
`RACE_GRACE_MS` (1s) is treated as the race it was - the scowl and the shake for
the slower player, and the race reported **once** (`reported`) so jabbing at a
space that has just filled does not report it repeatedly.

The angry face already shook side to side and still does. The angel holds at rest
until nearly half way through and drifts up over the rest of 1.5s: half as long
again on screen, with the extra going into being readable rather than a longer
glide.

### The splash _(#36)_

Ten glyphs at 24px on a 393px screen, gone in 1.15s, read as a drizzle of specks.
Twenty-six at twice the size now, falling over 2.6-3.4s in **two overlapping
passes across the width** rather than one row of lanes - twice the glyphs in one
row of lanes reads as a picket fence. `SPLASH_MS` went to 3.6s to match; every
animation in `ui.css` has to finish inside it, which is the one thing to check
before changing either number.

### Flinging and pale cards default ON _(#37, #38)_

Both are host options and both are the opposite of every other one here in that
absent means **on**. `normalizeRoom` defaults them and `setFling`/`setPaleCards`
write a deliberate `false`, so a room that predates either field gets the feature
and turning it off still survives. `useDrag` takes `fling` and simply does not act
on a throw when it is off - the throw is still read, because reading it costs
nothing and the alternative is two code paths.

### Joining a game in progress _(#39)_

A game in progress used to be a closed door, refused by the client and by the
rules. It admits **spectators**: a player record, no hand, the live board, and
`startRound` deals them in at the next deal. The banner takes the opponent strip's
**place** rather than sitting above it - that row is a fixed track in `.game`'s
grid, so a second thing in it would come straight off the board they are here to
watch - and `.standby-hand` holds the tableau's track open for the same reason.

Two things fell out of it that did not look related, and both are above: the
rules' lobby-only validate had to go **and be deployed**, and `allConnectedStuck`
had to learn about a third kind of absent player.

### A table that has stopped, and the way out _(#40, #41)_

When every present player is stuck the board says so **across itself**, because a
stopped table is a fact about the game and not about one hand. The host is offered
**one card per wood turn** (`meta.singleFlip`), which reaches the two cards in
three the usual cycle never exposes.

**It is a way out, not a mode.** The first card anybody plays clears it
(`endRescue`, called from both play paths), a fresh deal clears it (`startRound`),
and any client may clear it because `meta` is writable by anyone in the room and
the write is idempotent. The overlay is `pointer-events: none` with the button
opted back in, so it can never be the thing that blocks a play.

### The no-moves note stopped moving the board _(#42, #43)_

Its track was `auto`, so it was 0px until there was something to say and then
jumped to its content - which took that height off the row above and slid the
centred grid up **under the player's hands at the exact moment they needed the
board to hold still**. The track is a fixed `--note-h`, declared once on
`.grid-wrap` and used by both the reserve and `--fit-h`'s slot arithmetic so the
two cannot drift. Measured: the grid is at the same top and the same height with
the note and without it. The note itself went 12px to 14px - it was the smallest
type on the screen and carrying the most weight.

### Hints and openings — one switch over two nudges _(#6, #9)_

`meta.hintsOn` is a **host-controlled room option**, not a device preference, and
it covers *both* nudges. Hints are an advantage and bot difficulty was tuned
against a human without them, so everyone plays the same game — and two switches
for "help me a bit" is one more than a lobby full of people wants to argue about.

**The stalled-player hint flashes the destination, not the card.** That is the
opposite of the original request and is the product owner's call: it marks the
space on the grid where *something* of yours could go, and the player still has to
work out which card, find it and drag it there. A nudge towards the board rather
than the move played for them.

- `src/game/hint.ts` reuses the bot's own `botMoves` / `rankMove`, so "best" means
  the same thing to the hint as to a Hard bot — one definition, not two that
  drift. Ties settle on the first space generated, deliberately: an Ace fits every
  empty space at the same rank and the hint must not wander between renders.
- **After `HINT_DELAY_MS` (5s) of no input**, so it never fires under somebody
  playing at speed. The idle counter watches *your* input only, not board changes —
  a fast table would otherwise keep resetting the clock of the one player who has
  actually stalled.
- **Two pulses over `HINT_SHOW_MS` (1s), then gone**, rather than breathing on the
  board until it becomes furniture. The *element* is removed on the timer rather
  than the animation being left to end itself, which is what makes reduced motion
  behave identically — same one-second mark, held steady instead of pulsed.
- **And again every `HINT_REPEAT_MS` (10s)** for as long as the player goes on not
  playing. The repeat is keyed on the player not acting, **never on `stuckAt`** — a
  player with `stuckAt` set has by definition no move to be shown. Measured on at
  4.6s, 14.6s and 24.6s, ~975ms each; any input restarts the cycle.
- **Violet** (`--hint`), never green: green on this board means exactly one thing,
  "the card you are holding lands here", and a second green would erode it.
- **Reduced motion has its own rule.** `MotionConfig reducedMotion="user"` does
  not reach CSS keyframes, so the pulse carries its own `prefers-reduced-motion`
  block. The outline stays; it just stops breathing.

**Confirmed as wanted, do not "fix":** a post-to-post move has no square to point
at, so nothing flashes for it, and early in a round a player with no centre move
gets no hint at all. A genuinely stuck player also gets silence, and the amber note
speaks instead — but the moment somebody else's card opens a move up, the next tick
says so, because the hint is recomputed at render rather than stored.

**The openings glow** (`openings.ts`) rings a space **somebody else just played
to** that this player can use, in the colour of the card now sitting on it. It is
about the CHANGE, not about the board: three things must be true — the top card
actually changed, somebody else put it there, and I hold a visible card that fits.
A standing highlight of every playable space would be the game played for you;
this is "that moved, and it is for you" on a board of up to 32 slots.

The colour is the space's new top card, so it needs no third visual language — not
the green that means "your held card lands here", not the violet hint.
`useOpenings` derives it DURING RENDER off the identity of `round.spaces`
(React's "adjust state when a prop changes" pattern), because a snapshot is
already causing a render and an effect would only be a second one. `enabled` gates
the COMPARISON, not the record of where the board is, so a host turning hints on
mid-round gets openings from the next play onward rather than a burst of
everything that happened while the switch was off.

### The orderly grid _(#5)_

`RoomMeta.orderlyGrid`, a lobby toggle under "Play to", with `CenterSpace.suit`
enforced inside `canPlayToSpace`.

**The starvation worry in the original spec does not survive the arithmetic.**
`spaceCountForPlayers` is `4 × players`, so spaces-per-suit exactly equals
Aces-per-suit: if all four red spaces are busy at four players, all four red Aces
are already down and nobody can be holding a fifth. The one place it *did* bite
was above the old 24-space cap at 7–8 players, and that was fixed by removing the
cap rather than by softening the rule. `rules.test.ts` pins the property, not the
reasoning.

What actually constrained the design was the column count: `gridColumns` is
`max(4, ceil(count/4))`, so a 20-space board is **5 columns**, which cannot be one
colour per column with four suits. Hence **four columns up to 16 spaces, eight
above** (`orderlyColumns`), with adjacent columns paired per suit so eight columns
read as four wide bands rather than a stripe pattern; 2–4 players get exactly the
layout they get anyway. **An orderly board rounds up to a whole number of rows**
(20 → 24, 28 → 32), both of which would otherwise leave holes in the bottom row;
the rounding is stable under its own output so nothing downstream can disagree
about the size.

**The suit lives on the space rather than being derived from its index** because
`centerPlayTxn` is a transaction against `round/spaces/$i` and sees only that one
node — it never learns which index it is. So the constraint has to be *in* the
node, which is why `startRound` writes the spaces for an orderly round (an
ordinary one still leaves them absent for each client to normalize into being).
`normalizeSpaces` fills the suits in client-side too, so a client is never briefly
playing looser rules than the transaction will hold it to.

### The lobby _(#10, #11, #12, #13, #16)_

**A ready gate, then a 3-2-1-GO countdown.** Every human marks ready; bots are
born ready because there is nothing to press them with. `tableReady` (store.ts) is
stricter than "everyone pressed the button": a ready player who is away,
disconnected or sitting out still blocks it, because starting would deal a hand to
somebody not looking at their phone. Every tick re-checks, so un-readying at 2
stops it dead. The host keeps a **"Start anyway (n/m ready)"** override so a dead
phone cannot strand a table; it disappears once the countdown has it.

**The countdown is a DIGIT the host writes (`meta.countdown`), not a deadline
every client races its own clock to** — 3, 2, 1, then 0 which reads "GO!", then
`startRound` clears it in the same write that deals.

**Name, badge and prefs stay editable until ready.** Tap the badge for the grid
with everybody else's greyed out, tap the name to edit; readying closes both,
un-readying re-opens them. **It needed no rules change:** the claim is allowed by
`badges/$badgeId`'s validate against a free badge, and the release is allowed
because RTDB does not run validate on a delete and that node's `.write` is only
`auth != null`. `setIdentity` sends both halves plus the name as ONE atomic
update, which is what makes a race safe: if somebody takes the badge first the
claim fails its validate and the whole update is refused, so the player keeps the
name and badge they already had rather than being left holding neither. Both
halves are pinned against the real rules in `rooms.emu.test.ts`.

**The ready button's three colours are literals, not theme tokens**: the states
have to mean the same thing on both phones at the table whichever way each has its
theme set. It also takes a **2px** border where everything else has 1px, because
in light mode a plain `.btn` is white too.

**A Home/back button out of every dead end**: the lobby, the round-end sheet and
the game-over sheet, the last two because "Waiting for the host…" is a dead end
when the host has pocketed their phone and the overlay covers the screen.
`App.tsx`'s route effect calls `s.leave()` on the way home, so these are plain
`href="#/"` links needing no handler.

**The wood/Blitz side can be pre-set in the lobby.** `useWoodSide` is device-local
`localStorage`, so the lobby reads it as easily as the game does. Deliberately not
disabled for non-hosts and not a room option: it is about the phone in your hand.

### Which side wood and Blitz sit on _(#2)_

`src/ui/prefs.ts` holds it, local to the device and not to the room, because two
players at one table can want opposite answers. The `⇄` in the game head flips it
**mid-game on purpose** — a player who was auto-rejoined never sees a form again,
so pre-join only would have stranded them. **Only the two ends trade places**; the
posts stay put, because moving four positions to fix one costs more muscle memory
than it buys. The opponent strip mirrors it too, so a glance across the table
reads the same way. The order-pinning tests in `render.test.ts` are parameterised
over it rather than deleted.

### Theme and card colour _(#17, #18, #20)_

**The theme toggle has THREE states, not two.** `system` (the default, and what
the app did before the toggle existed) follows the phone including its own switch
at sunset; `light` and `dark` are a choice the device may not override. That is
why `theme.css` has a media query guarded with `:not([data-theme="light"])` PLUS
an attribute rule — neither state can be expressed by the other alone. `system`
writes no attribute at all rather than `data-theme="system"`, so the media query
keeps working while the app is open. The `theme-color` metas are rewritten in JS
because a media query cannot see an override, and left alone Safari paints its
bars for the device's theme while the page paints the player's.

**Where the toggle renders is decided in `App.tsx`, and it must be one place or
the other.** On the board it sits in the head's pill beside the wood swap and the
sit-out button — three controls, one island — and everywhere else it is the only
control on screen, so it gets an identical pill fixed to the corner. `boardUp`
picks between them off `joinPhase` and `meta.phase`; render both and the player
gets two toggles. `.head-btns`, `.corner-btns` and `.side-swap` are defined in
**ui.css, not game.css**, precisely because the corner pill appears on the home
page, the join form, the lobby and the scorepad — none of which import the board's
stylesheet.

**Anything read against the ready button is theme-fixed.** "Start anyway" is a
fixed dark slab with pale text (`.start-anyway`), not `.btn-primary` whose
`--accent` flips near-white in dark and sat under the white ready button as a
second pale slab with nothing to tell them apart — and it is an escape hatch,
which should not out-shout the thing you are meant to press.

**White cards in dark mode** is `meta.paleCards`, a host option applied as a
`.pale-cards` class on the board. Written as the LIGHT values rather than as
literals so the two cannot drift, and applied unconditionally — in a light theme
it is already what they are, so it is a no-op there and needs no knowledge of
which theme is active. Scoped to card faces, backs and slot layers: the slots,
rails and chrome stay dark, which is the point of asking for it. A host option and
not a device preference because it changes how the CARDS read, and two players
describing the same board to each other should be looking at the same thing.

### The score sheets _(#7)_

Rows on both sheets read `🌷 Dave -4 +6 = +2 │ 47`: penalty, cards played, `=`,
the round's delta, then the running total set off by a rule.

- **The `=` sits between the components and the sum, not before the total.** The
  originally requested `-4 +6 2 = 47` asserts "2 = 47", which is false for anyone
  with a prior score. No header row: labels wide enough to read cost more width
  than the numbers they label and squeeze the name below an ellipsis at 360px.
- **The sum is `RoundScore.delta` verbatim**, never recomputed from
  `centerCount`/`blitzLeft`, so it cannot disagree with the total beside it.
  `render.test.ts` feeds a contradicting fixture to pin exactly that.
- **Zero is unsigned and muted** — a blitzer reads `0 +9 = +9`, not `-0`, and the
  danger red is reserved for a real penalty.
- The row lives in `ScoreRow`, shared by both overlays, and takes `score` as
  optional: game over can render from a snapshot with no `round/scores`.
- **Every row is its own grid**, because the row is the card carrying the
  background and border. `auto` columns therefore size to each row's own digits
  and the `=` signs stagger down the sheet, so the value columns are floored at
  `3ch` — exactly three tabular digits, which is every value the game can produce —
  and right-aligned. `minmax` lets anything wider grow rather than clip.
- The name track is `minmax(0, 1fr)` with `text-overflow: ellipsis`, which keeps a
  14-character name from overflowing into a horizontal scrollbar. At 360px a name
  gets about 90px. Widening it means taking width from the arithmetic.
- **`--danger` at 1.9:1 on the dark surface** was barely readable as text, so it
  is two tokens now: `--danger` stays the fill (the disconnected pill needs white
  text on it), `--danger-ink` is the text colour and lifts to `#ff8a7d` in dark.
  `.error` uses it too, so every error message in the app got legible.

**Movement is counted as overtakes, with strict comparisons on both sides.**
Everyone starts on zero, so `rankRows` used to rank the opening standings by
`Object.keys` order — the order players joined in — and reported "dropped 2 places"
after round one. Being level with somebody and then beating them is not a place
gained, and `previous` breaks its ties by the current order so nothing slides
across the sheet either. See `scoreRanks.ts`.

### Home page and the scorepad _(#14, #15)_

The room-code field was `input.field`'s `width: 100%` inside a wrapping `.row`,
which put Join on a line of its own; `.join-row` stops the wrap and lets the field
take what is left after the button — the code is six characters and never needed
the whole row. The scorepad entry sits below the code field and Join, spaced by
`calc(48px - var(--stack-gap))` so the visible gap is exactly one field height.

In the keeper, "In the middle" is "Dutch piles count" (their actual name) and the
Blitz stepper has a coarse `±3` pair outside the fine one — value in the middle,
bigger jump the further the thumb travels, both clamping so `±3` near an end lands
on the end. `.keep-fields` went to ONE column to pay for it: side by side left the
stepper ~160px on a 360px phone, and four 44px buttons around a value do not fit
in that without breaking the touch floor.

### Retired _(#1)_

The wood-pile recycle button was **removed rather than moved** (`8f66869`). It
covered `.card-badge` at every card size and took about two thirds of a small
phone's card width, and the empty draw slot beside it already shows the ↻ and
flips on tap. Moving it right would have put that dead-to-drag zone on the side
the thumb arrives from.

**Watch:** `render.test.ts` asserts `toContain('class="recycle"')` as an exact
substring including the closing quote, so adding any second class to that button
breaks it.

Also retired: the Blitz count that appeared twice per opponent, beside the name
and again in the bubble on the pile. The bubble stays — it is attached to the pile
it counts.

---

## Still open

### Deferred: move a run of cards between post piles _(#4)_

Not being built for now. The spec stands if it comes back.

**It is a house rule, confirmed at the source.** Dutch Blitz's own FAQ says of the
post piles: "You can move one card at a time — you cannot shift entire piles."
(https://dutchblitz.com/pages/policies-faq). The design spec's one-card-at-a-time
wording is therefore correct as written, and shipping this would need a lobby
toggle rather than being a silent change to everyone's game.

Today only the top card of a post pile can move (`placeOnPost`). The request:
tap-and-hold a pile, see its cards in a row, tap which to move, tap a destination.
Questions to settle **before any code**:

- **The wording says "wood piles" but the example describes post piles.** Here
  `wood` is a single face-down draw pile flipped three at a time, with only
  `wood[woodIndex-1]` playable — it cannot hold a run and there is only one of it.
  The descending alternating runs in the example (9,8 and 10,9,8,7,6,5) are post
  piles. **Confirm this reading before starting.**
- **Everyone or nobody.** It cannot be per-player — it's a shared rule.
- **What does "tap which cards to move" mean?** Taking the card at depth k plus
  everything above it (a contiguous suffix) is the only reading that leaves both
  piles legal runs, and the only one under which the given example works.
- **May the whole pile move**, emptying the post so the Blitz top drops into it
  via `refillPosts`? That is the strongest move in the game.
- Trigger at 3+ cards as proposed, or 2+? A 2-card pile is equally movable.

**Watch:** `hasLegalMove` / `isStuck` become *wrong* if not updated with the rule —
`syncStuck` writes stuck claims automatically and three fruitless rotations end
the round, so a player with a legal run move could be declared stuck. The hold
gesture also collides with `useDrag`, which takes pointer capture and shows a
ghost card on pointerdown. And `movePostRun` must not assume a post stack is a
clean run: `reconcileTableau` filters post stacks by centre membership and
`normalizeTableau` returns whatever RTDB holds.

### Worth a decision

- **The black ring on a selected card.** Asked to be removed after it showed up in
  a screenshot, but it is `.card.selected` — the only thing that says which card
  you have tapped, and tap-then-tap-a-target is a whole input path. Left in place
  deliberately. If it is genuinely unwanted, it needs a replacement cue, not a
  deletion.
- **Bots report their lost races too**, so a human beating a bot gets a halo. Bots
  race often; if it turns out too frequent to feel special, gate `reportRace` on
  the loser being human in `driveBot`.
- **Your own wood still shows an empty slot** under the face-down pile before the
  first flip, where an opponent's empty slots are gone. Arguably a target rather
  than a gap — it is where the turned-over card lands.

---

## What still needs testing

Verification is unit tests, emulator tests against the real security rules, and
static render assertions via `react-dom/server` — which catch structure, logic and
wiring, but not layout, legibility, timing or feel. The two recipes below are how
everything else got checked, and they are the reusable part.

### Rendering a component headlessly

Write a throwaway `*.test.ts` that `renderToStaticMarkup`s the component into an
HTML file beside copies of `theme.css` / `ui.css` plus the Outfit `<link>` from
`index.html` (the fallback font is much wider — omit it and the layout reads far
tighter than it is), serve the folder, and shoot it:

```
sudo npx playwright install-deps chromium && npx playwright install chromium
npx playwright screenshot --viewport-size "360,620" --color-scheme dark URL out.png
```

`--device "Pixel 5"` gives a real phone profile at DPR 2.75, which is what to use
for judging legibility. (Device profiles that default to WebKit — the iPhone ones —
need `npx playwright install webkit` first.)

**One artifact to know about:** a static render has no JS, so framer-motion's
`initial` state never animates away. `CardView` sets `initial={{ rotateY: 90 }}`
whenever `flipKey` is passed, which leaves the turned-over wood card frozen
edge-on and invisible. Neutralise it in the harness page, not the component:

```css
.card[style*="rotateY"] { transform: none !important; opacity: 1 !important; }
```

This covers layout, colour and legibility at a known width in both themes. It does
not cover touch or timing — for those, drive the real app.

### Driving the real app

The dev server already points at the emulator, so a scripted browser can create a
room, add bots and play.

```
npm run emu &            # terminal 1
npm run dev &            # terminal 2
npm install --prefix /tmp/pw playwright   # outside the repo: not a dependency of it
```

Then a script under `/tmp/pw` (so node can resolve `playwright`) drives
`http://localhost:5173`: fill "Your name", click a badge by its label, "Create
room", "Add AI player", "Start game", wait for `.game-grid`. `page.mouse.down()`
on a pile and a `move` gives a genuine drag with the ghost attached. Two clients
against one emulator is what proved the away/stall path, the orderly board and the
rules-deploy regression.

**The other half is rigging state directly**, which is what makes end states
reachable in seconds instead of by playing a round out. The emulator's REST API
takes an admin bypass — `Authorization: Bearer owner`, NOT `?auth=owner`, which is
refused:

```
curl -X PUT -H 'authorization: Bearer owner' -d '"roundEnd"' \
  'http://127.0.0.1:9000/rooms/<CODE>/meta/phase.json?ns=demo-blitz-default-rtdb'
```

Write `round/scores` and `players/$uid/score` yourself and the score sheet shows
exactly the movement you want to look at; set `round/blitzedBy` and flip the phase
and the splash fires; write `round/races/$i` and the halo appears. The client
takes it as real data, because it is.

**Watch:** the host client commits scores automatically when the phase turns to
`roundEnd` and `scores` is absent, so write the scores you want FIRST or it will
compute its own from the live round.

**Watch, hardest of all: the bots are playing while you measure**, and they will
fool two different checks in a row if you let them. Counting cards in the
centre before and after a gesture proves nothing - a bot playing inside the same
second is indistinguishable from the thing you were testing, and it read as a
pass twice before it was noticed. Every card carries its owner's badge, so count
only the ones bearing YOUR glyph:

```js
[...document.querySelectorAll('.game-grid .card')]
  .filter(c => c.querySelector('.card-badge')?.textContent.trim() === myGlyph).length
```

The badge alone is not enough either, and neither is the card's value. Every
player holds their OWN copy of every card, so a bot can legally play the same
number onto the same space a moment after you do - and `badgeOf` falls back to
**your** badge for an owner who is not a player, so a card rigged in with a made
up owner renders as yours. Both of those read as a pass. Check the value AND the
badge, and rig with a real player's uid:

```js
const c = document.querySelector('[data-drop="space:4"] .card');
({ v: +c.querySelector('.card-v').textContent, badge: c.querySelector('.card-badge').textContent })
```

If a measurement cannot tell your own action apart from a bot's, it is not a
measurement - and a bot taking the rigged space first makes a trial inconclusive
rather than failed, so a single red run is worth repeating before believing.

### Check the URL first if something looks broken

**GitHub does not redirect Pages for a renamed repo.** Verified: the old
`/flemish-fury/` path returns a bare 404 with no redirect. A browser holding the
*old* cached `index.html` renders a **blank page**, because that shell points at
`/flemish-fury/assets/*`. Blank page ⇒ check the URL and hard-refresh before
assuming a code fault.

### Never actually played

- A full round to completion on the new board — blitz call, scoring overlay, next
  round, rematch.
- **AI players end to end.** The bot loop has only run against fake deps and fake
  timers. Whether a bot's blitz announces correctly and whether host transfer
  hands bots over cleanly are both unknown. Difficulty was retuned on 2026-08-25
  after Easy beat a casual human; whether Easy is now beatable *without being
  inert* is unverified.
- The all-stuck path **with bots in the room**. It has been driven for real with
  two human clients (stuck player, away player, three rotations, `blitzedBy: null`
  round end), but a two-bot table now reaches a normal blitz rather than the stall
  path, so that repro stopped reaching it.
- The drop zone by touch drag, and by tap.
- **The stall overlay and the single-card rescue on a real table** (#40, #41). The
  overlay cannot be rigged into view from outside: writing `stuckAt` for everybody
  is undone by `syncStuck` on the next snapshot, correctly, because those hands
  are not actually stuck. It needs a genuinely deadlocked board, which means
  rigging every hand and the whole centre - or a real table.
- **The 1-second race window** (#35) with two humans racing for real. The path is
  exercised, but the timing that makes it fire is a human timing.
- **The flick on real glass** (#27, #28). Driven and measured on both device
  profiles in headless Chromium, which is neither Safari nor a thumb. Note that
  `page.mouse` CANNOT express a flick at all - one CDP round trip per move puts
  its fastest gesture at about 0.3px/ms, which is a slow drag - so the gestures
  are dispatched from inside the page where the pacing is real milliseconds. Any
  future test of this has to do the same or it will measure the driver.
- Wood recycle: the `↻` empty draw slot.
- One-tap join from the home page, including the badge-taken fallback.
- Opponent strip mini-cards updating live.
- Sitting out and rejoining a round in progress, by a human on a phone.
- **Whether ten pixels is actually enough** to keep a drag out of the iOS home
  swipe and the Android back swipe (#25, #26). The geometry is measured; only a
  real thumb on a real phone can say whether it works, and it is the one thing
  here that cannot be checked headlessly at all.
- The re-shaped grid on a real short screen — six columns with a ragged bottom
  row has only been seen in a headless Chromium.
- `aspect-ratio: 2.5 / 3.5` on a **wide window** specifically — the phone shots
  cannot show the old `--card-h` bug, which was invisible at 360px because both
  values clamped to the same number.
- Five to eight players at a real table, and several bots at once with a low-end
  phone as host — every bot turn runs there.

### Reconnecting after backgrounding

Reported and fixed blind on 2026-08-25; still needs the test that found it —
switching apps mid-game and coming back. Three separate faults were on that path:

- `Join`'s auto-resume swallowed any throw with `resuming` still true, leaving the
  screen on "Rejoining…" for good. Now surfaces a Try again button and retries on
  the offline → online edge.
- `enterRoom` / `hostRoom` let rejections escape with `joinPhase` still
  `'joining'`, disabling every join button permanently. Both now land on
  `joinError: 'offline'`. Covered by tests.
- Nothing nudged the SDK. A `visibilitychange` handler now calls
  `goOffline`/`goOnline` on return and again 2.5s later, **only while `online` is
  false** so it cannot flap presence for others.

The nudge in particular is unverifiable from here — it depends on how a real mobile
browser freezes and thaws a tab. **If it still fails, the diagnostic is which
screen you land on:** "Reconnecting…" means the resume path failed; the dimmed
board with the "reconnecting…" pill means the socket is still down; the join form
means the anonymous identity was lost, which is a different bug.

In a 1-human + 1-bot game you are the only client, so while you are away the whole
game is frozen, including the bot. That is inherent to a serverless design.

**A related known gap:** a phone that locks hard freezes its timers, so that client
cannot mark itself away either. In practice it drops the socket and `connected`
catches it — but if the idle-table hang reappears with a locked phone on the table,
that is where to look.

### What iPhone Safari has not covered

It has been opened once (2026-08-27, three phones), which is where the drag-ghost
offset came from. That session did NOT cover: the ghost's new self-correction,
written afterwards and so far only proved on a browser that never needed it;
address-bar behaviour during a drag; and the "no moves" note, which needs a player
genuinely stuck to appear. Nor has anything since 2026-08-27 been on real glass at
all — the sizing rebalance, sitting out, the theme toggle and the ready gate have
only been driven headlessly.

Spec §7 touch acceptance is also still unconfirmed on a phone: no pull-to-refresh,
no rubber-band scroll, no double-tap zoom, no text selection while dragging. So is
the ledgered pointer-capture re-select check on mouse drags.

---

## Known gaps, not blocking

- Test counts are quoted in the header of this file and nowhere else, because
  they drifted three separate ways when they lived in four places. If you add
  tests, update that one line or delete the number.
- Bundle is one 586 kB chunk, over Vite's 500 kB warning threshold. No code-split.
- `oxlint` reports 7 warnings, all `react(only-export-components)` fast-refresh
  hints plus two pre-existing `RoomScreen` warnings. Zero errors.
- ShareInvite clipboard try/catch; rejection-shake remounts the tableau;
  room-code collision check on create; kite/bell badge hues sit near suit
  blue/red; host transfer disabled in lobby (deliberate).
- A bot's `connected` flag is never cleared. Harmless today because
  `pickNextHost` filters bots, but worth knowing.

---

## History

`1529330` was the rename to Deutsch Dash. Everything since is playtest-driven:

| | |
|---|---|
| `1f01070` | AI players, board rework, automatic stuck detection, one-tap join |
| `a1eb202` | Drag-ghost offset fix, deeper pile peek, taller drop band |
| `17d766a` | All three bot levels slowed; fixed a 16%-flaky test |
| `3f030ea` | Reconnect-after-backgrounding fixes; washroom-sign redraw |
| `6a0836f` | Larger figures on the gender plates; bot-cannot-be-host test |
| `d1c85b4` | Swapped wood and Blitz — wood to the right thumb |
| `26ff306` | This handoff, rewritten around pending work and the landmines |
| `6abe8bd` | CI runs the rules tests; guard so that cannot silently regress |
| `7803a44` | Race flashes — who won a contested space, told by the loser |
| `18d57d1` | The score sheet plays the change in standings out |
| `4fdd258` | Blitz splash: glitter for the winner, worse for the worst round |
| `58ebb3f` | How to drive the real app, and what doing it proved |
| `77bafc1` | The board rendered at last; most of the never-rendered list closed |
| `05516a8` → `cdd986e` | The score sheets talk: commentary, per-game stats, no repeats |
| `b38da9b` | Round arithmetic on the score rows; `--danger-ink` for dark mode |
| `5d7039d` | `#/keeper` — a scorepad for a game played with a real deck |
| `92f57d0` | The keeper's round timer; the wood/Blitz side picker |
| `034e313` | The idle-table hang, fixed as presence: `awayAt` |
| `db81ee0` | Stuck alert into the drop band; orderly grid; helper hint |
| `8bdc017` | Away in the opponent strip; 32 spaces; the hint stops nagging |
| `d33f3c4` | Rails off the screen edge at 7-8 players; the hint returns |
| `282569b` | The first iPhone playtest: six faults, and the rules deploy that was not |
| `e01a847` → `a66ebad` | Home page, the exits, the ready gate, the whole board a drop zone |
| `f9dbeb8` | A theme toggle, sitting out, white cards, and a fixed Start anyway |
| `73ba576` | The three head controls gathered onto one pill |
| `cc72076` | Cards sized to the board they have; a sat-out round can be rejoined |
| `650821f` | This handoff, consolidated around why rather than when |
| `9d72d8b` | Columns from the shape of the box; the iOS and Android edge guards |
| `7a90afc` | The Android edge guard raised to 40dp, the widest the gesture reaches |
| `01a4e99` | Flicking a card at the board, judged on the throw and not the release |
| `8ed3a45` → `94569c5` | The round-end gate, the near-miss race, spectators, and the wood-cycle stuck rule |
| `84da728` | The bot ladder down a rung, Genius, and a wood turn that deals three |
| `64e2c7c` | A version at the foot of the home and lobby screens |
| `1b28628` | The version as v1.2.41, derived from two counters |
| `c7a1da9` | The flick aimed by direction; the whole space above the hand |

Earlier history, the approved design spec and the original 15-task execution
ledger are in `docs/superpowers/`.
