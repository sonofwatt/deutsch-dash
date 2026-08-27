# Project Handoff — Deutsch Dash

_Last updated: 2026-08-27, with the away-presence fix, the last three playtest
requests (#3, #5, #6), the round of tweaks that followed them, and the README
caught up to the host options. Working tree
clean, CI green including the emulator suite. Note that `92f57d0` sat unpushed
for a day, so anything it changed - the keeper's round timer, the wood/Blitz side
picker - was "built" but not live; check `git status -sb` before trusting a
playtest._

_**282 tests green** (260 unit + 22 emulator). This is the only place in the repo
that quotes a count — it drifted three separate ways when it lived in four
places, so keep it here and nowhere else._

A mobile-first multiplayer Dutch Blitz game for 2–8 players, plus AI opponents.
Host creates a room, texts the invite link, everyone plays in their phone
browser. React + Firebase Realtime Database, static hosting on GitHub Pages,
anonymous auth. No server of our own.

- **Live:** https://sonofwatt.github.io/deutsch-dash/
- **Repo:** `sonofwatt/deutsch-dash`, deploys from `main` via GitHub Actions
- **Firebase project:** `holland-hustle` (id is immutable, never shown to players)

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
props optional, or update that file in the same commit. Four of the seven pending
features below hit this.

**There is no DOM anywhere in the test suite.** `vite.config.ts` sets
`environment: 'node'`, so `localStorage` is undefined. **Any `localStorage` read
at module scope throws at import time**, and because `src/state/store.ts` builds
the `gameStore` singleton at module scope, that failure takes out every store
test at once. Hydrate preferences inside a component (as `Home.tsx` and
`Join.tsx` already do) or guard with `typeof localStorage !== 'undefined'`.
Also: `include` is `src/**/*.test.ts`, so a test file named `.test.tsx` is
silently never collected.

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
(`believableMs`) - it was a mis-tap or somebody went to lunch. The clock lives in
the saved game, not in component state, so it survives a screen lock, and
`pendingMs` carries a finished round's length between stopping the clock and
entering the numbers. `storage.ts` still reads rounds saved before any of this
existed, when a round was a bare map of scores.

**The badge is the player's identity**, because badges are unique per table and
that avoids inventing ids. It also means changing somebody's badge after a round
is entered would orphan their scores, which is why that is only offered during
setup.

Every localStorage read is guarded twice - `typeof localStorage` for the test
environment, try/catch for Safari in a private window, which throws on write
rather than failing quietly. Losing forty minutes of scores to a screen lock
would be the end of anybody using this, so the game is saved on every change and
resumed on open.

### The score sheets talk, and the rules live in one file

`src/ui/commentary.ts` turns a finished round into up to six remarks; the sheets
rotate them one at a time (`Commentary.tsx`). Adding a line is one `add(...)` call
in there - an id, a priority, two or more phrasings, and who it is about.

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
  round a length. `duels` needs its own rules clause - the loser is usually not
  the host - and `endedAt` does not, because only the host writes it.

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

### Any emoji the app prints needs `EMOJI` after it

`badges.ts` exports `EMOJI` (U+FE0F, VARIATION SELECTOR-16) and every glyph the
app renders is built with it. Without it the glyph is at the mercy of font
fallback: a monochrome outline from an earlier font in the chain wins for any
codepoint that also has a text form, so ⚓ and 😇 came out as **black line
drawings** while 💩 and ⭐ next to them were in full colour. It is redundant for
codepoints that already default to emoji presentation and harmless there, which
is why it goes on all of them rather than on a list somebody has to maintain.

Reproduced and fixed on 2026-08-26 after it showed up in a screenshot. It is not
a headless-rendering artifact — it is what any device does whose font chain
offers a text glyph first.

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
into a red build. Both are in the workflow. This has run green on a real runner —
the `npm run test:emu` step is in the job's step list with a `success`
conclusion, not merely an overall green tick.

`src/net/emulatorCoverage.test.ts` guards it. It reads the workflow rather than
checking env vars, deliberately: an env check only fails in the environment that
already broke, whereas this goes red in **any** run — local, CI, a contributor's
laptop — the moment the two drift apart. Verified by deleting the CI step and
watching `npm test` fail on it, then restoring it. It also pins that the emu
suites still gate on `EMULATOR`, so if that changes, the reasoning behind the CI
step gets revisited rather than quietly rotting.

Locally, `npm test` skipping the rules tests is still fine and intended — but run
`test:emu` before pushing anything touching `src/net/` or the rules.

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
- **Editing `database.rules.json` is half the job. Deploying it is the other
  half:** `npx firebase deploy --only database`. Nothing here can tell you that
  you have not — the emulator always loads the file from disk, so the whole suite
  passes against rules the live database has never seen. A missing grant does not
  fail visibly either: because a multi-path `update()` is atomic, one denied node
  takes down every other path in the same write, and RTDB shows the writer a
  local copy of the write before the server refuses it, so the client that made
  it is the one client that appears to be fine. This has already cost one whole
  playtest — see "The first iPhone playtest".

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
- **Three separate things write `players/$uid`, from three places.** `startPresence`
  owns `connected` through `onDisconnect`, `syncStuck` owns `stuckAt`, and the away
  timer owns `awayAt`. Keep them apart: expressing "away" by writing
  `connected: false` in particular would fight the `onDisconnect` handler and make
  a present player look gone to the host watchdog.
- **`allConnectedStuck` being true no longer implies *you* are stuck.** It skips
  away players, so an away client can see it true while having moves of its own.
  Anything gated on it needs to say what it wants about the caller explicitly —
  that implication going unnoticed is what would have left the original hang
  unfixed (see the idle-table hang under Pending work).
- Tests must build a store with `createGameStore(fakeDeps)` and never touch the
  exported `gameStore` singleton — importing it executes Firebase module side
  effects.

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
  and broke that at seven and eight players - survivable on an ordinary board,
  fatal on an orderly one, which cannot lend one suit's space to another. Eight
  players now get 32 spaces at 8 × 4, and the finished-pile rails get out of the
  way to pay for them (see below).
- **`ENABLE_STUCK_BUTTON` is `false`** and the whole stuck path still runs
  underneath. Being stuck is *detected* by `isStuck` + `syncStuck`, not declared.
  `isStuck` needs more than "no legal move": either zero wood, or
  `flipsSinceProgress >= ceil(wood.length / 3)`.
- That flip counter is a closure-scoped `Map` in `createGameStore`, never
  persisted — **it resets to zero on any page reload**.
- **`canPlayToSpace` is the single definition of "can this land here"**, and the
  orderly-grid suit constraint lives inside it for that reason. Anything that adds
  a rule about the centre goes there, or highlighting, `hasLegalMove`, `isStuck`,
  the bots, the hint and `centerPlayTxn` start disagreeing - and a player gets
  declared stuck holding a move they can see.
- **`centerPlayTxn` spreads the space it was given straight back into RTDB.** Two
  consequences: never put an `undefined` on a `CenterSpace` (RTDB rejects the whole
  write), and never rebuild the space from scratch in the archive branch or its
  suit goes with it.
- Tableau order is Blitz | posts | wood. Wood sits under the right thumb because
  it's the pile touched most. `render.test.ts` pins this order in both the
  tableau and the opponent strip.

---

## Pending work

The first three-humans-on-iPhones playtest happened on 2026-08-27, on a build
older than `92f57d0`. It produced six faults (all now fixed - see "The first
iPhone playtest" below) and nine feature requests, **all nine of which are now
built**. Every one has been driven in a real browser against the emulator; none
has been played by humans. The notes below are kept because they say WHY each
one is shaped the way it is, and one of them (#9) carries an open question worth
settling at the next table.

The seven requests from the earlier rounds are all settled: **#1 retired**,
**#4 deferred**, and **#2, #3, #5, #6, #7 built**. Numbering is kept as-is so
earlier notes still point at the right item, and the new batch starts at #8.

### The first iPhone playtest — _six faults, all fixed 2026-08-27_

Three humans on iPhones, Safari, on a build older than `92f57d0`. Read this
before touching the score commit or the drag ghost.

**The big one: a rules deploy that never happened.** Two of the six reports - "only
the host sees the round score sheet" and "everyone else is stuck on 0 pts" - were
one fault, and it was not in the client at all. `stats` gained its own `.write`
grant in `a93e7d2` (2026-08-26); the live database was still serving rules from
before that commit. `commitScores` sent `round/scores`, every player's total, and
`stats` as **one multi-path update**, a multi-path update is atomic, so the denied
stats write rejected the entire round.

What that looks like from the outside is worth knowing, because none of it points
at permissions:

- The **host sees a score sheet** anyway. RTDB applies a write to the local cache
  and raises `onValue` locally before the server has answered it.
- The rejection then rolls that write back, which raises **another** snapshot,
  which had `!room.round.scores` true again, which re-entered `commitScores`. A
  denied write every ~13ms for as long as the round was on screen.
- The host's own header total therefore showed **that round's delta, not a running
  total** - the previous round's total had been rolled back too. The playtest
  reported 14, then 2, then 0. Those were three round scores.
- Every other client saw **nothing**: no sheet (`RoundEndOverlay` renders null
  without `round.scores`) and a permanent 0.

Reproduced end to end by pointing three real browser clients at the emulator
running `git show a93e7d2^:database.rules.json`, and confirmed fixed the same way.

**So: after ANY change to `database.rules.json`, run
`npx firebase deploy --only database`.** Nothing in the repo can detect that you
have not. The emulator suite always loads the file from disk and will pass
happily against rules the live database has never seen. Two other grants landed
the same day and have the same exposure if the deploy was skipped: `races`
(`7803a44`) and `duels` (`05516a8`), which together make race flashes and the
rivalry commentary silently vanish.

Three things changed in the code so this cannot bite that hard again:

- **Stats are a second, separate, best-effort write** (`commitScores`). They are
  commentary material; the scores are the game. Nothing that only decorates a
  round can lose it again. `plays.emu.test.ts` pins the separation by asserting
  there is a snapshot where the scores exist and the stats do not.
- **The commit is attempted once per round, not once per snapshot** (`store.ts`,
  `commitFailedFor`), so a rejection cannot loop. Cleared on reconnect, because
  offline is the one cause a retry fixes.
- **A refused commit is shown**, on the game screen as well as the sheet - the
  write most likely to fail is the one that builds the sheet, so the sheet is not
  there to carry its own error.

**The other four:**

- **The drag ghost floated above the finger on two of three iPhones.** The ghost is
  `position: fixed` driven by `clientX/clientY`; iOS Safari resolves fixed against
  the *visual* viewport while pointer coordinates and `getBoundingClientRect()`
  stay in the *layout* viewport, and the two part company around an address bar
  mid-collapse. `DragGhost` now measures where it actually rendered against where
  the pointer actually was and translates by the difference (`ghostFix` in
  `useDrag.ts`), in a **layout** effect so the corrected position is the first one
  painted. It re-measures on `visualViewport` events. On a browser that was
  already right the correction is zero - verified in Chromium, ghost centre dead
  on the pointer.
- **"Dropped 2 places" after round one.** Everyone starts on zero, so `rankRows`
  was ranking the opening standings by `Object.keys` order - the order players
  joined the room in. Movement is now counted as **overtakes with strict
  comparisons on both sides**, so being level with somebody and then beating them
  is not a place gained, and `previous` breaks its ties by the current order so
  nothing slides across the sheet either. See `scoreRanks.ts`.
- **The "no moves" note.** The move into the drop band had already landed in
  `db81ee0`, after the build they played, so this one was reported against code
  that no longer existed. The request also asked for the band to turn red; it was
  changed and then reverted on sight, and it stays amber - red on this board means
  "that did not work", and having nothing to play is not the player's error.
- **The Blitz count appeared twice per opponent** - beside the name and again in
  the bubble on the pile. The bubble stays: it is attached to the pile it counts.

### Requested 2026-08-27 — all built

Taken down verbatim in intent, and kept here with what each one turned out to
collide with. Listed in the order they were asked for, which was not the order
they were built in: #10/#14/#15/#16 first (self-contained), then #11/#12/#13 as
one lobby overhaul, then #8/#9 as one board change.

**#8. Retire the drop band; make the whole gap the drop zone.** — _built 2026-08-27._ The dashed box captioned "drop here" is gone. The
whole board area is the target now, and the grid sits INSIDE it - which is the
only arrangement that works, because `parseDrop` walks *up* from whatever is
under the finger, so a sibling overlay is invisible to `closest()` however it is
stacked. Nesting it also made the gaps *between* slots droppable, which they
never were.

The grid keeps the position it always had (centred), so nothing moved. The zone
is invisible at rest and only speaks when it has something to say: a soft green
wash plus a caption while a held card has somewhere to go, and the stuck note -
still amber - when it has not. The note is in the zone's second grid row so it
sits at the tableau end and can never land on the grid.

**Watch:** each slot's `onClick` now calls `stopPropagation`, because it is
inside the zone's click handler. Without it a tap on a slot also ran `onSnapTap`.
That was harmless in practice - `playTo` clears the selection synchronously, so
the second call finds nothing to play - but it is one refactor away from not
being. `render.test.ts` pins the nesting itself, not a class name.

**#9. Glow a playable space in the card's own colour.** — _built 2026-08-27._ A space somebody else just played to, that this
player can use, gets a ring in the colour of the card now sitting on it. See
`openings.ts`.

**It is about the CHANGE, not about the board.** Three things all have to be
true: the top card actually changed, somebody else put it there, and I hold a
visible card that fits. A standing highlight of every playable space would be
the game played for you; this is "that moved, and it is for you" on a board of
up to 32 slots where a card landing is genuinely easy to miss.

The colour is the space's new top card, so it needs no third visual language -
it is not the green that means "the card in your hand lands here" and not the
violet hint. `useOpenings` derives it DURING RENDER off the identity of
`round.spaces` (React's "adjust state when a prop changes" pattern), because a
snapshot is already causing a render and an effect would only be a second one.

**Open question for the next playtest:** it is NOT gated behind `meta.hintsOn`,
unlike the helper hint. Bot difficulty was tuned against a human without hints,
and this is an advantage even if a small and passive one. Gating it is a
one-line change if it reads as too strong.

**#10. A Home/back button out of every dead end.** — _built 2026-08-27._ The Join
screen already had one. Added to the lobby, the round-end sheet and the game-over
sheet - the last two because "Waiting for the host…" is a dead end when the host
has pocketed their phone, and the overlay covers the screen so there was nothing
else to reach for. `App.tsx`'s route effect calls `s.leave()` on the way home, so
these are plain `href="#/"` links and need no handler.

**#11. A ready gate in the lobby, then a 3-2-1-GO countdown.** — _built 2026-08-27._ Every human marks ready; bots are born ready
because there is nothing to press them with. When the table is ready the host's
client counts it down and deals.

**The countdown is a DIGIT the host writes (`meta.countdown`), not a deadline
every client races its own clock to.** Two phones do not agree on the time - the
same reason `awayAt` is only ever tested against null - so the host's timer is
the single clock and everyone else renders whatever number is currently in
there. 3, 2, 1, then 0 which reads "GO!", then `startRound` clears it in the
same write that deals.

`tableReady` (store.ts) is the gate, and it is stricter than "everyone pressed
the button": a ready player who is away or disconnected still blocks it, because
starting would deal a hand to somebody not looking at their phone. Every tick
re-checks, so un-readying at 2 stops it dead. The host keeps a **"Start anyway
(n/m ready)"** override so a dead phone cannot strand a table; it disappears
entirely once the countdown has it.

**#12. Editable name, badge and prefs in the lobby until ready.** — _built 2026-08-27._ Tap the badge for the grid with everybody
else's greyed out, tap the name to edit it; readying closes both, un-readying
re-opens them.

**It needed no rules change after all** - the note here used to say it did. The
claim is allowed by `badges/$badgeId`'s validate against a free badge, and the
RELEASE is allowed because **RTDB does not run validate rules on a delete** and
that node's `.write` is only `auth != null`. `setIdentity` sends both halves plus
the name as ONE atomic update, which is also what makes a race safe: if somebody
takes the badge first the claim fails its validate and the whole update is
refused, so the player keeps the name and badge they already had rather than
being left holding neither. Both halves are pinned against the real rules in
`rooms.emu.test.ts`.

**#13. Ready button states.** — _built 2026-08-27._ `awayAt` already existed and is already written
by the player's own client, but during a round it means "45 seconds of no input"
(`AWAY_MS`). In the lobby it means **the tab is hidden**, which the browser says
instantly - so `noteVisible` owns it there and the idle timer owns it in a round.
They never run at once, so the field still has exactly one writer per phase. The
three colours are literals rather than theme tokens: the states have to mean the
same thing on both phones at the table whichever way each has its theme set.

**#14. Home page: shrink the room-code field so Join fits on its line.** — _built 2026-08-27._ The code field was `input.field`'s `width: 100%` inside a
wrapping `.row`, which put Join on a line of its own. `.join-row` stops the wrap
and lets the field take what is left after the button - the code is six
characters and never needed the whole row.

**#15. Home page: move and rework the meat-space scorepad entry.** — _built 2026-08-27._ Moved below the code field and Join, spaced down by
`calc(48px - var(--stack-gap))` so the visible gap is exactly one field height,
and renamed. In the keeper, "In the middle" is now "Dutch piles count" (their
actual name) and the Blitz stepper gained a coarse `±3` pair outside the fine
one - value in the middle, bigger jump the further the thumb travels. Both clamp,
so `±3` near an end lands on the end. `.keep-fields` went to ONE column to pay
for it: side by side left the stepper ~160px on a 360px phone, and four 44px
buttons around a value do not fit in that without breaking the touch floor.

**#16. Pre-set the wood/Blitz side in the lobby.** — _built 2026-08-27._ `useWoodSide` is device-local `localStorage`, so the
lobby reads it as easily as the game does. Deliberately not disabled for
non-hosts and not a room option: it is about the phone in your hand. The board's
`⇄` stays exactly as it was.

---

## What still needs testing

**Most of the last three passes has never been rendered in a browser.**
Verification is unit tests, emulator tests against the real security rules, and
static render assertions via `react-dom/server` — which catch structure, logic and
wiring, but not layout, legibility, timing or feel.

**A component can be rendered headlessly, though**, which is how the score row's
column alignment and its dark-mode red were caught. Write a throwaway
`*.test.ts` that `renderToStaticMarkup`s the component into an HTML file beside
copies of `theme.css` / `ui.css` plus the Outfit `<link>` from `index.html` (the
fallback font is much wider — omit it and the layout reads far tighter than it
is), serve the folder, and shoot it:

```
sudo npx playwright install-deps chromium && npx playwright install chromium
npx playwright screenshot --viewport-size "360,620" --color-scheme dark URL out.png
```

`--device "Pixel 5"` gives a real phone profile at DPR 2.75, which is what to use
for judging legibility. (Device profiles that default to WebKit — the iPhone ones
— need `npx playwright install webkit` first.)

**One artifact to know about:** a static render has no JS, so framer-motion's
`initial` state never animates away. `CardView` sets `initial={{ rotateY: 90 }}`
whenever `flipKey` is passed, which leaves the turned-over wood card frozen
edge-on and invisible. Neutralise it in the harness page, not the component:

```css
.card[style*="rotateY"] { transform: none !important; opacity: 1 !important; }
```

This covers layout, colour and legibility at a known width in both themes. It does
not cover touch or timing — for those, drive the real app.

### Driving the real app (this is how the untestable things got tested)

The static harness renders a component with state you hand it. It cannot show a
transition, a pointer, or an animation that only fires when data changes. Running
the actual app can, and it is not much harder: the dev server already points at
the emulator, so a scripted browser can create a room, add bots and play.

```
npm run emu &            # terminal 1
npm run dev &            # terminal 2
npm install --prefix /tmp/pw playwright   # outside the repo: not a dependency of it
```

Then a script under `/tmp/pw` (so node can resolve `playwright`) drives
`http://localhost:5173`: fill "Your name", click a badge by its label, "Create
room", "Add AI player", "Start game", wait for `.game-grid`. `page.mouse.down()`
on a pile and a `move` gives a genuine drag with the ghost attached.

**The other half is rigging state directly**, which is what makes end states
reachable in seconds instead of by playing a round out. The emulator's REST API
takes an admin bypass — `Authorization: Bearer owner`, NOT `?auth=owner`, which
is refused:

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

### Check the URL first if something looks broken

**GitHub does not redirect Pages for a renamed repo.** Verified: the old
`/flemish-fury/` path returns a bare 404 with no redirect. A browser holding the
*old* cached `index.html` renders a **blank page**, because that shell points at
`/flemish-fury/assets/*`. Blank page ⇒ check the URL and hard-refresh before
assuming a code fault.

### Never rendered

The board itself now has been, headlessly, at 360×800 and on a Pixel 5 profile,
4-player and 8-player, light and dark (2026-08-26). That closed most of this list:

- ~~Container-query grid sizing~~ — correct at four and at six columns.
- ~~`color-mix()` in rail chips, card backs and finished-pile tints~~ — all render.
- ~~Pile-depth peek layers~~ — visible under blitz, posts and wood.
- ~~The washroom plates~~ — the plate reads at ~47px and the skirt silhouette is
  unmistakable against the boy's. At a *zoom* of a 2.75x shot, note; on glass at
  8mm it is still an open question.
- ~~Dark mode across every new surface~~ — rails, snap band, AI tag, selection
  ring and every card face all hold up. This is also where the `--danger` fix
  came from.
- ~~**The 44px card floor at 24 spaces / six columns**~~ — **it fits, and not
  narrowly.** 24 spaces at six columns lands the slot on `--card-w` (~43px at
  360px wide), never on the 34px floor, with roughly 30px of width to spare. The
  "about 3px of slack" arithmetic was pessimistic.

Still unrendered:

- `aspect-ratio: 2.5 / 3.5` on a **wide window** specifically — the phone shots
  cannot show the old `--card-h` bug, which was invisible at 360px because both
  values clamped to the same number.
- ~~Drag ghost tracking the cursor~~ — **verified in the real app.** Ghost centre
  landed 4px above the pointer at a 393px viewport, which is exactly the intended
  `translate(-50%, -55%)` lift that keeps the card out from under the thumb. The
  `left: 0; top: 0` fix holds.

### Verified in the real app on 2026-08-27

Two browser clients against the emulator, under the real rules. The three new
features, at 393px in **both themes**:

- The orderly board in four tinted columns, and the tint reading on an *empty*
  slot - which is the only place it matters, since a card that has landed carries
  its own colour.
- The hint appearing after five quiet seconds on the space the best move lands in,
  clearing on the next tap, and coming back five seconds later.
- The amber "no moves left" band, with nothing left under the tableau and no board
  shift when it appears. `--warn-ink` at #fbbf24 reads well on the dark surface -
  the check that `--danger` originally failed.

Then, after the tweaks:

- **A full eight-player board, measured rather than guessed.** 32 slots at 8 x 4,
  no overflow in either axis. Rows do not change (a 24-space board was already
  four deep at six columns), so the extra spaces cost width only - and floating
  the rails off the screen edge paid for most of that:

  | | slot before the rails moved | after |
  |---|---|---|
  | 393px | 36.9 x 51.6px | **42.3 x 59.2px** |
  | 360px | 33.5 x 46.9px | **38.6 x 54.0px** |

  A 393px eight-player slot is now 42.3px against a `--card-w` of about 43px, so
  it is effectively full size, and the 360px board clears the 34px floor it had
  dropped under. Exactly a third of a chip shows at each edge (5.9px of 17.7px at
  393px). A six-player board is untouched: rails in flow, fully on screen.
- The hint's whole life, sampled: on at 4.6s, 14.6s and 24.6s, about **975ms**
  each, and a tap restarts the cycle five seconds out.
- An away player dimmed in the opponent strip while still `connected: true` in the
  room - the case `.opp.absent` was renamed for.

And the away fix, from earlier the same day:

- A player's own client marking itself away after 45s of nothing, and the away
  note on that player's own screen.
- The all-stuck rotation and the three-rotations round end - the path that had
  never once run outside a unit test.
- The negative control: the same script with the away filter removed hangs
  exactly as reported.

### Verified in the real app on 2026-08-26

Driven end to end through the emulator, in a room with two bots:

- The blitz splash, all three variants: glitter for the blitzer, falling 😢, and
  falling 💩 for the worst score at three or more players.
- The score sheet's reorder: rows land in the old standing, swap after 400ms,
  green up and red down.
- The race halo over a contested space.
- Creating a room, adding bots, starting a round, and a real pointer drag.

None of it had been seen before. It also turned up a bug no test could: the board
vanished behind "dealing…" the instant a round ended (fixed in `676e946`).

### The board wastes its vertical space — new, from those renders

At 393×851 the centre grid occupies roughly the middle third of the screen with
about 90px of dead space above it and 80px below, while cards sit at 47px.
`--card-w: clamp(34px, min(12vw, 7vh), 96px)` is what holds them there: 12vw is
47px on that phone, and the 12vw cap exists for the **six-column** 8-player board,
where six of them plus gaps do have to fit across. A four-column board pays that
cap for nothing — it uses about 200px of a 377px-wide area.

Nothing is broken and nothing overflows, so this is a design call, not a bug: give
the slot more room when the column count is low (the container query already knows
`--cols`), or leave the board small and deliberate. **Decide before touching it** —
bigger cards eat the slack the snap band and the tableau currently sit in, and the
snap band is already the largest single element on the board.
- ~~The seven-column score row at 360px~~ — done headlessly, both themes, with a
  14-character name. Never on real glass.

### Never actually played

- A full round to completion on the new board — blitz call, scoring overlay, next
  round, rematch.
- **AI players end to end.** The bot loop has only run against fake deps and fake
  timers. Whether a bot's blitz announces correctly and whether host transfer
  hands bots over cleanly are both unknown. Difficulty was retuned on 2026-08-25
  after Easy beat a casual human; whether Easy is now beatable *without being
  inert* is unverified.
- ~~Automatic stuck detection firing in a real game, and the all-stuck rotation~~ —
  **both driven for real on 2026-08-27**, with two human clients: a stuck player,
  an away one, three rotations and a `blitzedBy: null` round end. With **bots** in
  the room it is still unproven; a two-bot table now reaches a normal blitz rather
  than the stall path.
- The snap band by touch drag, and by tap.
- Wood recycle: both the `↻` button and the `↻` empty draw slot.
- One-tap join from the home page, including the badge-taken fallback.
- Opponent strip mini-cards updating live.

### Reconnecting after backgrounding

Reported and fixed blind on 2026-08-25; needs the test that found it — switching
apps mid-game and coming back. Three separate faults were on that path:

- `Join`'s auto-resume swallowed any throw with `resuming` still true, leaving the
  screen on "Rejoining…" for good. Now surfaces a Try again button and retries on
  the offline → online edge.
- `enterRoom` / `hostRoom` let rejections escape with `joinPhase` still
  `'joining'`, disabling every join button permanently. Both now land on
  `joinError: 'offline'`. Covered by tests.
- Nothing nudged the SDK. A `visibilitychange` handler now calls
  `goOffline`/`goOnline` on return and again 2.5s later, **only while `online` is
  false** so it cannot flap presence for others.

The nudge in particular is unverifiable from here — it depends on how a real
mobile browser freezes and thaws a tab. **If it still fails, the diagnostic is
which screen you land on:** "Reconnecting…" means the resume path failed;
the dimmed board with the "reconnecting…" pill means the socket is still down;
the join form means the anonymous identity was lost, which is a different bug.

In a 1-human + 1-bot game you are the only client, so while you are away the whole
game is frozen, including the bot. That is inherent to a serverless design.

### Open, and worth a decision

- **The black ring on a selected card.** Asked to be removed after it showed up in
  a screenshot, but it is `.card.selected` — the only thing that says which card
  you have tapped, and tap-then-tap-a-target is a whole input path. Left in place
  deliberately. If it is genuinely unwanted, it needs a replacement cue, not a
  deletion.
- **Bots report their lost races too**, so a human beating a bot gets a halo. Bots
  race often; if it turns out too frequent to feel special, gate `reportRace` on
  the loser being human in `driveBot`.
- **The board's dead space** (see above) is unchanged: cards stay at 12vw even
  when a four-column board has room for far more.
- An opponent's empty slots are gone, but **your own wood still shows an empty
  slot** under the face-down pile before the first flip. That one is arguably a
  target rather than a gap - it is where the turned-over card lands.

### Scale

- ~~Three or more players~~ — three humans played on 2026-08-27. Five to eight is
  still untried, and so is the 24-space cap in practice.
- Several bots at once with a low-end phone as host — every bot turn runs there.

### Carried over, still true

- **iPhone Safari has now been opened once** (2026-08-27, three phones), which is
  where the drag-ghost offset came from. What that session did NOT cover: the
  ghost's new self-correction, written afterwards and so far only proved on a
  browser that never needed it; address-bar behaviour during a drag; and the
  "no moves" band, which needs a player genuinely stuck to appear.
- Spec §7 touch acceptance: no pull-to-refresh, no rubber-band scroll, no
  double-tap zoom, no text selection while dragging.
- The ledgered pointer-capture re-select check on mouse drags.

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

Earlier history, the approved design spec and the original 15-task execution
ledger are in `docs/superpowers/`. The README carries setup, the security model,
the **host options** (`b853ccf`) and the house rules — it is the player-facing
half of this document, so a change to what a lobby toggle *does* belongs in both.
