**Nothing is pending right now.** The sweep order was the first rule to go
through the gate: bench on 2026-08-31, shipped 2026-09-01. The banner and the
`pending` tag are still in `flick-bench.html`, unused, because the next one
should cost a flag and not a rebuild.

# Project Handoff - Deutsch Dash

_Last updated: 2026-09-10. Working tree clean, CI green including the emulator
suite. A commit sitting unpushed has already invalidated one playtest - what
people are playing is whatever last reached Pages - so check `git status -sb`
before trusting what a table reports._

_**What is live on Pages is `94891dc`, v1.5.28**, deployed 2026-09-10: the bots
aiming at the lowest open space, and the four Genius cheats. Checked rather than
read off a green tick, and without `gh` on the machine - fetch the served HTML,
follow it to the `index-*.js` it links, and read the two counters out of the
bundle, because **the version is never a literal string in the build**. It is
computed at runtime from `MAJOR`, `FEATURE_BATCHES` and `SMALL_CHANGES`, which
minify to something like `pn=1,mn=47,hn=58` next to `formatVersion`'s own
`t*10+n`; grepping the bundle for `1.5.28` finds nothing and proves nothing. Run
those three through `formatVersion` to get the version. The same fetch confirmed
the change itself and not just the number: the live bundle carries the `rewind`
action branch, `REWIND_RANK`, `BotProfile.cheats` and the `?.isBot` guard on the
race edge._

_A local `npm run build` will NOT hash the same as the deployed bundle even at the
identical commit, so do not read a mismatch as a bad deploy. CI builds with the
Pages subpath and a local build does not: the difference is `deutsch-dash/`
inserted at two asset paths, plus the chunk-name hashes that cascade off it.
Diffing the two showed those and nothing else._

_**The deploy before it was `e23448f`, v1.4.61**, deployed 2026-09-06, and the
icon work is all of it: the new icon full bleed, the 16px cut of it in the tab,
and the full drawing 44px on the home screen beside the title. Checked rather
than read off a green tick - every icon file on Pages hashes the same as its copy
in `public/`, the served HTML links `favicon.svg` and no longer `icon.svg`, the
home screen's own footer reads v1.4.61, and the logo's `img` reports a 512x512
natural size, which is the proof that the `BASE_URL` path resolved under the
subpath. **Your own browser will disagree about the favicon for a while.** Chrome
caches those separately from the page and a plain reload usually will not move
it, so a tab still showing the old drawing is not evidence of a bad deploy: hash
the file on Pages instead._

_**`database.rules.json` and the live database agree.** Last deployed 2026-09-10,
with the `says` node the soundbites write to and the `meta/soundsOn` host option;
`holland-hustle-default-rtdb` reported the release. Before that, 2026-09-05: the
delete grant on `rooms/$code` and `owner` made optional on the cards inside a
tableau, with the audit's bounds the day before. Every one of those only ADDS or
RELAXES, so no client already in a hand could break on them, which is why they
were safe to release without waiting for anything - a client that predates the
soundbites simply never writes `says`. When a change RESTRICTS instead, check
both directions before releasing: the new client against the rules still live,
and the PREVIOUS client against the new rules, which is the half this file's own
warning cannot cover._

_**773 tests** (619 unit and 102 in a real browser; 52 against the emulator, all
green). This is the only place in the repo that quotes a count -
it drifted three separate ways when it lived in four places, so keep it here and
nowhere else. Both sides of the 2026-09-04 merge rewrote this line, which is the
drift it warns about happening in miniature: neither number was right afterwards,
and the figure above was measured rather than added up._

**The version is `src/version.ts` and nowhere else** - the same one-place rule the
test count above keeps. `v<major>.<minor>.<patch>`, shown at the foot of the home
and lobby screens so a report from a table can be tied to a build.

The minor and patch are **derived from two counters**, so bumping is incrementing
one number: a batch of feature work is worth **10** however many items it holds
(a one-item request the table asked for and got is still a batch), a small change
is worth **1**, and the running total splits at 100 - which makes the patch field
exactly "feature batches this hundred, then small changes". **MAJOR is manual**
and moves only when the table calls a release major, never by arithmetic.

`formatVersion` is pure and tested by worked example, so a bump never means
editing a test to match - a version whose test has to be re-pinned every time is
one somebody will eventually bump without running them. Bump it in the commit that
earns it, or it will drift the way the test count did.

A mobile-first multiplayer card game for 2-8 players, plus AI opponents.
Host creates a room, texts the invite link, everyone plays in their phone
browser. React + Firebase Realtime Database, static hosting on GitHub Pages,
anonymous auth. No server of our own.

- **Live:** https://sonofwatt.github.io/deutsch-dash/
- **Repo:** `sonofwatt/deutsch-dash`, deploys from `main` via GitHub Actions
- **Firebase project:** `holland-hustle` (id is immutable, never shown to players)

**No em dashes.** Not here, not in code comments, not in commit messages, not in
anything the app prints. See `CLAUDE.md`; 268 of them were swept out of this repo
on 2026-08-31 and none should come back. **`src/noEmDash.test.ts` is what makes
sure of it**, grepping every tracked file on each `npm test`, because a rule this
absolute was until now enforced only by whoever happened to look. The sweep
itself proves the point: it missed one, in `.gitignore`, committed months before
the rule existed and therefore never in anyone's diff, and it survived until a
hand grep turned it up in `c73e341`. The guard takes its file list from
`git ls-files`, so a new file is covered the moment it is staged.

This file is the **why**. The README is the player-facing half - setup, the
security model, the host options and the house rules - so a change to what a
lobby toggle *does* belongs in both.

## How to run

```
npm install
npm test         # fast path: no Java, no emulator. The rules tests SKIP.
npm run test:emu # everything, emulator included. What CI runs.
npm run dev      # local dev server, always against the emulator
npm run emu      # Firebase emulator on its own
npm run build    # tsc -b then vite build
npm run lint     # oxlint - 7 warnings, 0 errors is the current clean state
```

Java is required for the emulator. A portable Temurin JRE lives in `.tools/`
(gitignored) and `scripts/with-java.mjs` puts it on PATH automatically, falling
back to system Java.

**Pushing:** the remote is SSH (`git@github.com:sonofwatt/deutsch-dash.git`) via
a repo deploy key at `~/.ssh/id_ed25519_deutsch_dash`. There are no HTTPS
credentials on this machine - switching the remote back to HTTPS breaks pushing
entirely. Confirm auth with `ssh -T git@github.com`.

---

## Before you change anything

These are the things that will cost you an afternoon if you don't know them.
Most are load-bearing decisions with a reason behind them, not accidents.

### Two traps that will bite almost any UI change

**`tsc -b` typechecks the test files.** `tsconfig.app.json` has
`"include": ["src"]`, and `npm run build` runs `tsc -b` first. `render.test.ts`
constructs `TableauView` / `CenterGrid` prop objects as complete literals, so
**adding a _required_ prop to either breaks the build**, not just the tests - and
`npm test` stays green while it does, because vitest does not typecheck. Make new
props optional, or update that file in the same commit. Half the features below
hit this.

**It is not only props, and not only that file.** Any test fixture that builds an
exported type as a complete literal has the same edge on it: adding `dashStreak`
to `PlayerStats` broke the build through `commentary.test.ts`, which spelled one
out field by field. The fix each time is the same - build the fixture by
spreading a constant (`NO_PLAYER_STATS`) or make the field optional - and the
exception is worth knowing too: `stats.test.ts` still writes that record out in
full deliberately, because it is the one place pinning what a brand-new player's
stats ARE, and comparing the constant to itself would pass however it changed.

**There is no DOM anywhere in the test suite.** `vite.config.ts` sets
`environment: 'node'`, so `localStorage` is undefined. **Any `localStorage` read
at module scope throws at import time**, and because `src/state/store.ts` builds
the `gameStore` singleton at module scope, that failure takes out every store
test at once. Hydrate preferences inside a component (as `Home.tsx` and
`Join.tsx` already do) or guard with `typeof localStorage !== 'undefined'`.
Also: `include` is `src/**/*.test.ts`, so a test file named `.test.tsx` is
silently never collected.

### Editing `database.rules.json` is half the job - deploying it is the other half

**After ANY change to the rules, run `npx firebase deploy --only database`.**
Nothing in the repo can tell you that you have not: the emulator always loads the
file from disk, so the whole suite passes happily against rules the live database
has never seen.

This has already cost a whole playtest. `stats` gained its own `.write` grant in
`a93e7d2`; the live database was still serving the rules from before it.
`commitScores` sent `round/scores`, every player's total and `stats` as **one
multi-path update** - and a multi-path update is atomic, so the denied stats write
rejected the entire round.

The symptoms are worth knowing, because not one of them points at permissions:

- The **host sees a score sheet** anyway. RTDB applies a write to the local cache
  and raises `onValue` locally before the server has answered.
- The rejection rolls that write back, raising **another** snapshot with
  `!room.round.scores` true again, which re-enters `commitScores`. A denied write
  every ~13ms for as long as the round is on screen.
- The host's header total therefore shows **that round's delta, not a running
  total** - the previous round's total was rolled back too.
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
- **A refused commit is shown**, on the game screen as well as on the sheet - the
  write most likely to fail is the one that builds the sheet, so the sheet is not
  there to carry its own error.

The `races` (`7803a44`) and `duels` (`05516a8`) grants have the same exposure: a
skipped deploy makes race flashes and rivalry commentary silently vanish.

**`says` is the newest one, and it fails in the nastiest way of the three.** A
soundbite plays on the presser's own phone before the write goes out, so against
undeployed rules the presser hears it, nobody else does, and nothing on screen
says why. Whoever pressed it will report that soundbites work.

### Firebase and the emulator

- The emulator database URL in `src/net/firebase.ts` must stay
  `?ns=demo-dash-default-rtdb`. The emulator only auto-loads
  `database.rules.json` into the `<project>-default-rtdb` namespace; any other
  namespace serves fully-open rules. **This bug already happened once** and
  silently ran every emulator test with rules disabled.
- The CANARY test in `rooms.emu.test.ts` ("a non-host cannot write another
  player's round/tableaus - proves rules are ON in this namespace") exists purely
  to fail loudly if that regresses. Do not weaken or delete it.
- `usingEmulator` is `forceEmu || (import.meta.env.DEV && !forceProd)`, so
  `npm run dev` and every test point at the emulator and can never write the live
  database. Only a production build reaches the real project. Opt in deliberately
  with `VITE_USE_PROD=1 npm run dev`.
- `createRoom` performs **one atomic multi-path `update()`**. It was two
  sequential writes for a long time, and this file said so for longer than it was
  true, so the note is worth keeping rather than deleting: the reason for the
  split was that `players/$uid`'s validate read `meta/phase`, which only resolved
  against data already committed. Nothing reads `meta/phase` from the rules any
  more - the lobby-only gate went when spectators were admitted mid-round - so
  the merge is legal, and `root` is evaluated against the PRE-write tree where
  the room has no players yet, which is the branch `hostId` and `creatorId`'s
  validates take. Worth a round trip, and worth more because a create can no
  longer be interrupted halfway and leave a `meta` behind with no players in it.
- `joinRoom` must write `meta/playerCount` with the `increment(1)` sentinel and
  never `snapshotCount + 1` - two racers reading 7 would both send the literal 8
  and both satisfy the validate. That's a confirmed race that admitted a 9th
  player while wedging the counter at 8.
- `MAX_PLAYERS = 8` in `src/net/rooms.ts` is mirrored as a bare literal `8` in
  `database.rules.json`. Change both or client and server disagree.
- **In a sandbox whose egress policy blocks the CLI's rules upload** (the
  database emulator loads rules through a call to `firebase-public.firebaseio.com`
  that some proxies refuse, and the CLI then reports "Unable to parse JSON"),
  the suite still runs: start the auth emulator with
  `firebase emulators:start --only auth --project demo-dash`, the database jar
  directly with `java -jar ~/.cache/firebase/emulators/firebase-database-emulator-*.jar
  --host 127.0.0.1 --port 9000 --functions_emulator_host 127.0.0.1
  --functions_emulator_port 5001`, PUT the rules file to
  `http://127.0.0.1:9000/.settings/rules.json?ns=demo-dash-default-rtdb` with
  `Authorization: Bearer owner`, and run `EMULATOR=1 npx vitest run`. **Wipe
  every namespace between runs** (`DELETE /.json?ns=<each>`): the jar keeps data,
  and a re-seeded `playerCount` of 1 over a stored 8 is refused by the
  non-decreasing rule, which looks exactly like a rules regression and is not.
- **RTDB does not run validate rules on a delete.** That is what lets a player
  release a claimed badge with no rules change (see the lobby identity editor).
- **`players/$uid` no longer has a `.validate`.** It used to gate a brand-new
  player record on `meta/phase === 'lobby'`; a game in progress admits spectators
  now (see below), so that clause is gone and **deployed**. The 8-seat cap is
  untouched - `meta/playerCount`'s own validate is what enforces it, which is why
  it is a tracked counter rather than a live child count. Both halves are pinned
  in `rooms.emu.test.ts`: a mid-game join succeeds, a ninth player still fails.
- `createRoom`'s two sequential writes are **gone**: it is one atomic write now,
  for the reasons above. What the emulator tests seed against is still the two-step
  shape (`seedRoom` writes `meta` and then the players), and that is deliberate -
  it is the shape a JOIN produces, and proving the rules accept both is worth
  more than making the fixture match one caller.

### CI runs the emulator suite - keep it that way

The emulator files gate every describe on
`describe.runIf(process.env.EMULATOR === '1')`. Without that variable their tests
**skip, and a skipped test reports green**. That is the right trade for the fast
local loop, but it means the only tests that exercise `database.rules.json` -
including the CANARY proving the rules are loaded at all - are invisible unless
something deliberately turns them on.

So CI runs `npm run test:emu`, not `npm test`. It is a strict superset, and
running the plain suite alongside it would just execute everything twice.

Running the emulator on a runner needs a JVM (`actions/setup-java`), and the
~30MB database-emulator jar is cached so a slow CDN cannot turn the rules tests
into a red build. Both are in the workflow.

`src/net/emulatorCoverage.test.ts` guards it. It reads the workflow rather than
checking env vars, deliberately: an env check only fails in the environment that
already broke, whereas this goes red in **any** run - local, CI, a contributor's
laptop - the moment the two drift apart. It also pins that the emu suites still
gate on `EMULATOR`, so if that changes, the reasoning behind the CI step gets
revisited rather than quietly rotting.

Locally, `npm test` skipping the rules tests is fine and intended - but run
`test:emu` before pushing anything touching `src/net/` or the rules.

### Trust model

**Knowing the room code is the credential.** Room `.read` and the writes to
`round/spaces`, `dashedBy`, `races`, `duels` and `stuckRounds` are gated only
on `auth != null`, and anonymous tokens can be minted straight from the Firebase
REST API. Only `players/$uid` and `round/tableaus/$uid` are genuinely bound to a
uid. `endRoundStalled` and `incrementStuckRounds` are host-by-convention and
explicitly not enforced. See the README's security section for why this is
deliberate.

**Since the audit the rules bound WHAT is written as well as who writes it**:
a badge id is a badge, the phase is a phase, every number is a number in range,
a card is a card and a hand holds only its owner's cards, and `round/scores` and
`round/startedAt` are the host's (nothing else ever wrote them, and a pre-written
`scores` node silently stopped the host's commit for the rest of the game). Two
things the rules still do not do, and the client covers instead: a client can
write its own `players/$uid` record without the `playerCount` bump, so the
8-seat cap holds only for the app's own join path; and nothing bounds the SIZE
of a write. Both are in `docs/audit-2026-09-03.md` with the rule text, and wait
on a production probe because the emulator evaluates ancestor validates and
cross-path reads of a multi-path write in ways production is not documented to.

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
  exported `gameStore` singleton - importing it executes Firebase module side
  effects.

### Presence: away, and sitting out

Two different absences, and every table-wide rule has to skip both.

**Away** is how the idle-table hang was fixed (`034e313`). One human, two bots,
the human doing nothing: an idle player is never marked stuck - correctly, their
wood is untouched and their Dash top will land somewhere - so `allConnectedStuck`
never came true, the rotation never fired, and the three-fruitless-rotations round
end was unreachable. A player with legal moves who is not playing is not stuck,
and the game waiting for them is right up until they have *gone*; so what is
detected is that they have gone.

`PlayerInfo.awayAt` is written by the player's **own** client off its own clock
after `AWAY_MS` (45s, in `store.ts`) of touching nothing, and `allConnectedStuck`
skips away players exactly as it skips disconnected ones. No rules change -
`players/$uid` was already writable by its owner, with emulator tests pinning both
that and that nobody else can write your `awayAt`. The reset is `noteActivity`,
wired to plays, flips and a pointerdown anywhere on the game screen - a wider net
than "made a legal move" on purpose, because a player weighing up the board is
present. Bots are never away: they have no client to notice, and the host either
plays their hand or marks them stuck.

`awayAt` means something different per phase, which is fine because the two never
run at once: during a round it is 45s of no input (the idle timer owns it); in the
lobby it is **the tab is hidden**, which the browser reports instantly, and
`noteVisible` owns it there. One writer per phase.

> **`allConnectedStuck` being true no longer implies *you* are stuck.** That
> implication used to be free - if everyone connected is stuck and I am connected,
> I am stuck too - and skipping away players broke it in exactly the shape that
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
forfeiting that round's arithmetic in both directions: no penalty for the Dash
pile they abandoned, no credit for what they had already played. Cards already in
the centre stay there - other people are building on them.

**Sitting out keeps the hand**, and this is the part to not undo. The first cut
deleted the tableau, so returning meant waiting for the next deal. Re-dealing one
on return would have been worse than it sounds: `buildDeck` is per-player and
every card carries its owner, so a fresh deck mints duplicates of the cards that
player already has in the middle - same `cardId`, same layout id, playable twice.
Keeping the hand sidesteps that and restores exactly what they put down.

**So the flag, not the absence of a tableau, is what every rule reads.**
`startRound`, `allConnectedStuck` and `tableReady` skip them, `commitScores`
filters them out of `scoreRound` so a round played without them moves their total
not at all, `syncStuck` returns early (they still have a hand and would otherwise
be declared stuck for a round they are not in), and `playTo` refuses. A player who
missed the *deal* still has no hand and still waits for the next round - the
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
count changes and React tears the tree down - *"Rendered fewer hooks than
expected."* It is hoisted above every conditional return now and must stay there.
The stable `NO_SPACES` constant beside it is load-bearing too: the hook compares
`spaces` by reference, so a fresh `[]` per render would look like a change every
render, and it sets state.

### AI players

- **A bot can never be host.** `pickNextHost` filters `isBot`, which matters
  precisely because a bot's `connected` flag is written once and never cleared -
  without the filter it would always look like the longest-present live player,
  while having no client to run the room with. Asserted in `plays.test.ts`.
- **Only the host runs the bot loop.** `driveBot` bails on `isHost`. Bot hands
  live in client-only `botTableaus` state, and a new host re-adopts them from
  `room.round.tableaus[id]` via `reconcileTableau`.
- **Genius cheats, and every other level does not.** `BotProfile.cheats` is the
  flag and `CHEATS` in `bot.ts` is the list. It is deliberately not a difficulty
  knob: the other three levels are handicapped by speed and attention only, and
  adding a fifth level or retuning the ladder must not turn this on by accident.
- **A bot's wood step is its own, not the table's.** `botWoodStep` can hand Genius
  a one-card lap, so anything reading `WOOD_STEP` or `woodStep(room)` for a BOT is
  wrong. `driveBot` computes `step` once at the top and every branch uses it.
- **`isStuck` takes a separate `reachStep`** for the same reason, and only Genius
  passes a different one (`botReachStep`). Judged at three it would be declared
  stuck holding a card its one-card lap is two laps from turning up - and a bot
  declared stuck stops turning its pile at all, which would take the cheat away
  before it ever fired. The BAR underneath stays on the table's pace, so a genuinely
  dead hand still admits it as fast as anybody's and the all-stuck rotation is not
  delayed.
- **Bots are excluded from `meta/playerCount`** because that validate rule
  forbids the value ever decreasing - counting a bot would permanently consume a
  seat when it was removed. The 8-seat total is enforced client-side in `Lobby`.
- A bot's badge is claimed **under the host's uid**, because
  `badges/$badgeId`'s validate requires `newData.val() === auth.uid` and bots have
  no auth identity. This still blocks a human taking that badge, with no rules
  change.
- The practical player ceiling is the 8 entries in `BADGE_IDS`, which is written
  out by hand rather than taken from `BADGES`. **`BADGES` also carries RETIRED
  badges** and `BADGE_IDS` is the list without them: every render site indexes
  `BADGES` by whatever id a player is carrying, so a badge dropped from the picker
  has to stay drawable or a room dealt before it went takes the screen down over a
  missing glyph. The bicycle went this way on 2026-08-31 for the clover, and the
  kite the same day for the tropical fish. Retiring one means moving its quip over
  too, which `commentary.test.ts` pins by counting `quip-*` against `BADGE_IDS`.

### Game rules as implemented

- `centerPlayTxn` archives a pile into `space.history` and clears `stack` at
  exactly 10, freeing the space server-side, so a stale client cannot revive a
  finished pile. Finished piles show on the rails flanking the board - **except
  above 24 spaces** (`CROWDED_SPACES` in `CenterGrid.tsx`, i.e. seven and eight
  players), where the rails leave the board's column flow altogether and hang off
  the screen edges with a third of a chip showing. At eight columns every pixel a
  rail holds is one the slots do not get, and that alone is worth ~15% on the card
  size. The `+N` overflow marker is suppressed there - a 10px glyph sliced to a
  third is a smear rather than a number - but the rail's `aria-label` still
  carries the true count.
- **Two players get NINE spaces, not eight.** Eight is 3 + 3 + 2 at three columns
  and a wide strip at four, and neither reads as a board; nine is a 3 × 3 square.
  It is free because the ratio below is a **floor, not an equality** - the
  guarantee is that no Ace can be left homeless, and nine spaces for eight Aces
  keeps it with one to spare. An orderly two-player board rounds to 12 instead
  (three rows of four), because an orderly one cannot use three columns at all.
- Board size is otherwise `4 × players` - `spaceCountForPlayers`, capped only by
  `MAX_SPACES = 32`, which is `4 × MAX_PLAYERS` and so no longer binds. Four per
  player is **one space per Ace in the game**, and keeping that exact is what
  guarantees an Ace always has somewhere to go: if every space is occupied then
  every Ace is already down, so nobody can be holding one. The cap used to be 24
  and broke that at seven and eight players - survivable on an ordinary board,
  fatal on an orderly one, which cannot lend one suit's space to another.
- **`canPlayToSpace` is the single definition of "can this land here"**, and the
  orderly-grid suit constraint lives inside it for that reason. Anything that adds
  a rule about the centre goes there, or highlighting, `hasLegalMove`, `isStuck`,
  the bots, the hint and `centerPlayTxn` start disagreeing - and a player gets
  declared stuck holding a move they can see.
- **`centerPlayTxn` spreads the space it was given straight back into RTDB.** Two
  consequences: never put an `undefined` on a `CenterSpace` (RTDB rejects the whole
  write - `normalizeSpace` must leave `suit` *absent*, not empty), and never
  rebuild the space from scratch in the archive branch or its suit goes with it.
  Both of those were real bugs; both are pinned by tests now.
- **`ENABLE_STUCK_BUTTON` is `false`** and the whole stuck path still runs
  underneath. Being stuck is *detected* by `isStuck` + `syncStuck`, not declared.
- **Stuck is judged on what the wood can REACH, not on what is face up.** A turn
  of three exposes only every third card when the pile length is a multiple of
  three - which is how a round is dealt, at 27 - and which third depends on where
  the index sits, so a hand can be full of playable cards none of which can be
  reached. At any other length the cycle reaches all of them. `woodCycleTops` walks the cycle from where the pile
  actually stands and `hasReachableMove` asks the question that matters. A move
  three turns down is a move this player has, and telling them they have none was
  simply wrong. `hasLegalMove` still answers "right now, with what is face up" and
  is what highlighting and the bots use; do not swap one for the other.
- Below that, `isStuck` still needs either zero wood or
  `flipsSinceProgress >= ceil(wood.length / step)` - a handful of fruitless turns.
  That stopped being a full cycle when the turn started carrying its count across
  the turn-over (a ten-card pile now takes ten turns to come round, not four), and
  it does not need to be one: `hasReachableMove` has already answered the question
  exactly by walking the cycle, and this only stops a player being labelled the
  instant they run dry. **The step is 1 while the host's rescue is on**, so that
  bar moves with it.
- That flip counter is a closure-scoped `Map` in `createGameStore`, never
  persisted - **it resets to zero on any page reload**.
- Tableau order is Dash | posts | wood. Wood sits under the right thumb because
  it's the pile touched most, and `src/ui/prefs.ts` lets a device flip the two
  ends (see below). `render.test.ts` pins this order in both the tableau and the
  opponent strip.

### Sizing: what measures what

Both halves of the board measure the space they actually have, and the two
mechanisms are deliberately different.

- The centre grid takes the largest slot that fits in **both axes** (`--fit-w` /
  `--fit-h` in `.game-grid`). That needs `cqh`, which needs
  `container-type: **size**` on `.grid-wrap` - not `inline-size`. Its height is
  definite (`.game` is a fixed `100dvh` grid and this sits in one of its tracks),
  so containing the size costs nothing. `--rows` is passed in from `CenterGrid`
  because CSS cannot count grid rows.
- The tableau sizes to its own row from `--hand-card` on `.game`, fed by `--piles`
  and `--tgap` from `Game.tsx` - the only place that knows how many posts this
  round dealt.
- **The column COUNT is measured too**, in JS: `gridColumns` takes the box a
  `ResizeObserver` on `.grid-wrap` reports and picks the shape that buys the
  biggest slot. The constants it ranks with (gap, caption reserve, card ratio,
  the clamp ceiling) mirror `.game-grid` and are approximations **on purpose** -
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
right the correction is zero. The `translate(-50%, -55%)` lift is intentional -
it keeps the card out from under the thumb.

**The pointer position is not React state.** It was, and every pointermove
therefore re-rendered the game screen and the whole board under it: 75 card
nodes at eight players, 36 of them framer-motion layout nodes measuring
themselves twice per render. A headless Chromium bench put one move at 4.6 ms,
and 29 ms with a 4x CPU throttle, which is more than a frame. The position now
lives in a `PointerTrack` (`useDrag.ts`) that only `DragGhost` subscribes to,
writing one transform per event onto its own element; React hears about a drag
twice, at the start and at the end. The ghost sets no `style` prop at all, so a
snapshot landing mid-drag cannot put it back where React last saw it. See
`docs/audit-2026-09-03.md`.

### Dash on screen and in the code

**The pile is called Dash everywhere.** The strings a player reads went first -
the splash, the pile label, the score screen's "X dashed!", the scorepad's "Stop
the clock when somebody calls Dash", the ⚡ row's screen-reader label, the
thumb-swap tooltip, and eight commentary lines including the pun, which is now
"Dash-edly disappointing". The identifiers followed, once the table confirmed
there were no rooms in flight to migrate: `round/dashedBy` (in
`database.rules.json` too), `Tableau.dash`, `RoundScore.dashLeft`, `PlaySource`'s
`dash` kind, `announceDash`, `dasherOf`, `PlayerStats.dashes`, `DashRecord`,
`MAX_DASH_LEFT`, `DashSplash` and the `.dash-*` CSS. Test names and comments say
Dash pile now as well - a reader should meet one word, not two.

**A rename of a database key is only free while nothing is playing.** All four of
the renamed keys live under `rooms/<code>/round`, and nothing reads the old
spelling: a room written by an older build would come back with `dashedBy` null
and every tableau empty. That was acceptable exactly once. Anything similar in
future either waits for an empty table or reads both spellings for a while.

**The scorepad is the exception, because its data is on somebody's phone.**
`loadGame` maps a saved `blitzLeft` onto `dashLeft` (`asScores` in
`src/keeper/storage.ts`) and the next save drops the old key. Without it a game
in progress reloads with a NaN in the penalty column and nobody credited with the
dash - and a scorepad that loses forty minutes of scores is a scorepad nobody
uses twice.

**The word is gone from the working repo, including the places that were held
back once.** The emulator project is `demo-dash` now, which moved four values
that have to agree or the rules silently stop being enforced: the `--project`
flag in both `package.json` emulator scripts, and `projectId` plus the `?ns=`
of `demoConfig` in `src/net/firebase.ts`. The forensic comments in
`rooms.emu.test.ts` were retargeted with it, so their reproduction recipes still
run; `demo-dash-rules-test` stays deliberately distinct from the app's own
namespace for the reason spelled out there. The CANARY is what proves the move
landed - it fails if the app's databaseURL and the namespace the rules load into
ever part company again, so `npm run test:emu` is the check, not reading the
diff.

**The game this one descends from is no longer named in the working repo.** It
was in the README's opening line, the scorepad's two doc comments and
`rankMove`'s reasoning; each now says what it meant without the borrowed name.
Two survivors, both deliberate: the FAQ link under the deferred post-pile move,
where the URL is the citation and changing it would break the evidence, and the
`docs/superpowers/` ledger, filenames included, which is the frozen record of
what was planned under that name. A grep will find them; neither is vocabulary
the app uses.

**The History table says Dash throughout as well**, including the three rows for
commits that shipped under the old name. The table is an index of what the work
was, not a transcript of what it was called at the time, and one word meaning one
thing is worth more to a reader than a preserved spelling. The commit messages
those rows point at are the transcript, and they are unedited.

### The card in the air leaves the pile it came from

**Every pile takes its top card off while that card is being dragged**, and shows
whatever is under it instead. The card is already following the finger; drawing it
a second time on the pile it came from puts the same card on screen twice and
reads as the drag having failed. Reported from a table as exactly that, off the
Dash pile.

Only the wood did this at first, on the reasoning that it is the one pile showing
a RUN of face-up cards and so has something to fall back to. That was the wrong
line to draw: the Dash pile and the posts have a card underneath too, and where
they do not, an empty slot is the honest answer. `TableauView` now reads
`props.dragging` for all of them.

Two things it deliberately does not do. The pile's **label does not change** - the
play commits on the drop, not on the lift, so the pile still holds the card and
still counts it. And the revealed card carries **no `layoutId` and no handlers**:
it is not moving anywhere, and starting a second drag from a pile already mid-play
is not a thing to offer.

Reproduced and fixed on all three, because "at least on Brave" turned out to mean
everywhere: desktop Chromium, Pixel 7 Chrome and iPhone 14 WebKit all duplicated
the card on the Dash pile and on all five posts before, and none of them do after.
The regression is pinned in `render.test.ts`, which reads each pile's own markup
rather than the whole tableau - card values repeat across piles, and an assertion
that just greps the page passes for the wrong reason.

### Reduced motion, and the Windows false positive

**A phone's reduced-motion preference is honoured. A desktop's is overridden.**

Reported as the wood flip and the falling emojis not working in Brave on Windows.
Neither is a Brave bug and neither is a bug at all: both are CSS animations behind
`@media (prefers-reduced-motion: reduce)`, and that machine was asking for reduced
motion. Confirmed by computing `animationName` under both settings - every one of
them resolves to `none` under `reduce` and to its keyframes without it.

The override exists because of where Windows puts that switch. It is Settings >
Accessibility > Visual effects > **Animation effects**, a general polish and
performance toggle that people turn off for reasons having nothing to do with
motion sensitivity, and Chromium reports it as a preference all the same. A
phone's sits in Accessibility and means what it says, so it is left alone. This is
a deliberate override of a stated preference and the reason is the false positive,
not convenience.

**The switch is the absence of `data-platform`.** `platform.ts` stamps `ios` or
`android` and writes nothing for a desktop, so `[data-platform]` inside a
reduced-motion block means "a phone asked, and meant it". Every such block carries
that prefix; `honoursReducedMotion()` reads the same attribute so `MotionConfig`
cannot disagree with the CSS.

`motionOverride.test.ts` measures all of it in a browser: animations run on a
desktop under `reduce`, stop on ios and android under `reduce`, and run on a phone
without it. It also **parses both stylesheets** and fails on any reduced-motion
rule that forgot the prefix, because the list it measures is hand-written and a
block added later would not be on it. Both halves were checked by removing the
prefix from one rule and watching them go red.

### Where the OS gets to the swipe first

Two gestures the page never sees, both reported from real tables, and both cost
the player the round they were in.

- **iOS** takes an upward swipe from the bottom edge as "go home" - and the Dash
  and wood piles sit at the bottom of the screen, which is where a drag begins.
- **Android** takes an inward swipe from either side edge as "back", which from
  the board is the lobby. Wood and Dash are the two ENDS of the tableau row, so
  whichever way round the player has them (`prefs.ts`), one is against an edge.

**A system edge gesture is not the page's to cancel**, so there is nothing to
prevent and no handler to write: the only defence is keeping the piles out of the
strip the OS is watching. `ui/platform.ts` stamps `data-platform` on `<html>` once
at startup (from `main.tsx`, before the first paint) and `game.css` keys two
custom properties off it - `--tableau-lift` on iOS, `--edge-guard` on Android,
both `0px` everywhere else so a desktop pays nothing.

**`--edge-guard` has to come out of `--hand-w` as well as being padding.** The
five piles size themselves to that width; leave it alone and they would size to a
width they are no longer given, and the outer two would run back under the guard
that exists to keep them clear.

**`--edge-guard` is a FLOOR on the clearance, measured from the screen edge, and
not an offset added to the page padding.** This is the trap the first cut fell
into: the tableau row is **centred**, so a guard expressed as padding to add
moves nothing at all until it exceeds the slack the row already has. A 10px guard
bought exactly 1px - the cards sat 17px from the edge and ended up at 18px, while
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
| 393x727 (browser tab), card to side edge | 40px | 40px - already clear |
| 390x844 (iOS app), card to bottom edge | 44px | **54px** |

**It is not free on Android**: the home-screen card goes from 63.8px to 54.6px,
because narrowing a centred row is the only way to move it. The tab row is where
the floor earns its shape - the hand is bound by `7.5vh` there, the row already
had 40px of slack, and the guard costs nothing at all. It only bites in the case
that was actually broken.

`detectPlatform` is pure and tested, because the order of its checks is not
obvious: Android UAs carry "Linux", and **iPadOS 13+ reports itself as a desktop
Mac** - the only thing that gives it away is having a touchscreen at all, hence
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

It is not a headless-rendering artifact - it is what any device does whose font
chain offers a text glyph first.

### There is a second, offline app inside this one

`#/keeper` is a scorepad for people playing at a table with a real deck. No
room, no account, no network: `src/keeper/` is the model and its localStorage,
and `Keeper.tsx` is the whole interface. It is routed **before** the
`configMissing` gate in `App.tsx` on purpose, so it works in a deployment with no
Firebase config at all.

It reuses the online game rather than copying it. A round is the same
`RoundScore`, which is what lets `ScoreList`, the ranking animation, `nextStats`
and the commentary all work without a card being dealt. The dasher is inferred
rather than asked for: whoever is entered with an empty Dash pile, or nobody if
two people are.

**Rounds are timed.** Dealing starts a clock and "Dash! Count the cards" stops
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
carries dash counts, last-place tallies and streaks, race wins and losses, the
fastest dash and the best and worst round of the game, and the number of full
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
  game-record lines use it. The per-round "dashed in Ns" reads
  `endedAt - startedAt`, which is server time at both ends.

---

## Decisions already taken

Everything in this section is **built and in `main`**. It is kept because it says
why each thing is shaped the way it is, not to track work. The playtest requests
were numbered #1-#23 as they were asked for; all are built except **#1 (retired)**
and **#4 (deferred, below)**. The numbers are kept in the headings so older notes
and commit messages still resolve.

### The fire is for a run, not for every dash _(2026-09-10)_

🔥 used to be one of three glyphs in every dash celebration. That made it
wallpaper: beside 😎 and 🥳 it said "you dashed" for the third time, to somebody
who could already see they had dashed. It now falls only when the dasher has
ended **two or more rounds in a row**, where it says something the board does
not.

**Every glyph in a splash is about the VIEWER**, and that is what decides who
sees the fire. The glitter is you dashing, the toilet is you dropping into last,
the trophy is you leading the table - so the fire is YOUR run and nobody else's.
Only the dasher can be on one at the moment they dash, so it never leaves the
celebration and never lands in a losing player's rain.

**The count does not change with it.** `FALLERS` is 26 whatever the glyph list
holds, so the fire changes the MIX and not the amount: thirteen of each without
it, about nine of each with it. A count that grew with the list would make a
streak literally heavier weather than an ordinary dash, and would have been doing
the same thing to the trophy on a losing round all along. Pinned by a test that
compares the plain dash, the fire dash and the trophy round to each other.

**`stats.dashStreak` is the run**, alongside the `lastStreak` that already
counted rounds finishing bottom. It increments for the dasher and resets to zero
for everybody else, which deliberately reaches two cases: a round that stalled
with no dasher resets the table, because nobody won it; and a player who sat the
round out resets too, because they did not win it either. `totals` carries every
player in the room rather than only the ones who scored, which is what makes both
of them reachable. It is counted OUTSIDE the bottom-of-the-table block, which is
skipped at a single player and skipped again on a level table - neither has
anything to do with who dashed.

**The streak is read one short, and that is the whole subtlety.** The splash
fires the moment dash is announced, before the host has committed anything, so
the stored `dashStreak` is the run BEFORE this dash. The test is therefore `>= 1`
and not `>= 2`: one already banked plus the one happening now. Exactly the same
offset the projected standings live with, for exactly the same reason.

A lost stats write shows the fire a round late or not at all, because stats are a
best-effort second write whose failure is swallowed (see `commitScores`). That is
the right way for this to fail: it decorates a celebration, and nothing that only
decorates a round may cost it anything.

**Adding a required field to `PlayerStats` breaks the build**, not just the
tests, the same way a required prop on `TableauView` does: `commentary.test.ts`
built one as a complete literal. It builds off `NO_PLAYER_STATS` now, so the next
field costs nothing. `stats.test.ts` still spells the whole record out in one
place on purpose - it is what pins what a brand-new player's stats ARE, and
comparing the constant to itself would pass however it changed.

### The table can make a noise _(2026-09-10)_

Eight canned soundbites a player can throw at the table: Cheer, Groan, Hurry up,
Oops, Laugh, Wow, Boo and Nice one. This is the **cheaper alternative** out of
`docs/audio-2026-09-09.md`, built first on that document's own argument. No
microphone, no permission prompt, no upload, no moderation problem and no
normalisation problem. It is also not throwaway work: the playback path and the
per-device switch are the same pieces real voice clips would need.

**Read "Six things the first table found" below before changing any of this.** The
playback path, the menu's gestures and the emoji layer were all reworked the same
day this shipped, and three of the paragraphs here describe how it used to be.

#### Two switches, and which way each one defaults

This is the part to read before changing anything here, because the two defaults
are a matched pair and either one on its own is wrong.

- **`meta.soundsOn` is the HOST's, and it defaults OFF.** It is the master switch
  for the BOARD: off, and the game screen has no note in the head island, no
  button over the Dash pile and no menu - **gone, not disabled**. This is where
  the "four phones at one table playing the same noise a beat apart" problem is
  handled. One person decides the table wants this.
- **`bz.soundOn` is the PLAYER's, and it defaults ON.** Once the host has said
  yes, nobody has to go hunting for a control. It is stored as "is it off", so
  absent reads as on - which covers every phone that has never been asked, every
  private window, and every browser with storage blocked. A player who switches
  it off stays off in every future game until they switch it back.

The engine runs on the AND of the two, and `useSoundOn(allowed)` is the only
place that combines them: the lobby passes `true` unconditionally, the board
passes `meta.soundsOn`. **Keeping them separate is what stops the host's switch
quietly rewriting eight phones' settings** - flip the room option off and back on
and every player's own preference is still whatever it was.

**The host's switch deliberately does not reach the lobby.** Soundbites in the
lobby are how a table finds out these exist and what they sound like, and a room
that has not switched them on for play is exactly the room that needs to hear
them first. So the lobby tray is gated on the player's switch alone.

**In the lobby, the switch shows and hides the grid itself.** Turning it off is a
player saying they do not want any of this, so leaving eight buttons behind would
be leaving the feature on screen for somebody who has just switched it off. It
also keeps the switch honest: what it shows is exactly what it does. The switch
itself always survives, or there would be no way back on.

#### On the board

**The note in the head island is a SHOW/HIDE for the launcher, not a sound
toggle.** The sound switches live in the lobby; mid-round the only question is
how much board you want. The note itself is absent entirely unless the host has
sound on AND this player does - a control that cannot do anything is worse than
no control.

**The launcher sits in the band above the DASH column**, the strip the wood
column's two-card height leaves empty, sized off the card like everything else in
that row. `.wood-note` spans the same strip, so `.has-sound` shortens it by a
card; without that they sit on each other and the note is the wider of the two.
Wood and Dash are always at opposite ends, so the launcher and the note inset
from opposite sides.

Two gestures on one button, and telling them apart is a clock and a distance
rather than a mode:

- **Tap** and the menu opens and STAYS open, so a table can fire off three in a
  row. It closes when you press anywhere outside its borders.
- **Press and hold**, slide onto a soundbite, and lift: that one plays once and
  the menu closes with it. One gesture, no second tap, which is what you want
  mid-round with a hand of cards to get back to.

A pointer that goes up inside `TAP_MS` **and** never moved past `SLOP_PX` was a
tap. Anything else was a hold, and a hold that ended over nothing simply closes.
Both thresholds are generous, because the cost of guessing wrong is one extra tap
and never a lost card.

**The hit test is rects, not `elementFromPoint`**, and both reasons bite: the
menu sits under a full-screen dismiss backdrop, so a hit test would find the
backdrop; and the gesture holds a pointer CAPTURE on the launch button, so the
grid's own buttons never see the events. `hitSoundbite` is pure and tested,
including that the gaps between buttons return null - lifting a thumb between two
buttons must play NOTHING, because snapping to the nearest would fire a soundbite
the player had deliberately slid off.

Two things that are easy to lose and both cost a card:

- **`touch-action: none` on the launcher.** Without it the browser takes the
  vertical drag as a scroll and the slide never reaches `onPointerMove`. Same
  trap the card drag hits.
- **The backdrop takes the dismissing press.** Pressing outside closes the menu
  and must not ALSO land a card in the middle, and `onPointerDown` rather than
  `onClick` because the board is played with pointer events.

#### The emoji rain

Every soundbite that reaches a device also draws itself: seven copies of its
glyph falling from the top of the screen, stopping about a third of the way down.

A soundbite you can only hear misses anybody whose phone is face down, silenced
by the OS, or simply not being looked at. Which is also why `playSoundbite`
returns **"reached this device"** rather than "made a noise": a context that is
still waking gets the emoji now and the sound a moment later, and the glyph is the
half that still works when the audio does not.

**Falls stack.** Repeated presses pile up rather than replacing each other, capped
at six layers with the OLDEST dropped - see "Six things the first table found".

**A third of the way down, not the whole screen.** The dash splash falls the full
height because it IS the moment and owns the screen for 3.6 seconds; this arrives
mid-round over a board somebody is playing. The top third is the head row and the
opponent strip, which is the part of the screen with nothing in it a thumb wants.

**It cannot be touched, and that is the hard requirement.** `pointer-events:
none` on a `position: fixed` layer rendered outside every drop target, beside the
drag ghost. Measured rather than assumed: with the rain on screen,
`elementFromPoint` over a Dash card returns the card. A decoration that could eat
a play would be worse than no decoration.

**Linear, from just above the top edge.** It was an ease-in from `-14vh` first,
which spent its first 700ms out of sight and read as the emoji lagging the sound
by most of a second. It clears the edge inside ~150ms now.

The nonce it is keyed on is a **counter, not a clock**. `Date.now()` repeats
inside a millisecond, and two soundbites landing in one snapshot would then share
a value and the second would not redraw.

#### The lobby's option list

Five host options is too many to sit loose above the ready button, so they are
behind one tap with a chevron that turns. **The host gets them open and everybody
else gets them shut**: the host is the only person who can change any of them,
and for everyone else they describe a match they are about to play anyway. The
choice is remembered per device once made either way, and the stored value wins
over the host default, so a host who prefers the list shut keeps it shut. The
list is the same list for everybody - a player still needs to be able to see what
they are playing.

#### The wire

**`rooms/$code/says/$uid = { id, at }`, and every word of that path is load
bearing.**

- **Keyed by uid and OVERWRITTEN, never pushed.** That is what bounds the node to
  the eight seats however long the game runs, and it is why there is no sweep to
  write - the voice-clip design in the research note has to carry one. Deleting
  the room takes them with it.
- **On the ROOM and not on the round**, because the lobby is where a table waits
  for people and is exactly where they want to make a noise at each other.
- **`at` is a NONCE, exactly like `RaceRecord.at`.** Two phones do not agree on
  the time, so nothing compares it against a local clock. Every client remembers
  the value it last saw per player and plays when it CHANGES. It is
  `serverTimestamp()` so that every client reads the same value.
- **The first value seen for a uid is adopted SILENTLY.** The node is never
  swept, so the last press of a game sits there until the room is deleted, and
  without this, walking into a room would replay it. The map is cleared in
  `watch()` so leaving and coming back is a fresh start rather than a burst of
  noise on arrival.
- **Comparing the nonce and not the id** is what makes pressing the same button
  twice audible twice, which is the normal case rather than an edge case.
- **`say` plays locally FIRST and writes second**, the same decision the scowl
  takes: the presser gets their noise immediately and gets it even if the write
  is refused. Which is why `onSnapshot` skips this player's own entry - hearing
  the echo would be the same clip twice, the second time a round trip late.
- **Fire and forget.** A soundbite that does not arrive is worth no error on
  anybody's screen; `actionError` is for a host write that cost the table
  something.

**The rules bound this node tightly, and it is the one node in the app a player
writes something that looks like free text to.** `says/$uid` is writable by that
player or the host (the host grant is the only way to tidy up after somebody who
has gone). `.validate` requires exactly `id` and `at`, the id must match a short
closed list of the eight, and **`$other` is `".validate": false`** so nothing can
ride along beside them. That closes the "nothing bounds the SIZE of a write" gap
from the 2026-09-03 audit for this node at least, which matters because it is the
node most obviously shaped like somewhere to put a payload.

**The id list in `database.rules.json` is a bare regex mirroring the catalogue**,
the same way `MAX_PLAYERS` is mirrored there as a literal `8`, because the rules
language cannot import anything. `soundbites.test.ts` fails when the two drift.
The drift that matters is one direction: a soundbite added to the catalogue and
not to the rules is a button that writes, is refused by the live database, and
**plays on the presser's own phone anyway** because `say` plays locally first.
Nobody else hears it and nothing on screen says why, which is the exact shape of
the stats-grant failure that cost a whole playtest.

#### The clips themselves

**They are synthesised, not files.** Nothing loads an asset: each clip is a few
oscillator and noise bursts built at play time from a recipe in
`src/game/soundbites.ts`. That keeps them out of the bundle entirely - there is
no audio in `public/` and the entry chunk did not move - and it is also the limit
on what they can be. A synthesised cheer is a rising triad, not a crowd. The set
is picked for what reads clearly as an abstract noise, which is why it is stings
and not impressions.

**Eight, not the dozen the research note sketched.** Four across by two down is
what fits on the narrowest phone without the tray scrolling, and eight distinct
noises is about where a table stops being able to tell them apart. Adding a ninth
is one entry in the catalogue plus its recipe, and `soundbites.test.ts` fails if
the count stops fitting the grid.

- **`src/game/soundbites.ts`** is DATA and stays pure, so the whole catalogue is
  testable in node where there is no `AudioContext`. It sits in `game/` beside
  `badges.ts` rather than under `ui/` because `net/rooms.ts` validates ids
  against it, and `net` must not import from the UI layer.
- **`src/ui/sound/engine.ts`** is the only half that touches the browser.
  Everything in it is lazy and nothing runs at module scope, for the same reason
  `localStorage` is kept out of module scope: `environment: 'node'` means a
  construction at import time would take out every file that transitively imports
  it. **The context is not built until sound is switched on**, so a device that
  never gets there never allocates an audio device at all. Verified in a real
  browser: a client with sound off reports zero `AudioContext`s after another
  client has pressed a soundbite.
- **There is no queue: clips overlap.** There was one, and it was the first thing
  the table complained about - see below. Every clip now starts at `currentTime`.
- **A limiter on the master**, threshold -6, ratio 20, 3ms attack. Same shape as
  the one the research note put on the receiving end of a voice clip, and the
  reason the recipes can be careless about stacking.

#### The head row overflow, which was already there

The board's island in the top right goes to four buttons when the note is
showing. That is 39px more in a row that also carries the round number, the name
and score, and a "reconnecting" pill. It put the island's right edge 12px past
the edge of a 393px phone, taking the theme toggle with it.

The cause was not the flex row and was **not new**: `.game` is a grid with one
implicit `auto` column, and a grid item's automatic minimum size is its
MIN-CONTENT width, so a head row that did not fit did not shrink to the phone, it
made the column wider than the phone. On `main` before any of this, a long name
plus the reconnecting pill already pushed the toggle off screen at 360 and 393.
The fourth button only made it reachable with a short name too. `min-width: 0` on
`.game-head` is what lets it shrink, and `.game-head .muted` is what actually
gives, because the name and score are the only thing in the row that is not a
control or a fixed fact. It must not wrap: the head is an `auto` track and a
second line comes straight off the board.

`gameHeadLayout.test.ts` measures it at every size the tableau suite covers, with
a short name and a long one, with and without the pill. It checks three separate
things, because two of them would pass while the row was still wrong: nothing
past the right edge, the island still on one line, and **all four buttons still
at their full 37x30**, since squeezing them would "fit" and quietly undo the 20%
they were deliberately given.

`soundLauncherLayout.test.ts` does the same job for the hand: the launcher covers
no card, does not sit on the stuck note, and its menu opens upwards and stays on
screen at BOTH wood sides. That last one is why it is worth measuring - the menu
is anchored to the launcher, which moves end to end with the Dash pile, so a
fixed side would hang half of it off the phone for every left-handed player. The
harness derives `--hand-card` the way `.game` does rather than pinning it to a
number, because a row wider than the phone would hang the menu off it however the
menu is written.

### The drop zone and the board _(#8, #3, #21, #23)_

**The whole board area is the drop target, and the grid sits INSIDE it.** That is
the only arrangement that works: `parseDrop` walks *up* from whatever is under the
finger, so a sibling overlay is invisible to `closest()` however it is stacked.
Nesting also made the gaps *between* slots droppable, which they never were. The
dashed "drop here" box it replaced is gone; the grid kept the position it always
had, so nothing moved.

**Watch:** each slot's `onClick` calls `stopPropagation`, because it is inside the
zone's click handler. Without it a tap on a slot also runs `onSnapTap` - harmless
today, since `playTo` clears the selection synchronously and the second call finds
nothing to play, but one refactor away from not being. `render.test.ts` pins the
nesting itself, not a class name.

The zone is invisible at rest and only speaks when it has something to say: a soft
green wash plus a caption while a held card has somewhere to go, and the "no moves
left" note when it has not. The note lives in the zone's second grid row so it
sits at the tableau end and can never land on the grid - which also stopped the
board shifting up the screen the moment somebody got stuck.

- **Amber, not red**, and it was changed to red once and reverted on sight. Two
  tokens, `--warn` (fill) and `--warn-ink` (text), split for exactly the reason
  `--danger` is: dark mode needs the text to lift off the surface while the fill
  stays dark enough to carry white. Being stuck is a state, not an error, and red
  is spoken for - a scoring penalty, and the fill behind the disconnected pill.
- **`min-height`, not a fixed height.** Pinning it removes the growth escape
  hatch, so the copy shortened instead: "No moves left - waiting for the others",
  which fits one line at 360px in both themes. Longer copy still reflows.
- **The two messages can never collide**, so nothing had to be hidden: a stuck
  player has no legal targets, which is precisely when the zone is unlit.

**The grid picks its own shape from the box it has** _(#24, 2026-08-28)_. Four
rows was fixed by design - "height is the scarce axis on a phone" - which is right
on a tall screen and wrong on a short one: a four-player board in a Safari tab
was height-bound at 4×4 with width going spare on both sides. Measured, at 393px:

| | columns | slot |
|---|---|---|
| 851px tall (home-screen app) | 4 | 74.8px |
| 620px tall (Safari tab) | **6** | **51.0px** (44px at four columns) |

Two things follow from it that are deliberate. **The bottom row can be ragged** -
16 spaces at six columns is 6/6/4 - because a bigger card is worth more than a
tidy rectangle; holes are only ever used as a tie-break between shapes within a
pixel of each other. And **two phones at one table may lay the same board out
differently**, which is fine and already true of the rails: the shape is local
presentation, derived per client, and no rule reads it. The one board where it is
NOT free is the orderly one - see the sizing section.

**The corner island** (`.head-btns` / `.corner-btns`) is `--btn-w: 37px`, up from
30 - 20% wider. The extra went into the buttons rather than the gaps, so what grew
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

1. **A pile under the finger wins - IF the card can go there.** Placing a card on
   a square you chose must not be overruled by how fast you got there, but that
   reasoning only holds for a square the card can actually land on: you cannot be
   choosing a square that will refuse it. A thrown card whose square cannot take
   it falls through to the aim below. A card DROPPED there, with no throw to fall
   back to, still goes to that square and is still refused, exactly as before.
   `dropSpace` in `useDrag.ts` is the whole decision, and it is pure so it can be
   tested without a DOM. **This was a reported bug** - see #65.
2. **The LINE of the throw** (`throwOf` → `aimedAt`). A flick says a direction
   and nothing dependable about distance, so the card goes to the legal space
   nearest the line of the throw. Aim at nothing and it does nothing - that is
   the wild-flick case, and it is deliberate, or the gesture becomes "shake the
   phone to play a card".
3. **Where they let go**, but only if that point means "the middle": over the
   board, or anywhere above the player's own hand (`[data-hand]`). This is what
   catches a throw that OVERSHOT - aim from a release point past the board points
   back down at it, so the aim finds nothing and the release decides instead.

**`aimedAt` itself has four rules, and only the last one is a guess.**

1. **It ended ON a space.** That is where they put it; nothing else is weighed.
2. **It ended within `FLICK_NEAR_PX` (25px) of one**, measured to the space's
   EDGE, in ANY direction. This is what covers the rest of the circle. The cone
   only looks forward, so a throw that overshoots a space by a hair leaves it
   BEHIND the release point where the cone cannot see it at all - reported from a
   table as the space simply not being playable. `edgeDistance` is zero anywhere
   inside a space, so one measure covers both rules; a centre-to-centre one would
   call a throw that stopped just inside a big slot "half a card away".
3. **It was POINTING at one**, within `FLICK_MAX_AIM_DEG`, now **20** (a
   half-angle, so a 40 degree cone in front), narrowed from 30 on 2026-09-10 off
   the bench. It was 45 while direction was the
   last thing between a throw and nothing at all; rule 4 took that job, so a
   narrower cone can ask the player to point at something.
4. **And last, its PATH ran over one, or within `FLICK_NEAR_PX` of one**
   (`crossedBy`). A hard flick carries the finger straight over the space it was
   aimed at and out the far side, off the top of the board or onto a square the
   card cannot go, and the three rules above all judge where the throw ENDED UP,
   so all three miss it. The path is the whole sample window, so it follows a
   hooked flick round its corner rather than cutting the straight line from start
   to end. **The near radius rides along the whole path** rather than sitting only
   on its end, so a throw that shaved past a space counts as having gone over it:
   the forgiveness rule 2 gives the release point, given to every point the
   finger passed through. That band is measured properly and not by fattening the
   box - `nearRun` takes the closest approach between the segment and the
   rectangle, so a corner is reached diagonally and a point 35px out on the
   diagonal stays outside a 25px band.

   **It is LAST on purpose**, and it was third for a day before a bench session
   said otherwise. A space swept at the START of a flick is the oldest thing the
   gesture knows and the flick carried on past it, so anything the end of the
   throw has to say outranks it. Where a path sweeps several spaces the LAST is
   taken, for the same reason. The practical effect is that the sweep is rare:
   the cone catches most throws first, and what is left for the sweep is a throw
   with no legal space ahead of it at all, which is the case it was added for.

**The near radius came down from 45 to 30 when rule 3 arrived**, and to 25 off
the bench on 2026-09-10. Proximity had
been carrying the overshoot case alone and had to be generous to do it; the path
rule takes that job and takes it exactly, so the radius went back to meaning
"stopped basically on it" rather than a blind circle round the release point. It
is now ONE number doing two jobs - the circle at the release point, and the width
of the band swept along the path - so moving it moves both, which is why the
bench's near-radius slider is the strongest knob on the page.

**`spaceCentres` returns boxes, not points**, because rules 1, 2 and 3 all need
the width and height.

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
  a reposition.

**There is a bench for tuning all of this**, built 2026-08-31, and it is deployed
with the app: `public/flick-bench.html`, served at `/deutsch-dash/flick-bench.html`.
Vite copies `public/` verbatim, so it needs no route and no link from the game.

It ports `throwOf` and `aimedAt` **verbatim**, traces the thumb, draws the cone and
the near radius, and puts every threshold on a slider with a readout saying which
one a throw failed on. After a throw every LEGAL slot is coloured by what happened
to it - **green** for the one it chose, **yellow** for one a rule could still have
reached, **red** for one nothing could reach - and its bearing line takes the same
colour, so a slot, its row in the readout and its line never disagree. Illegal
slots stay grey: they were never in the running, which is a different thing from
being missed. It is the only way any
of these numbers has been judged against a real thumb, and the numbers a tester
reports are the numbers the game uses. `noindex`, no analytics, no storage: the
sliders live in the tester's own browser and nothing is sent anywhere.

**A NEW RULE GOES ON THE BENCH AND STOPS THERE** until the table says to ship it.
Asked for on 2026-08-31, after the swept near radius went into the game and the
bench in one commit: every push deploys, so a rule that lands in `useDrag.ts` is
live at the next playtest, on the phones of people trying to play a game rather
than test one. The bench exists so that a rule meets a real thumb before it meets
a real table, and putting it in both at once spends that for nothing.

So the mirror rule now runs ONE WAY. **The bench may be ahead of the game; it must
never be behind it.**

- A new rule: bench first, `useDrag.ts` only on approval. While it is pending it
  has to be LABELLED in the bench UI as not in the game yet, or a tester cannot
  tell which of the two they are judging. There is a `.pending` banner under the
  rig that says what differs and why, and any verdict the pending rule decided
  carries a second `pending` tag beside `played`.

**Nothing is pending: the sweep order is the only rule to have been through the
gate.** Asked for on 2026-08-31: a slot swept at the start of a flick is the
oldest thing the gesture knows, and the flick carried on past it, so anything the
END of the throw has to say - where it stopped, what it stopped near, where it
was pointing - outranks it. It sat on the bench alone for a day and shipped in
`e9bf58c` on 2026-09-01, once a thumb had agreed. Bench and game now run the same
order: stop point, near radius, cone, then sweep, which is the four-rule list
above.
- Tuning a number both already share - the near radius, the cone, the speed
  floor - is not a new rule and does not need the gate. Those move in both at
  once, which is the whole point of the sliders.
- Anything that lands in `useDrag.ts` still has to reach the bench in the same
  change, or the bench falls behind and starts being a lie.

**The board is the real board, at any table size.** A row of seat buttons
rebuilds it for 2 to 8 players. The first cut of this guessed at the box and got
the shape wrong - it drew a 4-player board at six columns where the game draws
four - so the numbers were MEASURED off the running game at 393 x 851 instead,
and the bench reproduces them:

| players | spaces | cols | slot | board box |
| --- | --- | --- | --- | --- |
| 2 | 9 | 3 | 96.0px | 333.7 x 514.1 |
| 3 | 12 | 4 | 79.3px | 333.7 x 469.3 |
| 4 | 16 | 4 | 73.7px | 333.7 x 469.3 |
| 5 | 20 | 5 | 62.3px | 333.7 x 469.3 |
| 6 | 24 | 5 | 58.2px | 333.7 x 469.3 |
| 7 | 28 | 6 | 58.2px | 377.0 x 469.3 |
| 8 | 32 | 7 | 49.1px | 377.0 x 469.3 |

`gridColumns` and `slotFor` are ported, and the box is the only input they need.
It changes exactly twice down that table: the rails leave the flow at seven
players so the board takes the full width, and a table with ONE opponent has a
shorter strip above it so the board takes more height. Everything else falls out
of the algorithm, which is why every column count and every slot size above
reproduces to a tenth of a pixel. Three details had to be right for that: the gap
is `clamp(4px, 1.4vw, 10px)` off the tester's own screen and not a fixed 7px; the
slot cap is 96px, which is what a 2-player board actually hits; and the caption
row reserves **40px**, not the `CAPTION_PX` of 34 the game's own source says,
because 40 is what the real board leaves. The rig is `min(100vw, 430px)` so that
on a phone it IS the screen - the box is a fraction of it, so a rig narrower than
the screen makes every slot too small.

Two departures from the game, both deliberate. The board is not rebuilt on
resize: a phone fires that whenever the address bar moves, and a rebuild throws
away the throw being looked at. And there is no head or opponent strip above the
board, only the height they would have taken, because the gesture only cares how
far the board sits from the hand.

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

### Five things off one list _(2026-09-09)_

**The four host options moved below the ready button.** They are set once by one
person and never touched again, and above the ready button they were four rows of
furniture between the room code and the only control most players come to that
screen to press. They sit under the sit-out button rather than immediately under
Start anyway, so that the ready button and the quiet sit-out beneath it still read
as one block.

**Rematch waits three seconds**, and says so: `Rematch in 3...`. It arrives under
a celebration, in the same spot the ready button occupied on the round-end sheet a
moment earlier, so a host still tapping through the last round would deal a whole
new game before anybody had read who won. Counted down out loud rather than only
greyed, because a button that does nothing and does not say why reads as broken.

**Only the winner gets the fireworks.** A dash rains emoji on everybody, because a
round is a thing that happened to the table; winning the game happened to one
player, and eight seconds of fireworks fired at the people who just lost reads as
gloating.

**The ready dot became a pill around the name**, and it now says AWAY as well. The
dot was 8px in a 10px column carrying four meanings, which is not readable on a
phone at a glance; the name is the thing an eye lands on, so the name is what
carries the state. Four states in the lobby's own colours - white not ready, green
ready, yellow away, grey sitting out - as literals in both themes, for the reason
the ready button gives: two phones at one table set to different themes have to be
showing each other the same thing. **Away outranks ready**, deliberately: a player
who readied and then put their phone down is still somebody the table is waiting
for, and `tableReady` already agreed.

**A total on either score sheet opens that player's game so far.** The data is new:
`GameStats.history` keeps a line per round of who scored what and what their total
became, written by the host in `commitScores` beside the rest of the tally.

- **Keyed by round number, not appended to an array.** `nextStats` is idempotent
  because it computes from the pre-write snapshot, and a history that appended
  would have grown by a line every time two hosts raced. The key makes re-writing
  a round a no-op.
- **No rules change.** `stats` is host-writable with no child validates at all, so
  a new shape underneath it needed nothing deployed.
- **It can be missing, and that is not a bug.** The tally is the commit's SECOND
  write and its failure is swallowed on purpose, so that a decoration can never
  take a round's scoring down with it again (see the first iPhone playtest). A
  round can be absent from the history while its score is perfectly real on the
  sheet above, and a game that started before this shipped has none at all. The
  panel says so rather than rendering an empty box.
- A round with a TOTAL but no DELTA is a round that player sat out. A round with
  no total for them at all is a round they were not in, and it is left out.

### The carousel cycles its remarks _(2026-09-10)_

"Don't re-use a remark from a previous round unless the others aren't relevant."
The rules overlap enough that the same handful wins on priority every round, and
a carousel that says the same six things after every round is one people stop
reading.

**A strict two-band sort, not a penalty.** Anything shown in the last couple of
rounds goes behind everything that was not, whatever its priority, and only fills
a slot the fresh ones could not. A penalty big enough to matter would have been a
second priority scale to keep in your head, and one small enough not to would not
have changed anything.

- **`RECALL_ROUNDS` is 2, not "for ever".** With six drawn a round, a whole-game
  memory goes cold after three or four rounds and every remark is equally stale,
  which is the same as having no memory at all. Two keeps about a dozen ids warm
  and lets a good line come back around.
- **Kept per ROUND and read strictly BACKWARDS.** `remarksForRoom` runs on every
  render - the carousel re-renders on a timer - so a memory that recorded what it
  returned and then read it back would answer differently on the second render of
  one sheet. Recording under the round number and consulting only earlier rounds
  makes the input to round N fixed once round N exists. `rememberRemarks` keeps
  the FIRST answer for a round for the same reason.
- **A rematch needs no telling.** It counts from round 1 again, and reading
  backwards from 1 finds nothing.
- **Client-local, deliberately.** Two phones can drift on which lines they have
  seen - somebody who joined at round four has a shorter memory than the host.
  The alternative is a database write per round carrying a list of joke ids and a
  shape in `stats` every client must agree on before the sheet can be drawn, which
  is a lot of machinery for a decoration.
- **The cost, which is worth knowing.** A round whose headline repeats - two
  stalled rounds in a row, say - now leads with something smaller, because
  `stalled` is stale and six other rules are not. That is the trade the ask makes.
  If it ever reads badly the lever is the one comparison in the thinning pass and
  nothing else.
- **How many survive can change with the order**, and legitimately: `MAX_PER_PLAYER`
  is applied in order, so re-ordering changes which remarks it reaches first. The
  tests pin that the sheet is never blank and never repeats itself, not that the
  count is stable.

### Genius lies in wait, the countdown has tones, and the sheet got ruder _(2026-09-10)_

**The ambush is the nastiest cheat in the box.** A Genius holding a card that
CONTINUES a run does not play it. It waits for the player to reach for a card of
their own, and takes the space the moment a finger goes down - before the card in
the hand can get there. Two seconds of nobody reaching and it plays anyway, which
is what stops it being a bot that never moves.

- **It supersedes the race edge for that shape**, and deliberately. Sniping the
  space the instant a person PLAYS is a race they can at least see coming;
  answering the reach is not. The 100ms edge still covers everything else.
- **Only a run-continuation is held.** An Ace opening an empty space is not next
  in any sequence and any empty space will do for it, so there is nobody to
  ambush out of it - and a bot that held its Aces too would just be a slower bot.
- **It can only see the finger on the HOST's device.** The host drives every bot
  and a touch is not written anywhere; broadcasting one would be a database write
  per finger, per card, for a decoration. So at a table of several humans the
  others race it on the ordinary edge. That is the honest limit of the cheat.
- **`reachedAt` and `ambush` are the same device's clock**, compared only against
  each other. Never two devices' - the thing `awayAt` and the race nonces are so
  careful about.
- **The wake-up while waiting is the cap itself**, not the ordinary delay, so the
  bot gives up exactly on time; `springAmbush` pulls it forward to zero the
  instant a finger goes down. A poll would have handed back exactly the head start
  the cheat is for.

**The lobby countdown has tones**, given as a synthesis recipe: a band-limited
pulse at 30% duty with its upper partials rolled off, through a 3.2kHz lowpass.
440Hz for 3, 2 and 1; 880Hz held longer for GO.

- **Translated, not shipped as a file.** `createPeriodicWave` takes the harmonic
  series directly, which is what the recipe already was - additive, so there is
  nothing to alias.
- **The timing is not in the recipe.** It placed its beeps a second apart by hand;
  here every client plays a tone when the DIGIT CHANGES, so the sound cannot drift
  from the number on screen - they are the same event. The host's write is the
  single clock, exactly as `RoomMeta.countdown` describes.
- **The first digit seen is adopted in silence**, so walking into a lobby that is
  already counting does not fire the number you arrived on. That rule again.
- Gated by the device's own sound switch and nothing else. `soundsOn` is the
  host's switch for the BOARD, and the lobby has always been where a table finds
  out sound exists at all.

**The race remarks moved up the order, and there is a third one.** `bully` and
`unlucky` were written at 60-62, which put them under about twenty-five other
rules competing for six slots - so they existed and were essentially never seen.
The table asking for both by name is as clear a statement as there is that races
are what this room finds interesting, so they now sit at 83 and 81, with a new
`most-races` at 79 for whoever was in the most of them however they went.
**Priorities follow what people want to read, not what was written first.**

### A finished pile turns over, and the bots hesitate _(2026-09-10)_

**A completed pile now shows whose it was before it goes.** `centerPlayTxn`
archives the run and clears the space INSIDE the transaction the instant the tenth
card lands - which is right and must stay that way, it is what stops a stale
client reviving a finished pile - but it meant the most satisfying moment on this
board happened entirely off screen. The card landed, the space was empty a frame
later, and a chip appeared on the rail.

It now turns face down over the slot, showing the badge of whoever put the tenth
card down, holds for **800ms** (asked for by number), and clears away.

- **Drawn from the ARCHIVE, not the stack.** A run appearing in `space.history`
  is the event, and the last card of that run is the 10 that completed the pile -
  which carries its `owner`, and that is the only place the credit survives.
  `finishedPiles.ts` is that, pure, for the reason `hitTest.ts` gives.
- **Seeded at mount**, so walking into a game in progress does not replay every
  pile already finished. Third time this rule has come up in two days - the
  store's `saidAt`, the emoji rain, and now this. **Arriving somewhere is not an
  event.**
- **Over the slot, not in it.** The space is free the moment the pile completes,
  so somebody may already have played an Ace into it; the finish covers that
  rather than fighting it for the grid cell. `pointer-events: none`, because a
  decoration that could eat a play is worse than no decoration.
- **The removal timers live in a ref, not in the effect's cleanup.** `spaces` is a
  fresh array on every snapshot, so the effect re-runs constantly and React runs
  the previous cleanup each time. A cleanup that cleared them would cancel the
  removal of a finish still on screen on the very next snapshot - tens of
  milliseconds later on a live board - and that run starts no new timer, because
  nothing finished on it. The pile would sit there face down for the rest of the
  round.
- **`PILE_FINISH_MS` covers all THREE phases**, turn and hold and clearing away.
  At turn + hold the element unmounted exactly as its exit animation began, so the
  pile vanished instead of clearing away - and nothing failed, because the browser
  had computed the right animation and simply never got to run it. That is why
  there is a browser suite for this as well as a unit one.
- **Reduced motion keeps the finish** and drops the spin. Whose badge is on the
  back of that pile is information, not decoration.

**The bots hesitate two turns in three.** Off a specific complaint: "I play a 5
from my wood pile, I also have a 6 on one of my middle piles. I don't have time to
go for that 6 before the bot has already placed their 6." That moment - spotting
your own follow-up and getting to it - is what this game is about, and a bot that
answers it instantly takes the moment away rather than contesting it.

`HESITATE_CHANCE` is two thirds and `HESITATE_MS` is 800, both in `botDelay`.

- **Two thirds and not always**, which was asked for in those words: "it's fine if
  they're that fast on occasion". A bot that always hesitated would just be a bot
  with a slower band, and the ladder already has four of those. One you cannot
  count on being slow is a different opponent - the same argument the profiles
  make for `dither` over a flat rate.
- **Not a profile knob.** Every level gets it at the same rate, because the
  complaint is not about difficulty: it is about a human having time to reach for
  a card they have already seen, and that is the same length of time whoever they
  are playing. `bot.test.ts` pins that the ladder's order survives it.
- **It does NOT reach the Genius race edge**, which is a separate cheat that was
  asked for by name and fires on its own 100ms path without going through
  `botDelay` (see `armRaceEdge`). So a Genius bot still snipes a space the moment
  a person plays. That is a deliberate choice between two instructions that pull
  opposite ways, and it is the one to revisit first if the complaint comes back.

### Six things the first table found in the soundbites _(2026-09-10)_

All six came off one message, hours after the feature shipped, and four of them
were the same mistake in different clothes: **the machinery was built to protect
the table from too much sound, and the table wanted more.**

**Two bugs.**

- **The first press of a soundbite made no sound.** Every `AudioContext` starts
  suspended and may only be resumed inside a real gesture, and `playSoundbite`
  returned at that point - so the first press woke the device and went quiet, and
  the second one worked. It now resumes and then FIRES, from the resume's own
  continuation, because the schedule still cannot be written against a clock that
  is not moving. `engine.test.ts` exists for this: there is no `AudioContext` in
  node, which is why this half had no test and why the bug got out.
- **Emoji fell at the start of a round.** `lastSound` is a nonce and is never
  cleared, so it outlives the screen it was played on, and `SoundRain` mounts once
  on the lobby and again on the board. A soundbite pressed in the lobby therefore
  rained over the first board nobody had touched yet. The layer now adopts
  whatever the store holds AT MOUNT, which is the same "arriving somewhere is not
  an event" rule the store's own `saidAt` map follows. Reported as random, and it
  was not: it was every game where somebody pressed one in the lobby.

**Four things that were working as designed and wrong anyway.**

- **The queue is gone.** Clips were scheduled one after another so they would
  never overlap, on the reasoning that two clips at once is a noise rather than
  two messages. At a table that reads as lag: press twice and the second arrives a
  clip and a half later, which does not read as a second press at all. Every clip
  now starts at `currentTime` and they pile up. **The limiter is what makes that
  safe, and it was always there for exactly this** - it is why the recipes could
  be careless about stacking in the first place.
- **The emoji stack too.** One layer keyed on the nonce meant a second press
  restarted the first mid-fall, which looks identical to one that was never
  interrupted - so pressing twice looked like pressing once. Capped at six with
  the oldest dropped, so the screen always shows the most recent presses.
- **The menu stays open.** It closed on every soundbite pressed, so a table firing
  off three in a row reopened it twice. **The auto-close now belongs to the HOLD
  gesture and to nothing else**, which is the whole difference between the two:
  a hold is one soundbite and back to the board, a tap is a menu that stays until
  you put it away. Three things close it - the launch button tapped again (it is a
  toggle now), a press outside it, or the hold completing.
- **Ta-da was too harsh**, and it is a soft chime now. Worth knowing WHY, because
  it is a trap for the next recipe: its noise burst was lowpassed at 6kHz, which
  puts most of its energy exactly where a phone speaker is peaky and an ear is
  most sensitive, and the triangle at 1319Hz stacked odd harmonics on top of that.
  The replacement is three sine partials of one bell, nothing above 1kHz, no
  noise. **It keeps the id `tada`** - the ids are enumerated in
  `database.rules.json`, so renaming one needs a rules deploy out in front of any
  client that sends it, and a player never sees the id. The label is "Nice one".

**Two pure modules came out of the components**, `launchGesture.ts` and
`soundFalls.ts`, for the reason `hitTest.ts` gives: there is no DOM anywhere in
this test suite, so behaviour left inside a component cannot be tested at all.
Both of the bugs above and both of the gesture rules are pinned in them now.

### A wood turn at half speed, and the gather in the middle of it _(2026-09-10)_

Two things off one message, and the second is the interesting one.

**The flipping slowed down, and then overlapped.** Two passes the same day.
First 200/200 to 400/400 - both numbers, because doubling the duration alone would
have left the cards overlapping, and overlap was on the "hard to watch" list. Then,
having watched it at half speed, **300/250 with the overlap deliberately back**:
the thing that made the first cut unwatchable was the CROSS-FADE, not the overlap,
and opaque cards that overlap read as a hand dealing. Then 300/200, another 50ms
off the step, once that had been watched too. All three values live
in `WOOD_TIMING`, and `woodTimeline.test.ts` pins them in exactly one test and
everything else as relationships, because they have now moved twice in a day.

**A shorter step than flip broke a join that had been getting away with it.**
`collectAt` was `before * step`, which is "when the last card ahead of the gather
lands" only while `step` and `flip` are equal. They no longer are, and it would
have started the gather 50ms before that card came down. Both joins are now written
out: the gather waits for the card ahead of it to LAND, and the cards behind it wait
for the gather to FINISH. **Cards overlap each other by design; nothing overlaps the
gather.**

**The gather is 250ms**, up from 180ms - it read as abrupt once the cards around it
slowed down.

**The gather moved into the middle of the deal.** A turn that runs out of
face-down cards finishes itself off the ones already face up, and the board used
to draw that as: gather, then deal all three. What the table asked for is what a
hand of real cards does - deal out the one or two the pile has LEFT, gather the
rest up onto the draw pile, then deal off those to complete the three.

- **`flipWood` did not change.** It already produces exactly that order: the
  rotation puts the remaining face-down cards at the front and the gathered ones
  behind them, so `dealt` is already "the last cards of the pile, then the first
  cards of the pile it became". Only the clock the board draws it on changed.
- **`dealTimeline` is that clock**, and all of the arithmetic lives in it: each
  card's delay, when the gather runs, and how long the whole move is. It is
  exported and unit-tested, because a stagger that is no longer a plain multiple
  is not something to keep in a stylesheet.
- **The store had to say how many cards came first.** `woodCollectedAt` became
  `woodTurnover`, an object carrying the nonce and `dealtBefore` together. That
  count survives nowhere else - after the turn those cards are indistinguishable
  from the gathered ones - and it is one value rather than two fields so a board
  cannot pair this turn's nonce with the last turn's count.
- **`before` is 0, 1 or 2, never 3**, because a turn-over only happens when fewer
  cards are face down than a turn deals. At 0 - a recycle of a pile already all
  face up, and every turn-over under the host's single-card rescue - the timeline
  collapses to the old gather-then-deal, which is right: there was nothing left to
  deal first.
- **The delays ride on the pile, not on the cards.** `--d0`/`--d1`/`--d2` go on
  `.wood-deal` and the stylesheet's nth-child rules hand them down, falling back to
  the plain stagger for the drag preview, which renders a bare `.wood-deal`.
  Wrapping each card to carry its own style would have put a second transformed box
  between the animation and the card, and `.wood-deal > *` is deliberately the card
  itself.

**A bug came out with it.** `.wood-deal.collecting > *` added the gather's length
to every card's delay, and the class was cleared after `COLLECT_MS`. So the class
came off while the later cards were still sitting in their delay, and they were
re-timed forward by its length: the deal never really waited for the gather except
for its first card. The class now lasts the whole move and carries no timing.

**There is a second browser suite now**, `woodFlipTiming.test.ts`. The arithmetic
is unit-tested, but the numbers have to reach the cards through two CSS hops, and
a typo in either leaves everything on the fallback stagger with nothing failing.
It measures `animation-delay` in real Chromium. `tableauLayoutCoverage.test.ts`
stopped naming one file and now finds every suite that imports playwright, so a
third cannot arrive without being gated on `LAYOUT` too.

### The bots aim low, and Genius cheats _(2026-09-10)_

Two requests off one message, and only the first one touches every level.

**A bot puts its card in the lowest space that will take it.** For any one card
every legal space is the same kind of landing - an Ace only ever opens an empty
space, and everything else only ever continues a run of its own suit - so which
one it goes to was free, and the bot was spending it on whichever came first,
which is the top-left of the board. On a big screen that is a long way from the
hand the player is actually watching. `lowestSpaceFor` re-aims the play AFTER the
move has been chosen, so it never competes with choosing it, and it runs on the
sloppy path too, which is most rolls at the bottom of the ladder. Every level,
because it is not a handicap in either direction.

**Genius may now break four rules.** Asked for in those words: "that player should
be able to cheat". The top rung was already about as fast as a rung can be before
it stops looking like a player, so the way up was to let it know more and reach
further rather than to shorten its delay again. `BotProfile.cheats` gates all four
and only Genius has it.

- **A one-card lap every third time round the wood** (`botWoodStep`). A
  three-at-a-time cycle only exposes every third card when the pile length is a
  multiple of three, which is how a round is dealt; this is the host's deadlock
  rescue, granted permanently to one player and switched on by itself. The base is
  still the TABLE's step, so the cheat can only ever make a pile more reachable
  than the rules allow, never less.
- **It can put the last turn or two back face-down** (`rewindWood`, `rewindMoves`)
  to reach a card it has already gone past, when the board has since made that
  card playable. Ranked at 50: below every centre play, above every post build, so
  it goes back when the alternative is shuffling cards between posts and never
  when there is a card to put on the board this instant. Only the index moves, so
  `persistWoodIndex` is the correct write.
- **It answers a board that moved in 100ms** (`GENIUS_RACE_EDGE_MS`, `armRaceEdge`
  in `store.ts`). A person has to see the card land, work out what it opened and
  get a card of their own onto it; a tenth of a second is inside all of that, so
  Genius wins essentially every race it goes for. It is a REACTION and not a second
  clock: it is armed only on a snapshot where a centre space actually changed
  hands, and only for a bot that has a card it could put on the board right now.
  Between board changes Genius still runs at its own 320-700ms delay.
- **It plays off the whole Dash pile, not the card on top of it**
  (`dashPlanBonus`). That pile is the one piece of hidden information a player
  holds and emptying it is the only way to win a round, so this is the cheat that
  is really a cheat. Worth at most 25, scaled by how deep the card it frees is
  buried, which is less than the 30-point gap between a Dash play and a wood one -
  so a plan can reorder moves inside a tier and can never talk the bot out of
  playing off the Dash pile itself.

**`rankMove` is still the same function for every level.** None of these makes
Genius a better judge of a legal move; it knows more, reaches further and answers
faster, which is what cheating is. That line is worth keeping, because the moment
a cheat becomes "plays better cards" the ladder stops being tunable.

**One old inconsistency went with it:** `driveBot` called `flipWood(t)` with the
default step and so turned three at a time straight through the host's
single-flip rescue, while `syncStuck` was already judging the bot at one. A bot
turning three while judged on one can sit out the whole rescue holding the card
the rescue existed to reach. It uses `woodStep(room)` as its base now.

### The host can remove a player

Asked for on 2026-09-09. The host gets a **Remove** in the lobby beside the one
that removes an AI player, and a small **x** on each opponent in the strip during
a game. Two taps in both places, armed and self-disarming, the same shape the
board already uses before it sits somebody out: removing a human cannot be undone
from this side, and the strip's button sits on a board being played at speed.

**No rules change, and nothing to deploy.** `players/$uid` has always been
writable by `auth.uid === $uid || hostId === auth.uid`, and so has
`round/tableaus/$uid`. That grant was there for the host's own housekeeping and it
covers this exactly. It is a claim about the rules, so it is checked in
`rooms.emu.test.ts` rather than read off the file - including the half that could
have quietly broken the whole feature: `badges/$badgeId` carries a `.validate`
demanding `newData.val() === auth.uid`, which a host cannot satisfy for somebody
else's badge, and if it applied to a DELETE the multi-path write would fail
atomically and Remove would do nothing at all. RTDB skips `.validate` for
deletes. Proven, not believed.

**The hand goes with the player.** `scoreRound` walks `tableaus`, not `players`,
so a hand left behind would go on being scored for somebody who is not at the
table; `kickPlayer` deletes it in the same write. The cards they already played
into the MIDDLE stay there, still carrying their uid - they are on the table in
the physical game too, and you do not get them back by leaving.

**Two things are deliberately left alone.** `round/seats` is the size the board
was DEALT at and the board cannot reflow under everybody mid-round, so the seat
stays empty until the next deal builds a fresh one. `meta/playerCount` cannot be
decreased at all - its validate refuses it, which is what stops two racing joins
reusing one seat - so a kick does not hand the seat back on the server, exactly as
removing a bot does not. It only bites at eight.

**The kicked player's own client is the harder half**, and it is all in the
snapshot handler. The rule is "I was in this room's players a snapshot ago and I
am not now": nothing else removes a live human's record, an expired room arrives
as `room === null`, and leaving unsubscribes first. Three things about it:

- It runs **before the new room lands in state**. The board reads
  `room.players[uid]`, and one render of a room this player is not in is a crash
  rather than a flicker.
- It calls `abandonPresence()` **before** `leave()`. The normal teardown writes
  `connected: false`, and writing to a record that has just been deleted does not
  fail - it CREATES it, as a nameless `{ connected: false }` ghost holding a seat
  in the lobby. `onDisconnect` is cancelled either way, or the server writes that
  ghost later, when the socket finally dies.
- **The URL has to move too, and that was found by driving it.** The store leaves
  the room but never touches `location`; a room route with an idle store is the
  JOIN FORM, so the first working build dropped a kicked player onto a form
  offering to put them straight back in, with the message nowhere in sight. The
  redirect lives in `App.tsx` beside the other route-versus-store reconciliation.
  Every unit test passed while this was broken.

**They can come back with the link, and that is the decision.** Knowing the room
code is the credential everywhere else in this app (see the trust model), so a
ban list would be the only node in the room that meant anything else - and it
would cost a rules change, a deploy, and the both-directions release check, to
deter somebody who can clear site data and mint a fresh anonymous uid anyway.

**Proved by driving two real clients against the emulator**, which is the only
way the eviction path can be seen at all: the guest lands on the home screen
reading "The host removed you from the room", `players` holds the host alone with
no ghost after the socket has had time to die, the freed badge is claimed by the
next player through the door, and mid-game the kicked hand is gone from
`round/tableaus` while the host is still on a live board.

### The icon: two drawings, the PNGs, and the one on the home screen

The tab and home-screen icon is a fanned stack of three cards with an orange
diamond and three speed lines, on a navy tile. It replaced the two cards and a
white `1` on 2026-09-06, from a drawing the table supplied.

**It is FULL BLEED, and that is the load-bearing part.** The drawing arrived on a
380 canvas with the tile inset at 40,40, which looks right in a browser tab and
wrong on a phone: iOS composites a transparent touch icon onto black and rounds
the corners itself, so an inset tile comes back small, inside a black square,
with its corners rounded twice. The tile now fills the viewBox and the phone
masks whatever it likes. The manifest asks for `purpose: "any"`, so nothing crops
it; under a circular mask a corner of the back card would go, which is the reason
not to claim `maskable` without redrawing for it.

**The PNGs are rendered from the SVG, not drawn a second time.** `npm run icons`
runs `scripts/make-icons.mjs`, which rasterises `public/icon.svg` in the Chromium
the layout suite already installs and writes `icon-512.png` and `icon-180.png`.
It paints the rounded corners back in with the fill it reads off the `#tile`
rect, so the PNG is an opaque square: transparent corners are the same iOS
problem again, one layer down. The script it replaced never read the SVG at all -
it rebuilt the same shapes by hand in PIL and loaded a font by absolute Windows
path, so it ran on one machine and nothing held the two drawings together.

**There are TWO drawings, and the tab gets the small one.** The full icon at a
tab's real 16px is a dark square with an orange speck: three cards, three speed
lines and a diamond cannot survive being that small, and the `1` it replaced
could. `public/favicon.svg` is the same tile, white and orange with one card and
one diamond, rendered to `favicon-32.png` and `favicon-16.png`. It is what
`index.html` and the bench link as `rel="icon"`, and the full drawing is left
where it is shown large: the 512 fallback, the touch icon and the manifest. The
full SVG must NOT go back into a `rel="icon"` link beside it - a browser picks
one out of that list, both are unsized SVG candidates, and it is entitled to
prefer the wrong one. `icon.test.ts` fails if it reappears there.

**The full drawing is also on the home screen**, 44px, left of the title, since
2026-09-06. It is the only place in the app itself that shows the icon, and it
takes the FULL one rather than the tab cut: at 44px there is room for all of it,
and the small cut exists for 16px and nothing else. The `img` carries an empty
`alt` because the `h1` beside it already says the name, and a screen reader
reading it twice is worse than not describing the picture at all. Its `src` is
built from `import.meta.env.BASE_URL`, which is the manifest's trap one file over:
`/icon.svg` would draw in dev and 404 under the Pages subpath, and Vite does not
rewrite a path assembled inside a component. `icon.test.ts` pins that too. No
`border-radius` in `.logo`: the SVG already rounds itself at 22.7% of its width
and a second radius flattens the corners into something that is not the icon.

**The PNGs are committed, so an SVG can outrun them.** Editing one and pushing
puts a new favicon beside old PNGs of it on the same page. The script records
both SVGs' hashes in `scripts/icon.sha256` and `icon.test.ts` fails when either
file has moved on since, which is the reminder to run the script. Every guard
here was proved by breaking it rather than assumed: a recoloured speed line fails
the hash, an inset tile fails the hash and the full-bleed check together, and the
full SVG added back to the tab links fails the link check.

### Three things a playtest asked to be louder or clearer _(#60)_

- **The hint pulses harder.** A 2px outline breathing on and off was easy to miss
  on a board being scanned at speed, which is exactly the player it exists for -
  one who has already stalled. It is a 4px ring with a coloured halo, a wash
  inside the slot, and a **scale to 1.06 at the peak**. The scale is what makes it
  register out of the corner of an eye: a ring can be missed on a busy board, a
  square that jumps cannot. It is a transform, so nothing on the grid moves.
- **Dragging off the wood shows what is UNDER the card.** The pile still holds it
  - the play commits on the drop, not on the lift - so it was rendering a second
  copy of the card already following the finger. `TableauView` takes `dragging`
  and, for the wood only, drops the top of the run. It is the wood only because it
  is the one pile that shows a run of face-up cards, so there is something behind
  to look at; the others would reveal a card nobody has turned over yet.
- **Sitting out is a drawn door, not 🚪.** The emoji is a CLOSED door and every
  platform draws it differently; this one is always the same shape - black on
  white, panel swung toward the viewer. The near edge of the panel is taller than
  the hinged edge, and that alone is what makes it read as open.

The head reads `Dayvigo 0 pts to 75` - one space throughout, no separators. It
went via a doubled gap after the name, written with non-breaking spaces because
HTML collapses a run of plain ones to a single; that read as an extra space and
came back out. The word on the splash is **DASH!**, the name of the pile; the
round-end sheet says "dashed", which is the verb for having emptied it.

**The washroom sign is a solid plate in the GENDER's colour** (`--sign-boy`
`#0f6ad4`, `--sign-girl` `#e0489b`) with the figure knocked out in white. It used
to take the suit colour, which said nothing the big number was not already saying
far more loudly, so the one glyph whose job is "boy or girl" - exactly what
`canBuildOnPost` turns on - was answering it in silhouette alone at about 15px.

Two versions were tried and put back, and both are worth knowing about before
trying them again. **Outlining the plate in the suit and colouring the figure
instead** carries both facts, but at card size the outline is a hairline and the
figure a few pixels of colour, so each half did less than the one solid block
does. And the first colours (`#0a84ff` / `#ff2d8f`) read as neon beside the suits;
these are a stop back from that and still carry a white figure at 15px.

The badge emblem went from `.24` to `.30` of the card - it is how a player finds
their own cards in the middle, and it was the smallest thing on the face.

`select.field` carries `padding-right: 26px`. A browser draws a select's chevron
at the inside edge of the padding box, so the same 14px on both sides put it
almost on the border.

### A flick died on the squares it flew over _(#65)_

Reported from a table: a flick from the bottom corner fails when the bottom row
is full of cards this one cannot follow, even though the intended target - the
top-left square - is empty and legal.

It was not the aiming. `aimedAt` only ever sees LEGAL squares, so the full ones
were never candidates and none of its four rules were involved. The gesture died
one step earlier, in the pointerup handler: an explicit square under the finger
won **unconditionally**, and taking it threw the whole throw away. A flick is
short and fast, so the finger leaves the glass barely past where it started -
over the player's own end of the board. If the square there was occupied by a
card this one could not follow, that square was read as the player's choice, the
play was refused, and the card came back for no reason anybody could see.

The rule is now: **a square under the finger wins only if the card can go there.**
A deliberate drop is untouched - with no throw there is nothing to fall back to,
so it still goes to the square it was placed on and is still refused there. Only a
THROWN card whose square cannot take it re-reads the aim.

The decision moved out of the hook into `dropSpace`, which is pure and takes the
legal spaces already measured, so the whole thing is testable without a DOM. The
hook stays what it was - a gesture reader that knows no rules - and passes the
throw along on the square so the half that does know can reconsider.

**Verified in a browser, not only in tests**, because the bug lived in the wiring
between the two. Against the emulator with every square but the top-left rigged to
refuse the card in hand, a flick released over a full bottom-row square lands on
the top-left; with the old line restored it does not arrive at all. That harness
is the one in "Driving the real app", plus one thing worth knowing: **the client
OWNS its hand.** It keeps a local copy and only persists it, so writing
`round/tableaus/$uid` from outside changes nothing on screen. Rig the BOARD around
the card the client is actually holding instead. `round/spaces` is also absent for
a normal round - `startRound` writes it only for an orderly board - so rigging has
to create those nodes and take the size from `spaceCount`.

### Framer-motion arrives with the board, not with the app _(#64)_

43 kB gzip of a 199 kB first load was animation code, downloaded before the join
screen could paint. It now comes down with the board or the scorepad, and a first
load is **140 kB gzip instead of 199**. It buys one moment: somebody opening an
invite link on a phone with a cold cache gets to the join screen sooner, and the
library arrives while they are typing a name. A returning player is cached either
way, and a cold reload straight into a running round is marginally worse, because
the board needs the chunk at once and it is now a second request.

**The boundary is inside `RoomScreen`, around `GameRoute`, and that placement is
the whole trick.** An invite link mounts `RoomScreen` immediately, so splitting at
the route above it in `App.tsx` would have deferred the library exactly until the
moment it was needed and bought nothing on the one path this exists for. `Join`
and `Lobby` reach framer-motion through nothing, which is what makes the split
real: verified by walking the import graph, not by assuming.

`MotionConfig` had to leave `App.tsx` with it - importing the config IS importing
the library - so `MotionShell` renders it inside each lazy branch instead. There
are two, and they are the only two things that animate: the board and the
scorepad. **Anything new that animates must sit inside a branch that has a shell**,
or it silently gets framer's defaults and ignores the reduced-motion preference.

**Two traps, both of which made the split LOOK like it had worked.**

- **A named manual chunk is not a lazy chunk.** Giving framer-motion its own
  `advancedChunks` group produced a tidy `motion-*.js` file that the entry chunk
  still statically imported and `index.html` still preloaded. The library has to
  be EXCLUDED from the vendor group instead, with nothing of its own, so the
  bundler places it where it is actually used.
- **framer-motion is three packages.** `motion-dom` and `motion-utils` are
  siblings in `node_modules` and carry most of the weight, so excluding only
  `framer-motion/` left about 100 kB of it in the eager chunk. The vendor test
  excludes all three.

Neither is visible from the source, and the tests cannot see either: they are
facts about the build output. **Check them the way they were found** - build, then
read what `index.html` preloads and what the entry chunk statically imports. A
browser run confirmed the rest end to end: the home screen and the lobby fetch no
board chunk at all, starting a game fetches `GameRoute` and `MotionShell` on
demand, the board renders, and the console stays clean.

### A room can be deleted, and a device tidies up after itself _(#67)_

Nothing could remove a room. There was no `.write` on `rooms/$code` at all, so
every room ever created rested in the database for good: a finished eight-player
game is about 27.8 kB, and the free tier holds roughly 38,000 of them before
storage binds - the download quota binds long before that, so this was never
urgent, but there was no sweep of any kind.

`rooms/$code` now carries one grant, and it admits **nothing but a delete**. The
condition requires `!newData.exists()`, which is false for any write that leaves a
value behind, so it cannot be used to reach a child - and that matters more than
it sounds, because a `.write` on the room node would otherwise cascade to every
node under it and hand a stranger the whole room. `rooms.emu.test.ts` has a canary
on exactly that, and it is written against paths this player is refused TODAY, so
it would go red the moment the clause was loosened. `meta` is deliberately not
among those paths: it carries its own open `.write` and leans on its validates, so
it would pass either way and prove nothing.

The creator may clear their own room at any time; anyone may once it is a day old,
the same `ROOM_TTL_MS` a join already refuses on. `createRoom` remembers the code
in `bz.ownRooms`, and the home screen sweeps the expired ones on the way past,
best effort. **The sweep only ever asks about rooms past that day**, never about
the creator's fresh ones, so a room somebody is still playing in is never touched
however it was created.

One deliberate clock exception: the remembered `at` is this device's clock, while
the rule compares the server's `createdAt`. That is allowed here, unlike anywhere
else in this file, because it gates nothing a player sees - a fast clock asks
early and is refused, a slow one asks late, and an expired room is deletable by
anybody, so the next device past collects it.

**Also from the audit, in the same pass:** a web app manifest, so add-to-home
gives a named standalone app rather than a nameless shortcut - every path inside
it is relative, which is what makes it work under the Pages subpath and at the
root alike, and `manifest.test.ts` pins that. And the fireworks comment that
claimed every spark animates on transform and opacity alone was simply wrong: the
twinkle runs `filter: brightness`. The claim is corrected in both places it was
made rather than the code changed, because the twinkle cannot move to opacity
without fighting the flight's own fade on that property.

### The pile going back under is a move you can see _(#66)_

The turn that takes the pile over puts every card already face up back beneath the
draw pile. That is a real move and it was invisible: the flipped pile simply held
different cards a frame later. It now takes 180ms - the outline of the pile it was
travels up onto the draw slot and fades into it.

**The gather sits INSIDE the deal, not in front of it** _(2026-09-10)_. It used to
collect first and then deal all three. What a hand of real cards does, and what the
table asked for, is: the draw pile deals out the one or two it has LEFT, those are
gathered up onto it, and the rest of the turn is dealt off them to complete the
three. `dealTimeline` in `TableauView` is that clock and the only place the
arithmetic lives - per-card delays, when the gather runs, and how long the whole
move is.

**The trigger comes from the store, and it has to.** `TableauView` cannot work out
that a turn-over happened from what it is given, and the obvious signal is wrong:
the face-down count does not reliably change across one. A five-card pile reads
TWO face down on both sides of its turn-over, which is exactly the pile the table
was playing when this was built - the first attempt watched that count, and the
animation never fired once. Reordering is not a giveaway either, because a card
sunk out of the pile looks identical from outside. `flip` is the one place that
knows for certain, so it stamps `woodTurnover` (`woodCollectedAt` until the
half-speed deal gave it a card count to carry), and the board plays the move once
per new value. It is a nonce for an animation, never persisted, never read
back, and `store.test.ts` pins that an ordinary turn does not stamp it.

Two details worth keeping:

- **The geometry lives in one place.** The travelling outline is rendered INSIDE
  the flipped pile's own `PileStack`, so `--pile-step` is in scope, and the
  distance is written in the terms the layout already uses: its own height, plus
  the three steps of peek the stack reserves, plus the column gap. That 4px gap is
  now shared between `.wood-col` and the keyframe, so the two move together.
- **The durations are defined once**, as `COLLECT_MS`, `FLIP_MS` and
  `DEAL_STEP_MS` in `TableauView`, handed to the stylesheet as custom properties.
  The timer that ends the move and the animation itself cannot drift apart,
  because both add up from the same numbers through `dealTimeline`.
- **How many cards were dealt before the gather comes from the store too**, as
  `WoodTurnover.dealtBefore` beside the nonce, and it has to: after the turn those
  cards are simply the front of a reordered pile and nothing tells them from the
  gathered ones. One object rather than two fields, so a board cannot pair this
  turn's nonce with the last turn's count and deal the wrong cards either side.
- **The `collecting` class now lasts the whole move**, not just the gather. It
  carries every card's delay, so clearing it after `COLLECT_MS` re-timed the cards
  still waiting behind the gather and pulled them forward by its length: the deal
  never actually waited for the gather except for its first card. That was a real
  bug and it is pinned now (`woodTimeline.test.ts`).

Reduced motion switches both halves off, with the phone guard the whole file
requires, and `motionOverride.test.ts` covers the new keyframe alongside the rest.

### A wood turn brings three, across the turn-over _(#63)_

Reported from a table: at the end of the pile the game counted out a short group
of one or two, and the next tap started again from the top. It did exactly that,
and the short group was the smaller half of the problem.

`flipWood` capped at the end and then restarted at `min(step, len)`, which left
the pile permanently in phase with itself. A ten-card pile went 3, 6, 9, 10, and
then 3 again for ever: **four of its ten cards could be the top and the other six
never could**, however long anybody kept tapping.

**The turn now does what a hand of cards does.** When fewer than three are face
down, it turns the last one or two, puts every card that was ALREADY face up back
underneath them face down, and finishes the turn off the top of those. All three
cards of that turn end up on the flipped pile, which is the half a player can see:
a five-card pile turns `[1,2,3]`, then `[4,5,1]`, then `[2,3,4]`.

**In the array that is a rotation**, and that is the whole implementation:
`[...wood.slice(woodIndex), ...wood.slice(0, woodIndex)]` with the index landing
back on the step. The cards still face down keep their order at the front, the
older ones follow them round, and `woodIndex` goes on meaning "how many are face
up", so the pile stays a prefix and everything that reads it - `reconcileTableau`,
the peek, the counts, the deal animation - keeps working untouched.

Two things fall out of the reorder and both are easy to get wrong:

- **A turn that wraps must persist the whole hand, not the index.** `flip` writes
  `persistWoodIndex` alone on an ordinary turn, which is the cheap write it was
  built for, but after a rotation the index describes different cards and a reload
  would come back holding the wrong three. Once per lap rather than once per tap.
  The bot's flip has the same branch, and `store.test.ts` pins both.
- **`woodCycleTops` cannot stop on a repeated index any more.** The index returns
  to three every lap with different cards under it, and the array can take two
  laps to come back to where it started while the CARDS have already come round
  once. It stops on a repeated top card instead, which is the thing being asked
  about.

**The consequence is much larger than the short deal**, and it is the reason this
was worth doing rather than tidying. When the pile length shares no factor with
three the cycle now reaches EVERY card, where it used to reach a fixed handful.
A round deals 27 wood cards, which is a multiple of three and so still reaches
only nine of them - but the pile stops being a multiple of three the moment one
card is played out of it, and from then on the whole pile is live.

Being stuck therefore becomes rare, which is correct rather than convenient:
`isStuck` asks `hasReachableMove`, which walks the actual cycle, so it followed
the rule change on its own with nothing to update. Two things around it did need
saying, and are said where they live:

- `sinkWoodTop` matters less than it did, and only on a pile that is a multiple
  of three. On any other length the cycle already reaches everything, so there is
  nothing to rescue. It is still the only thing that moves the phase on a pile
  that cannot move it by turning, which is the shape a round starts in.
- **`isStuck`'s `ceil(wood.length / step)` bar is no longer a full cycle** - ten
  cards take ten turns to come round now, not four - and does not need to be.
  `hasReachableMove` decides the question exactly; the counter only stops a player
  being labelled the instant they run dry.

The UI needed nothing, which is the point of doing it as a rotation. `canRecycle`
is `faceDown === 0`, still reached exactly when a turn lands on the last card, and
`dealt` is still the face-up prefix capped at three. What has gone is the short
deal, and the tap after it that dealt nothing at all.

**Verified in the app, twice, because the first version was right and still looked
wrong.** It carried the count across the turn-over correctly - every turn dealt
three - but only the one or two cards from AFTER the wrap stayed face up, so the
pile still looked like it had dealt one, and it was read as the same bug a second
time. Driven against the emulator on a rigged five-card pile, the turns now show
`[1,2,3]`, `[4,5,1]`, `[2,3,4]`, `[5,1,2]`, `[3,4,5]` - three every time - and the
reordered pile survives a reload, which is what proves the write.

### A way out of being stuck, and a countdown between rounds _(#61, #62)_

**`sinkWoodTop` sends the face-up wood card to the very bottom of the pile**, and
the index steps back with it so the next turn deals on from what was underneath.
That is not `rotateWood`, which is the table-wide standstill rotation and moves
the pile's BOTTOM card while resetting everybody's index at once.

Why it works at all is the arithmetic in `woodCycleTops`: nine cards at three a
turn reach 3, 6 and 9 and **nothing else, ever**. Sink one and the pile is the
same length with the index one step off, so the laps stop landing on the same
cards - the reachable set in that example goes from three of nine to six. Pinned
in `wood.test.ts` with the worked numbers.

- **It is a deliberate action.** It costs a card out of the running order, and the
  player should be the one spending it. `sinkWood` is gated on actually being
  stuck, so it cannot be used to reshuffle a pile that merely has nothing good in
  it this second.
- **One sink is often not enough, and a player who is still stuck stays stuck.**
  Changed 2026-09-10. `sinkWood` used to reset `flips` to 0 on the way out, on the
  reasoning that the pile had changed and the turns that proved it dead no longer
  described it. The effect was that the way out un-declared the player on the
  spot, whatever the new hand actually held: the note vanished, the button with
  it, and to send a second card down they had to turn the whole pile over again to
  re-prove a thing that had not changed. `flips` counts turns since PROGRESS, and
  sinking a card is not progress - it is the admission that there is none - so it
  is left alone now. Nothing is lost by keeping it: `isStuck` asks
  `hasReachableMove` FIRST and that is recomputed on the NEW pile, so a sink that
  frees them still clears the claim, and a high `flips` can only bring a
  declaration forward, never invent one. `sinkWoodTop` keeps the pile's length, so
  the threshold it is measured against does not move either.
  The visible consequence is that `stuckAt` never changes across a sink, so the
  three-second offer clock below never restarts and the button is simply still
  there. **Each sink steps `woodIndex` back by one**, so consecutive sinks walk
  back through the cards already turned over until the index reaches 0, at which
  point there is no face-up card to send anywhere and the pile has to be turned
  again. That is the mechanic, not a limit that was added.
- **The offer waits three seconds** (`STUCK_OFFER_MS`). A button appearing with
  the bad news reads as the game telling you what to do; three seconds later it
  reads as an offer, and it leaves room for somebody else's play to free you
  without either happening. It holds the `stuckAt` it is offering FOR - the same
  epoch trick the hint uses - so being freed and stuck again withdraws it without
  the effect clearing anything, and without the synchronous setState the linter
  rightly objects to.
- **The message says both halves**: "No moves left - Send top wood card to
  bottom". It is the only thing on screen explaining either what has happened or
  what pressing it does.
- **It lives in the tableau, not under the grid.** The wood column is two cards
  tall and the posts are one, so the row already carries an empty band above them
  - and that is a foot away from the pile the message is about, where the drop
  zone's caption row was not. The note is absolutely positioned, so it still costs
  no layout, and it is inset from whichever end the wood is on because that is the
  one column the band does not span (`wood-left` / `wood-right` on the zone).
- **It is positioned against `.tableau-row`, NOT `.tableau-zone`, and that
  distinction is the whole of a bug it was reported for.** The zone is as wide as
  the screen and centres the piles inside it; the row shrink-wraps the piles, so
  the row's edges ARE the outer piles' edges. Positioned against the zone,
  `right: calc(--hand-card + --tgap)` only lines up when the piles happen to fill
  the width, which they do on a phone and do NOT on any wider window. On a 1280px
  desktop the band ran 60px past the wood column and sat straight over it:

  - the note **collided with the wood pile**, reported as exactly that; and
  - worse, with nothing to say the band is an INVISIBLE drop target at `z-index:
    2`, so it covered the face-down wood card and ate the click. Reported as
    "cannot click the wood pile to flip on Brave" - nothing to do with Brave. It
    was every window wider than the pile row, and it made the game unplayable on
    a desktop while looking perfect on every phone it was tested on.

  `.tableau-row` exists solely to be the thing this is measured against.
- **`tableauLayout.test.ts` is the only test in the repo that measures anything**,
  and it exists because of the two reports above. Everything else here renders to
  a STRING, and a string has no geometry: `render.test.ts` proved the note was in
  the markup and in the right order the entire time the note was sitting on top of
  the wood pile. This one renders the real component with the real stylesheets into
  a real Chromium and asks two questions at 360, 393, 1280 and 1600, both thumbs:
  does the band overlap any card, and does `elementFromPoint` on the middle of the
  face-down wood return the card or the band. Reinstating the old CSS fails 12 of
  its 18 - and passes at 393, which is exactly why the bug shipped.

  It is gated on `LAYOUT=1` like the emulator suites, so `npm test` stays under
  three seconds and needs no browser binary. CI runs `npm run test:layout` after
  installing Chromium, and `tableauLayoutCoverage.test.ts` fails if that step ever
  leaves the workflow - the same guard, and the same reasoning, as
  `emulatorCoverage.test.ts`.
- **It sizes off the card, not off a number.** `font-size` and padding are
  `clamp()`s of `--hand-card`, because the band is one card tall and a few cards
  wide, so a card is the only thing on screen that knows how much room there is. A
  fixed 14px wrapped to two lines on a 360px phone and looked lost on a desktop.
  Probed at 360, 393 and 1280 with the real string: no spill, no card overlapped.
- The drop zone's caption row now only ever says "drop anywhere here", which is
  what it was for.
- **With nothing to say, that band becomes a drop target** (`data-drop="nearest"`,
  same geometry, invisible). It is the nearest empty space to a thumb coming off
  the wood or the Dash pile, so a throw that barely leaves the hand lands in it
  instead of nowhere. `parseDrop` walks up from whatever is under the finger, so
  the attribute is all it takes.

**The countdown now runs between rounds too.** `nextRound` is `startRound`, so the
tick needed no branch at zero - only the two guards that pinned it to the lobby.
Ready up on the score sheet and the table counts 3-2-1 over the scores, with the
host's cancel. Pinned both ways: it counts in `lobby` and `roundEnd`, and in no
other phase.

**Neither is verifiable by rigging.** A stuck flag written straight into the
database is cleared again by `syncStuck` on the next snapshot - correctly, because
the hand is not actually stuck - so the three-second offer has only been proved by
a render test and the arithmetic underneath it. The countdown WAS driven for real:
sheet up, ready pressed, 3 on screen with a cancel, next round dealt.

### The splash says what the round DID to you _(#57)_

`splashVariant` returns `{ base, trophy }` now, and the losing faces are tested
in this order:

| | when |
|---|---|
| 🚽 | they have just **dropped into** last place |
| 🥹 | they were last and are **not any more** |
| 💩 | still holding the worst total, at 3+ players |
| 😢 | everybody else |
| 🏆 | falls **with** whichever of those, if they lead the table after this round |

**The standings are PROJECTED, and they have to be.** The splash fires the moment
dash is announced, before the host has committed anything, so `player.score` is
still last round's total - and "dropped into last" is a question about this round.
`scoreRound` is the same pure function the host is about to run on the same board,
so this is the host's arithmetic done early rather than a guess. It can differ
only where a play is still being reconciled.

"Last" is **strictly** last throughout: on a level table nobody has dropped
anywhere, and handing every tied player a toilet would be a lie about a change
that did not happen. Same reasoning as `basement` in the commentary.

### Fireworks are for winning; a dash rains _(#58)_

**Everybody gets the same weather now, and only the glyphs differ.** Asked for on
2026-09-09. The dasher used to get fifteen firework shells and a burst of emoji
radiating out of the middle while everybody else got falling emoji, which made a
round win look like the end of the game. A dash now rains 😎🥳 down the same
lanes a bad round rains 💩 down, and the fireworks belong to the sheet that says
who WON. `DashSplash` is one `Rain` with a name over it; `Fireworks` moved into
its own file on the way, because its one caller is no longer the splash. The
radiating burst went with the change: `.spark` and `spark-out` are deleted rather
than left for a caller that no longer exists.

**The fireworks go BEHIND the final score sheet, and "behind" needed a rule.**
`.fireworks` is positioned and carries a `z-index`; `.sheet` was not positioned at
all, so source order bought nothing and the sparks painted over the totals. The
sheet carries `position: relative; z-index: 1` for that. The layer under it
carries `pointer-events: none` for a different reason: it covers the whole
overlay, and a finished game whose Rematch button has been swallowed has no way
out at all. `overlayLayers.test.ts` measures the paint order and the tap in a real
browser, because neither is a question markup can answer - and it first proves the
layer actually reaches the sheet, so a green result cannot come from a layer that
was never in the way.

**Forty-five shells at forty-six sparks each**, about 2115 elements, over eight
seconds. Fifteen over four until 2026-09-09, thirty until 2026-09-10, each step
asked for by the table. `SHELL_GAP_MS` times the length of `SHELLS`, plus the
1500ms a spark takes to fly, IS the duration, so holding eight seconds while the
count goes up means the GAP comes down: 225ms at thirty, 148ms at forty-five.
The positions sit on a jittered 5 x 9 grid walked 19 cells at a time - coprime
with 45, so it visits every one while consecutive shells land rows and columns
apart, none closer than 37 units of the canvas's 100.

**Measured before it was allowed to grow**, which is what the note that used to
sit here asked for. Chromium at 393x851, frame intervals sampled over the burst
and again once it has finished:

| | during the burst | idle, afterwards |
|---|---|---|
| 15 shells, twinkle `infinite` (the first version) | 33ms | 17ms |
| 30 shells, twinkle `infinite` | 50ms | **33ms, for ever** |
| 30 shells, twinkle stopped with the flight | 33ms | 17ms |
| 45 shells, every spark twinkling | 67ms | 17ms |
| **45 shells, as it ships now** | **33ms** | 17ms |

The middle row is the one that mattered. **The twinkle was `infinite`**, so a
`filter: brightness` went on ticking on every spark for as long as the game-over
sheet was up - which is until somebody presses Rematch, and could be minutes. At
690 elements that was affordable and rude; at 1410 it halved the frame rate of a
screen that is doing nothing. It runs SIX iterations now, which covers the 1500ms
flight and stops. Under a 6x CPU throttle the same three rows idle at 83ms, 183ms
and 17ms, so the fix leaves the doubled version cheaper at rest than the half-size
one that shipped before it.

**Forty-five is where it started to cost, and the reason is concurrency rather
than count.** A spark flies for 1500ms, so the number in the air at once is the
flight over the gap: 6.7 shells at thirty, 10.1 at forty-five. Fifteen to thirty
was free because the gap grew with the count; thirty to forty-five was not,
because it did not. Frames during the burst went 33ms to 67ms unthrottled, and
150ms to 317ms under a 6x throttle.

**The twinkle was the whole of that cost, exactly as this file had said since the
first version, and it is now fixed.** Measured at 45 shells, unthrottled, during
the burst:

| | median | p95 |
|---|---|---|
| every spark twinkling | 67ms | 250ms |
| twinkle off entirely | 33ms | 50ms |
| **twinkle on the white sparks only (shipped 2026-09-10)** | **33ms** | **67ms** |

**The flicker runs on the white one-in-six only** - `.shell i.glint`, 360 sparks
of 2070 - and that bought back every frame: 45 shells now cost what 30 did, and
the p95 is better than 30 shells were with everything twinkling. Under a 6x
throttle the median came down from 317ms to 217ms in the same change.

Nothing was lost visually, because the white sparks are where the glitter reads
from in the first place: they are the small bright ones a coloured burst glints
with, and the coloured ones were flickering at a brightness nobody could pick out
of a burst anyway. **The class is set by the COMPONENT**, which is the one place
that decides which sparks are white, rather than by an `:nth-child` count in CSS
that would silently pick the wrong sparks the moment the ignition bloom moved.

The burst used to cost what it always did: 33ms frames unthrottled at fifteen and
at thirty, and at 6x throttle the median went 183ms to 233ms for twice the
shells.
**A 6x CPU throttle in headless Chromium is not a low-end phone**, and nothing
here has been on one. That is still the measurement worth having.

A spark's FLIGHT is transform and opacity, so it composites and nothing reflows.
The twinkle is `filter: brightness`, which is paint - the one property here that
is not free, and it stays because it cannot move to opacity without fighting the
flight's own fade on that property. This paragraph claimed transform and opacity
alone until 2026-09-05; the audit caught it. Each shell also fires a one-element
ignition bloom, which is most of why it reads as going OFF rather than as dots
appearing, and every sixth spark is small and white against the coloured ones -
which is what turns a burst into a glittery one. Each shell is a point; its sparks
are children that know only a bearing, fly out along it and take a little gravity
at the end, which is the whole difference between a firework and a starburst.

**Five roman candles fire up the same sky**, added 2026-09-09. They are a
different instrument on purpose: a shell is one burst filling its patch of sky at
once, and a candle is a slow file of single stars leaving one spot, which gives
the display a pulse between bursts rather than thirty of the same event. Ten
stars a tube, 360ms apart, out at the edges because the sheet is in the middle
and a tube at 31% spends its whole climb behind the scores. The one at 50% is
deliberate, and passing behind the sheet is what it is for.

**The first cut of them read as more confetti**, which is the thing worth
remembering if they are ever touched. They were the same size and lightness as a
shell spark, one every 520ms, and the eye cannot pick eight of those out of a sky
holding a couple of hundred. What fixed it: 11 to 13px against a spark's 4 to 11,
a near-white core inside a coloured glow, a gradient TAIL on a `::before` so it
costs no element and no `filter`, and a faster cadence so a tube reads as a
stream. A star fades at the top of its climb rather than arcing back down, which
is one element instead of two and is what a candle looks like from far enough
away to be watching it.

**They cost nothing measurable**, on the same rig as the table above: 50 elements
against 1410, frame medians identical at 33ms unthrottled and 133ms under a 6x
throttle, and idle untouched.

**They run ONCE.** The overlay stays up until somebody leaves or rematches, and a
loop would still be going off behind the numbers ten minutes later. The shells
are staggered across eight seconds, which outlasts reading the sheet without
outlasting the sitting there afterwards.

**Two glyphs (😎🥳) rather than eight**, falling: a celebration reads as one
thing when the eye takes it in at once, and eight different faces read as a pile
of stickers. Under reduced motion on a phone the fallers park where they are and
the fireworks are dropped entirely - a still firework is a smear of dots, and the
sheet they go off behind already says who won.

🔥 was a third one until 2026-09-10, on every dash, which is what made it
wallpaper: it said "you dashed" beside two glyphs already saying that. It is kept
back for a run of two or more now - see "The fire is for a run" below.

### The wood flip stopped being watchable _(#59)_

The first cut cross-faded each card in as it turned, so three half-transparent
cards overlapped each other in a row. It was reported as hard to watch, and it
was. It is **fully opaque** now: hinged at the top edge (`transform-origin: 50%
0%`), `rotateX(90deg)` to `0` on an ease that front-loads the movement. A real
card does not fade.

**300ms a card and 200ms apart since 2026-09-10**, so the cards OVERLAP by 100ms
- the next starts a third of the way into the one before it. The numbers went
200/200 to 400/400 ("twice as long") to 300/250 to 300/200, all in one day, each
step watched before the next was asked for. An ordinary turn of three runs 700ms.

**The step is the knob that gets asked for**, not the flip: every request after
the first has been about how soon the NEXT card starts. Worth knowing which one
to reach for.

**Overlap is back on purpose, and this section is why that is not a regression.**
What failed the first time was the cross-fade: two HALF-TRANSPARENT cards on top
of each other. Fully opaque, a card that starts while the one before it is
finishing reads as a hand dealing rather than as a smear, which is what was asked
for in those words. If it is ever reported as hard to watch again, the thing to
reach for is the fade, not the timing - that is the variable that actually
changed between the two.

### Away outlived the tab that set it _(#52)_

Reported by a host whose phone had been in their pocket long enough for the host
watchdog to hand the room on. Coming back they had **no ready button** - just
"Away" - and tapping it turned the row into "Start anyway" beside "Away", which
was the only way to get a game going.

Every part of that follows from one stale flag. In a lobby `awayAt` is set when
the tab hides and cleared when it comes back, which depends on catching a single
`visibilitychange` at the right moment - and a tab that was frozen for a minute,
whose socket dropped and whose host was handed on while it slept, is exactly where
that goes wrong. With the flag stuck:

- the ready button reads `iAmAway ? 'Away' : …`, so it **hid the ready state**;
- `tableReady` requires `awayAt == null`, so the countdown could never start;
- readying anyway made `showOverride` true, which is the "Start anyway" that
  appeared - the override was the only door left.

Three changes, and the third is the one that matters:

1. The label says **"Away - tap when you are back"**, because it is a thing to do
   rather than a state to read.
2. Tapping the ready button **clears Away** as well. Tapping it is proof of
   presence - the same reasoning that made the round-end sheet's ready button call
   `noteActivity`.
3. **`onSnapshot` clears a stale lobby Away on every snapshot** where the tab is
   visible. A visible tab sitting in a lobby is not away whatever the flag says,
   and this is the only place that can know it on every snapshot rather than on
   one event. Costs a comparison in the steady state.

### The opponent strip only looked scrollable _(#53)_

`overflow-x: auto` was there and it scrolled perfectly with a mouse. Every touch
in that strip lands on a mini-card, and `.card` carries `touch-action: none` so
the tableau's drags work - which also tells the browser not to pan. Those cards
are display only and are never dragged, so `.opp-strip .card` hands panning back
with `touch-action: pan-x`. **Anything that puts a `.card` somewhere scrollable
has to do the same.**

### The celebration, and reading it _(#54, #55)_

Forty-four sparks over eight different glyphs rather than twenty-two of one -
a single repeated emoji reads as a pattern, a handful reads as a celebration -
each with its own size, delay and tumble, thrown out over two turns of the circle
so the arms interleave instead of arriving as one rank of spokes.

**"DASH!" and the name carry their own contrast.** They are read against whatever
the splash is raining past them, in either theme, so white on the page's accent
was hopeless: both now have a hard black outline, `-webkit-text-stroke` with
`paint-order: stroke fill` plus four offset shadows for anything that lacks it.
The name is roughly twice the size and no longer set at body weight under a 140px
word.

### A wood turn is a card turn _(#56)_

Each card arrives **edge-on** and rotates to face up over 200ms - `rotateY(-90deg)`
to `0`, with the face hidden until the halfway point, which is when a real card is
edge-on and neither side is visible. 200ms apart, so three of them run 600ms and
each is clear of the next. `perspective` lives on `.wood-deal`, not on the cards.

### The host can sit a round out _(#51)_

The countdown belongs to the players who are actually being dealt in, and the host
is not automatically one of them. `tableReady` already skipped players who were
sitting out, so a sitting-out host was already not waited on - what was missing
was everything around it.

- **`tableReady` now needs at least one HUMAN in play.** Bots are ready by
  definition, so a host sitting out of a room full of them left a table that was
  permanently "ready": it counted itself down and dealt a round the machines
  played to each other while the only person present watched. Two players, one of
  them a person, all of them ready.
- **The override follows the same rule**, and appears once the host has ANSWERED
  for themselves - ready, *or* sitting this one out. Gating it on "ready" alone
  strands a sitting-out host with a dead phone on the table, which is the exact
  thing the override exists for. It is also hidden when the deal would contain no
  humans, or the way past a dead phone becomes a way to start a game with nobody
  in it.
- **The round-end sheet's override needed the same gate**, and for a sharper
  reason: between rounds `ready` starts cleared, and `startRound` deals on it, so
  a host tapping "Next round anyway" before readying dealt a round to **nobody at
  all**. Recoverable - everyone has a seat and therefore the deal-me-in bar - but
  a sheet closing onto an empty board is not what anybody pressed the button for.

A bots-only lobby says so now rather than sitting there looking hung.

### Seats, hands, and the players a forced start deals around _(#50)_

**A SEAT and a HAND are different things now.** `startRound` reserves a seat for
everybody who is not sitting out and deals a hand only to those who are ready. On
the ordinary path they are the same people, because the countdown does not run
until everybody is ready. On a forced start they are not.

- `round.seats` is who had a seat; `round.tableaus` is who was dealt.
- **The board is sized on SEATS**, so somebody left behind already has their four
  spaces. `dealMeIn` writes them a hand mid-round and **the grid does not move a
  pixel** - measured, same top, same height, same slot count.
- A uid in `seats` with no hand can still join this round. A uid in neither walked
  in after the deal and waits for the next one, with the standby banner.

**A fresh deck is safe here and nowhere else.** `buildDeck` is per player and
every card carries its owner, so re-dealing somebody who has already played this
round mints duplicates of the cards they put in the middle - which is exactly why
sitting out KEEPS the hand. A player who was never dealt in has no cards anywhere,
so a fresh deal is clean. Do not generalise it.

`round.postCount` is pinned to the round for the same reason `spaceCount` is: it
was derived from the live player count, so somebody joining a **two**-player game
mid-round renormalised every hand from five posts to three and dropped cards off
the end of it.

**Start anyway counts down too**, and forcing it needed a flag: `forcedCountdown`
suppresses the `tableReady` check in the two places that would otherwise call the
countdown off. It is host-local, so if the host reloads inside those three seconds
the table goes back to its lobby - which is the right thing to happen to a start
nobody is around to finish.

> **The trap in there, twice.** Firebase raises the local snapshot for a write
> **synchronously from inside it**, and `syncCountdown` runs on that snapshot.
> `startAnyway` wrote the digit before assigning its timer, so the snapshot saw a
> forced countdown that was not running and wiped the digit. Fixed by assigning
> the timer first - and then the same shape appeared one level down, because
> `tickCountdown` nulls the timer on its first line and only reassigns it after
> writing the next digit. A timer test in `syncCountdown` is therefore null for
> every tick of a perfectly healthy countdown. It now guards on the FLAG alone.
> Both bugs looked identical from outside: an instant start wearing a one-second
> countdown.

**Between rounds, ready has to be set again.** `startRound` clears it, and it
deals on it, so the score sheet's ready gate is now load-bearing rather than
decorative. Four emulator fixtures had to start readying their players; a fixture
that skips it now deals nobody a hand.

### A scowl that outlived its round _(#49)_

Reported as **an angry face on an empty space, round 1, before anybody had played
a card**. Nothing was wrong with the race code that put it there; what was wrong
is that nothing ever took it away.

`lastRejected` has **no expiry** and `raceFlashes` renders it on every render. The
CSS animation ends at `opacity: 0` and no timer clears the element, which is fine
while the board stays mounted - but a new round mounts a new board, the span
mounts fresh, and the animation **replays** over a space nothing has ever been
played to. It leaked across rounds and, because `leave()` did not clear it either,
across games in the same tab.

`spaceTouched` leaked exactly the same way, and worse: a stale entry inside
`RACE_GRACE_MS` would have blamed the wrong player for a race in a different
round. Both are cleared when `meta.roundNumber` changes, and both in `leave()`.

**The thing to take from it:** anything keyed by a nonce so it can replay is
per-round state by construction, and per-round state needs somewhere that clears
it. There was no such place; there is now, at the top of `onSnapshot`.

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

That still holds for Easy, Medium and Hard. Genius stopped being handicapped at
all on 2026-09-10 and started cheating instead - see "The bots aim low, and Genius
cheats" above - but the thing this paragraph is protecting survived it: even the
cheats do not touch `rankMove`.

**The test count line and the header date.** The count above the first heading is
the only place in the repo that quotes one, and it moves with any change that adds
tests. It went 539 -> 709 over 2026-09-10, and the last stretch of that arrived as
a MERGE: the soundbites work and the wood-turn tuning were written against the same
base and landed on top of each other. Both sides had bumped `SMALL_CHANGES` from 58
to 59, which git merged silently because the two sides agreed on the value - it
took a hand count to notice the two changes had become one. Measure this line after
a merge rather than taking either side of it.

### A wood turn deals three cards _(#45)_

It used to be one card flipping (`flipKey` on the top card). A turn brings three
cards over, so it now looks like three: `dealt` is the last `WOOD_STEP` face-up
cards, stacked in one grid cell and animated in one after another. **Keyed by card**, so
only the ones that actually just arrived animate - under the host's single-card
rescue the cards already face up hold still and one card lands on them, and the
turn that takes the pile over replaces the face-up pile with its own three cards,
all of which are new, so all three deal in.

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
`refillPosts`**: when a post empties, the Dash top drops into it automatically, so
a card of any value can APPEAR on a post pile without anybody having built it
there. That is the rule, not a bug.

Terminology, since it has caused confusion: the **wood pile** is the face-down
draw pile turned over in threes, and the **post piles** are the three (or five, at
two players) build piles between Dash and wood. The code has always used those
two names.

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
height, in ink rather than furniture, with room on both sides. The **dash bolt**
sits right of the total in a column that is reserved whether or not it holds one,
so the totals stay in a line down the sheet instead of the dasher's row shunting
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
`RACE_GRACE_MS` is treated as the race it was - the scowl and the shake for the
slower player, and the race reported **once per client** (`reported`) so jabbing
at a space that has just filled does not report it repeatedly.

**The earn window is 2s**, doubled from 1s on 2026-09-10. It is the one number
that decides whether a refused play was a race or simply a wrong card, and it is
the table's to set: longer means more of the near misses read as the losses they
were, at the cost of calling the occasional genuinely late play a race.

**Every loser gets the scowl, and always did** - `lastRejected` is local state, set
on each losing client independently, so it lands even if the report never does.
What was missing was the other side of it.

**The winner gets a halo PER LOSER**, since 2026-09-10. `races/$space` now carries
`lost`, a map of loser uid to the millisecond they said so, and each loser adds
their own name to it.

- **The write had to become three leaves rather than one object.** Writing
  `races/$space` as an object REPLACES the node, so the second loser to report
  used to wipe the first, which is exactly why the winner only ever saw one halo.
  `by` and `at` are still written and still have to be: the rules demand that node
  have both children, and `lost` rides alongside them under a node with no
  validate of its own. **That is what let this ship with no rules change and no
  deploy**, and `rooms.emu.test.ts` proves it rather than assuming it - a validate
  that rejected the shape would have failed the whole multi-path write and taken
  the flash with it, silently, because `reportRace`'s rejection is swallowed so a
  decoration can never cost a play.
- **`lost` outlives the race it was written for**, because a space is contested
  more than once a round: a pile finishing on a 10 empties it and the fight starts
  again. So `raceFlashes` counts only entries within the grace window of the
  latest report. The window is passed in rather than imported, which keeps that
  file a pure function of its arguments.
- **The faces arrive one at a time, and they overlap on purpose.** Each is
  `HALO_STAGGER_MS` (100ms) behind the one before, so they read as several people
  rather than as one fanned object. **The first is always centred** and undelayed,
  which is what keeps a single halo looking exactly like a single halo always did;
  the rest alternate out to the left and the right around it. The base
  `.race-flash` is `opacity: 0`, so a face is invisible until its own delay is up
  without the animation needing a backwards fill.
- **They overlap because a face is about 62% of a slot wide**, so laying several
  out without touching needs a step that big - and at 58% three haloes on one slot
  reached across two others, which is what the first cut did. The OUTERMOST is
  capped at 60% instead, so seven losers at an eight-player table stay in the room
  five take.
- **`HALO_CYCLE_MS` restarts the fan from the middle after a second.** Ten faces
  at the stagger, which is more than one race can produce, so what it really
  governs is a LATER race on the same space opening centred rather than carrying
  on from wherever the last one had got to.
- `faceOffset` and `faceDelay` are arithmetic, so they are tested - and they live
  in `raceFlash.ts` rather than in `CenterGrid.tsx`, because a second
  non-component export from a component file is a new lint warning and this repo's
  clean state is seven.

The angry face already shook side to side and still does. The angel holds at rest
until nearly half way through and drifts up over the rest of 1.5s: half as long
again on screen, with the extra going into being readable rather than a longer
glide. Both take their `--off` inside every keyframe rather than as a base
transform, because a keyframe replaces the whole transform property and would
drop it.

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

### Hints and openings - one switch over two nudges _(#6, #9)_

`meta.hintsOn` is a **host-controlled room option**, not a device preference, and
it covers *both* nudges. Hints are an advantage and bot difficulty was tuned
against a human without them, so everyone plays the same game - and two switches
for "help me a bit" is one more than a lobby full of people wants to argue about.

**The stalled-player hint flashes the destination, not the card.** That is the
opposite of the original request and is the product owner's call: it marks the
space on the grid where *something* of yours could go, and the player still has to
work out which card, find it and drag it there. A nudge towards the board rather
than the move played for them.

- `src/game/hint.ts` reuses the bot's own `botMoves` / `rankMove`, so "best" means
  the same thing to the hint as to a Hard bot - one definition, not two that
  drift. Ties settle on the first space generated, deliberately: an Ace fits every
  empty space at the same rank and the hint must not wander between renders.
- **After `HINT_DELAY_MS` (5s) of no input**, so it never fires under somebody
  playing at speed. The idle counter watches *your* input only, not board changes -
  a fast table would otherwise keep resetting the clock of the one player who has
  actually stalled.
- **Two pulses over `HINT_SHOW_MS` (1s), then gone**, rather than breathing on the
  board until it becomes furniture. The *element* is removed on the timer rather
  than the animation being left to end itself, which is what makes reduced motion
  behave identically - same one-second mark, held steady instead of pulsed.
- **And again every `HINT_REPEAT_MS` (10s)** for as long as the player goes on not
  playing. The repeat is keyed on the player not acting, **never on `stuckAt`** - a
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
speaks instead - but the moment somebody else's card opens a move up, the next tick
says so, because the hint is recomputed at render rather than stored.

**The openings glow** (`openings.ts`) rings a space **somebody else just played
to** that this player can use, in the colour of the card now sitting on it. It is
about the CHANGE, not about the board: three things must be true - the top card
actually changed, somebody else put it there, and I hold a visible card that fits.
A standing highlight of every playable space would be the game played for you;
this is "that moved, and it is for you" on a board of up to 32 slots.

The colour is the space's new top card, so it needs no third visual language - not
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
was above the old 24-space cap at 7-8 players, and that was fixed by removing the
cap rather than by softening the rule. `rules.test.ts` pins the property, not the
reasoning.

What actually constrained the design was the column count: `gridColumns` is
`max(4, ceil(count/4))`, so a 20-space board is **5 columns**, which cannot be one
colour per column with four suits. Hence **four columns up to 16 spaces, eight
above** (`orderlyColumns`), with adjacent columns paired per suit so eight columns
read as four wide bands rather than a stripe pattern; 2-4 players get exactly the
layout they get anyway. **An orderly board rounds up to a whole number of rows**
(20 → 24, 28 → 32), both of which would otherwise leave holes in the bottom row;
the rounding is stable under its own output so nothing downstream can disagree
about the size.

**The suit lives on the space rather than being derived from its index** because
`centerPlayTxn` is a transaction against `round/spaces/$i` and sees only that one
node - it never learns which index it is. So the constraint has to be *in* the
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
every client races its own clock to** - 3, 2, 1, then 0 which reads "GO!", then
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

**The wood/Dash side can be pre-set in the lobby.** `useWoodSide` is device-local
`localStorage`, so the lobby reads it as easily as the game does. Deliberately not
disabled for non-hosts and not a room option: it is about the phone in your hand.

### Which side wood and Dash sit on _(#2)_

`src/ui/prefs.ts` holds it, local to the device and not to the room, because two
players at one table can want opposite answers. The `⇄` in the game head flips it
**mid-game on purpose** - a player who was auto-rejoined never sees a form again,
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
an attribute rule - neither state can be expressed by the other alone. `system`
writes no attribute at all rather than `data-theme="system"`, so the media query
keeps working while the app is open. The `theme-color` metas are rewritten in JS
because a media query cannot see an override, and left alone Safari paints its
bars for the device's theme while the page paints the player's.

**Where the toggle renders is decided in `App.tsx`, and it must be one place or
the other.** On the board it sits in the head's pill beside the wood swap and the
sit-out button - three controls, one island - and everywhere else it is the only
control on screen, so it gets an identical pill fixed to the corner. `boardUp`
picks between them off `joinPhase` and `meta.phase`; render both and the player
gets two toggles. `.head-btns`, `.corner-btns` and `.side-swap` are defined in
**ui.css, not game.css**, precisely because the corner pill appears on the home
page, the join form, the lobby and the scorepad - none of which import the board's
stylesheet.

**Anything read against the ready button is theme-fixed.** "Start anyway" is a
fixed dark slab with pale text (`.start-anyway`), not `.btn-primary` whose
`--accent` flips near-white in dark and sat under the white ready button as a
second pale slab with nothing to tell them apart - and it is an escape hatch,
which should not out-shout the thing you are meant to press.

**White cards in dark mode** is `meta.paleCards`, a host option applied as a
`.pale-cards` class on the board. Written as the LIGHT values rather than as
literals so the two cannot drift, and applied unconditionally - in a light theme
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
  `centerCount`/`dashLeft`, so it cannot disagree with the total beside it.
  `render.test.ts` feeds a contradicting fixture to pin exactly that.
- **Zero is unsigned and muted** - a dasher reads `0 +9 = +9`, not `-0`, and the
  danger red is reserved for a real penalty.
- The row lives in `ScoreRow`, shared by both overlays, and takes `score` as
  optional: game over can render from a snapshot with no `round/scores`.
- **Every row is its own grid**, because the row is the card carrying the
  background and border. `auto` columns therefore size to each row's own digits
  and the `=` signs stagger down the sheet, so the value columns are floored at
  `3ch` - exactly three tabular digits, which is every value the game can produce -
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
`Object.keys` order - the order players joined in - and reported "dropped 2 places"
after round one. Being level with somebody and then beating them is not a place
gained, and `previous` breaks its ties by the current order so nothing slides
across the sheet either. See `scoreRanks.ts`.

### Home page and the scorepad _(#14, #15)_

The room-code field was `input.field`'s `width: 100%` inside a wrapping `.row`,
which put Join on a line of its own; `.join-row` stops the wrap and lets the field
take what is left after the button - the code is six characters and never needed
the whole row. The scorepad entry sits below the code field and Join, spaced by
`calc(48px - var(--stack-gap))` so the visible gap is exactly one field height.

In the keeper, "In the middle" is "Dutch piles count" (their actual name) and the
Dash stepper has a coarse `±3` pair outside the fine one - value in the middle,
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

Also retired: the Dash count that appeared twice per opponent, beside the name
and again in the bubble on the pile. The bubble stays - it is attached to the pile
it counts.

---

## Still open

### Next up, from the audit _(2026-09-03, `docs/audit-2026-09-03.md`)_

What the audit left, after the 2026-09-04 and 2026-09-05 passes closed the rest.
Ordered by what is worth doing, with the thing that BLOCKS each one named,
because every one of the first three is blocked on something other than effort.

1. **Stop writing `owner` on a stored card.** Release two of a two-release change;
   release one is live and the rules already permit it. Halves a 21.7 kB
   eight-player deal. **Blocked on every device having reloaded**, not on code: a
   phone holding a cached older bundle renders every dealt hand EMPTY, and
   `startRound` writes every player's tableau, so one host on a new bundle empties
   the hands of a whole table still on an old one. Ask, wait, then ship. The full
   note is in "Known gaps" below.
2. **The structural tier of validation** (`docs/database.rules.proposed.json`,
   written and passing on the emulator, never shipped). What is live bounds every
   leaf's type and range; this bounds the SIZE of a write and binds a new player
   record to the `playerCount` bump. Without it a 16 MB write is legal - 64 of
   them fill the free tier - and a stranger can push `playerCount` to 8 in one
   write and close a room, whose newcomers are then told they lost a race.
   **Blocked on two probes against a throwaway project**: whether an ancestor's
   `.validate` refuses a targeted delete of a child, and whether `newData.parent()`
   sees the other paths of the same multi-path write. Both were confirmed on the
   emulator only and are not documented for production. If the second behaves
   differently there, the file refuses EVERY legitimate join. Probe, then the
   file, its tests and a deploy - and note `joinRoom` should learn to tell a
   counter rejection from a badge one and say "full" rather than "race".
3. **A Content-Security-Policy** (`index.html`, as a meta tag). No injection sink
   today, so this is depth rather than a hole. **Blocked on a manual check with
   `forceLongPolling()`**: the database's long-poll fallback is JSONP, so
   `script-src` and `frame-src` have to allow `https://*.firebaseio.com` or the
   game silently dies on networks that block WebSockets - and a meta policy has no
   report-only mode to find that out safely. The policy itself is drafted in the
   audit's working notes.

Three more the audit recorded that are not code changes, and are open because
nobody has decided about them rather than because they are hard:

- **One uid, two tabs.** Auth persistence is shared across same-origin tabs, so a
  host who opens the invite link in a second tab is one uid in two clients.
  Closing either writes `connected: false` for a player who is still there and the
  survivor never re-asserts, because it only writes on a connection transition.
  From then on the countdown will not run for them and the stuck check skips them,
  and if they are the creator the stand-in watchdog and the creator reclaim take
  turns every thirty seconds. Self-inflicted, and the manual test plan is a
  multi-tab playtest, so it WILL be met. The fix is a per-tab presence child or a
  leader election over `BroadcastChannel`.
- **Long-session memory was never measured.** The maps in the store are bounded
  and cleared per round, but nothing has a number for the heap after ten rounds of
  remounting 75 cards, plus the 2165 firework elements the final sheet brings once
  at the end. The layout suite already has the browser wiring a heap reading
  needs.
- **The board is pointer-only.** No keyboard route, no focusable pile, no
  announcement when the board changes, while the chrome around it is labelled
  throughout. It stands out beside the care taken over reduced motion. The cheap
  first step is a button role and Enter or Space on the tap path that already
  exists.

**Deliberately declined, so nobody re-opens them:** the per-play `stuckRounds`
reset (40 bytes a play, and guarding it would end a stalled round a rotation
early), writing only the changed piles on a play (half the wood fix's saving for
much more code), pinning CI actions to SHAs without Dependabot (it would freeze
actions the workflow tracks by major on purpose), the eight dev-only advisories
through `firebase-tools` (none reachable from the bundle; re-check on each bump),
the two preconnect hints (priced against a European floor that turned out to be
domestic), and the listener's own initial download on entry (the SDK's sync point
for the live subscription, not a redundant read).

### Deferred: move a run of cards between post piles _(#4)_

Not being built for now. The spec stands if it comes back.

**It is a house rule, confirmed at the source.** The FAQ of the game this one
descends from says of the post piles: "You can move one card at a time - you
cannot shift entire piles." (https://dutchblitz.com/pages/policies-faq - the
link is the citation, and the only place that name still appears.) The design
spec's one-card-at-a-time wording is therefore correct as written, and shipping
this would need a lobby toggle rather than being a silent change to everyone's
game.

Today only the top card of a post pile can move (`placeOnPost`). The request:
tap-and-hold a pile, see its cards in a row, tap which to move, tap a destination.
Questions to settle **before any code**:

- **The wording says "wood piles" but the example describes post piles.** Here
  `wood` is a single face-down draw pile flipped three at a time, with only
  `wood[woodIndex-1]` playable - it cannot hold a run and there is only one of it.
  The descending alternating runs in the example (9,8 and 10,9,8,7,6,5) are post
  piles. **Confirm this reading before starting.**
- **Everyone or nobody.** It cannot be per-player - it's a shared rule.
- **What does "tap which cards to move" mean?** Taking the card at depth k plus
  everything above it (a contiguous suffix) is the only reading that leaves both
  piles legal runs, and the only one under which the given example works.
- **May the whole pile move**, emptying the post so the Dash top drops into it
  via `refillPosts`? That is the strongest move in the game.
- Trigger at 3+ cards as proposed, or 2+? A 2-card pile is equally movable.

**Watch:** `hasLegalMove` / `isStuck` become *wrong* if not updated with the rule -
`syncStuck` writes stuck claims automatically and three fruitless rotations end
the round, so a player with a legal run move could be declared stuck. The hold
gesture also collides with `useDrag`, which takes pointer capture and shows a
ghost card on pointerdown. And `movePostRun` must not assume a post stack is a
clean run: `reconcileTableau` filters post stacks by centre membership and
`normalizeTableau` returns whatever RTDB holds.

### Worth a decision

- **The black ring on a selected card.** Asked to be removed after it showed up in
  a screenshot, but it is `.card.selected` - the only thing that says which card
  you have tapped, and tap-then-tap-a-target is a whole input path. Left in place
  deliberately. If it is genuinely unwanted, it needs a replacement cue, not a
  deletion.
- **Bots report their lost races too**, so a human beating a bot gets a halo. Bots
  race often; if it turns out too frequent to feel special, gate `reportRace` on
  the loser being human in `driveBot`.
- **Your own wood still shows an empty slot** under the face-down pile before the
  first flip, where an opponent's empty slots are gone. Arguably a target rather
  than a gap - it is where the turned-over card lands.
- **Audio: the rest of it.** The shared decision is TAKEN and the cheap half is
  built: see "The table can make a noise" above, and `docs/audio-2026-09-09.md`
  for the research it came out of. The answer is **two switches**: the host's
  `meta.soundsOn` defaults OFF and governs the board, and each player's own
  `bz.soundOn` defaults ON. Anything added below inherits BOTH rather than
  introducing its own.
  Two things are still unbuilt, both deliberately:
  - **Sound effects on game events** (Part 2 of the research note), ranked there
    by value. A lost race is the one worth having first: today it is a flash you
    often miss because you were looking at your own hand. The playback path, the
    limiter and the switch all exist now, so the work is the recipes and the
    wiring, not the machinery. Note that the queue does NOT exist any more, so an
    event sound has nothing holding it back from stacking on itself - Watch the frequency: a centre-space land
    is the most common event in the game and needs to be under 60ms and
    pitch-varied per play, or it is a machine gun.
  - **Quick voice messages** (Part 1). Still the bigger job and still worth doing
    as base64 in the room, about 8 kB for three seconds of Opus, rather than as
    WebRTC or as another Firebase product. The levelling wants all three
    mechanisms: the browser's own AGC, a `DynamicsCompressorNode` in the capture
    graph BEFORE the encoder, and a stored gain applied through a limiter at
    playback. It is also the one node that would need a size bound in the rules
    and a sweep, neither of which the soundbites needed.

---

## What still needs testing

Verification is unit tests, emulator tests against the real security rules, and
static render assertions via `react-dom/server` - which catch structure, logic and
wiring, but not layout, legibility, timing or feel. The two recipes below are how
everything else got checked, and they are the reusable part.

### Rendering a component headlessly

Write a throwaway `*.test.ts` that `renderToStaticMarkup`s the component into an
HTML file beside copies of `theme.css` / `ui.css` plus the Outfit `<link>` from
`index.html` (the fallback font is much wider - omit it and the layout reads far
tighter than it is), serve the folder, and shoot it:

```
sudo npx playwright install-deps chromium && npx playwright install chromium
npx playwright screenshot --viewport-size "360,620" --color-scheme dark URL out.png
```

`--device "Pixel 5"` gives a real phone profile at DPR 2.75, which is what to use
for judging legibility. (Device profiles that default to WebKit - the iPhone ones -
need `npx playwright install webkit` first.)

**One artifact to know about:** a static render has no JS, so framer-motion's
`initial` state never animates away. `CardView` sets `initial={{ rotateY: 90 }}`
whenever `flipKey` is passed, which leaves the turned-over wood card frozen
edge-on and invisible. Neutralise it in the harness page, not the component:

```css
.card[style*="rotateY"] { transform: none !important; opacity: 1 !important; }
```

This covers layout, colour and legibility at a known width in both themes. It does
not cover touch or timing - for those, drive the real app.

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
takes an admin bypass - `Authorization: Bearer owner`, NOT `?auth=owner`, which is
refused:

```
curl -X PUT -H 'authorization: Bearer owner' -d '"roundEnd"' \
  'http://127.0.0.1:9000/rooms/<CODE>/meta/phase.json?ns=demo-dash-default-rtdb'
```

Write `round/scores` and `players/$uid/score` yourself and the score sheet shows
exactly the movement you want to look at; set `round/dashedBy` and flip the phase
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

- **Whether the soundbites SOUND like anything.** They were verified in a real
  browser end to end - one client presses, the other client's audio graph builds
  exactly the right number of voices, sound stays off by default, and the sender
  does not hear its own echo back - but that measures scheduling, not sound.
  Nobody has listened to them. Eight synthesised stings that are individually
  fine can still be indistinguishable from each other across a table, and Groan
  in particular is a falling tone doing the work of a voice. Expect this to want
  a tuning pass on the recipes in `src/game/soundbites.ts`, which is the only
  file that has to change for it.
- **The silent switch, and this is the one to be wary of.** Web Audio plays
  straight through iOS's mute switch; `<audio>` elements do not. So a phone that
  was silenced in a pocket will still make these noises. The mitigation is that
  the HOST's switch defaults off, so a table is silent until somebody asks for
  it - but note that the player's own switch defaults ON, so once the host says
  yes, a silenced phone in a pocket IS in scope. That is a mitigation and not a
  fix. Nothing in the app can read the switch; the real fix would be rendering
  each clip to a buffer and playing it through an `<audio>` element, which is a
  much heavier path and was not worth it before anybody had heard the clips.
- **The press-and-hold gesture on a real thumb.** It was driven with a synthetic
  pointer - down, hold past `TAP_MS`, slide, lift over a target - and the arming
  and the dismiss both behave. A mouse is not a thumb: whether `SLOP_PX` is
  forgiving enough for somebody holding a phone one-handed mid-round, and whether
  the menu opens somewhere a thumb can actually reach the far corner of, are both
  unmeasured.
- **iOS at all.** The audio unlock is a `resume()` inside the toggle's own tap,
  which is what Safari requires, and the lobby exists as the calm place to do it.
  That reasoning has not met a real iPhone.
- A full round to completion on the new board - dash call, scoring overlay, next
  round, rematch.
- **AI players end to end.** The bot loop has only run against fake deps and fake
  timers. Whether a bot's dash announces correctly and whether host transfer
  hands bots over cleanly are both unknown. Difficulty was retuned on 2026-08-25
  after Easy beat a casual human; whether Easy is now beatable *without being
  inert* is unverified.
- The all-stuck path **with bots in the room**. It has been driven for real with
  two human clients (stuck player, away player, three rotations, `dashedBy: null`
  round end), but a two-bot table now reaches a normal dash rather than the stall
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
- The re-shaped grid on a real short screen - six columns with a ragged bottom
  row has only been seen in a headless Chromium.
- `aspect-ratio: 2.5 / 3.5` on a **wide window** specifically - the phone shots
  cannot show the old `--card-h` bug, which was invisible at 360px because both
  values clamped to the same number.
- Five to eight players at a real table, and several bots at once with a low-end
  phone as host - every bot turn runs there.

### Reconnecting after backgrounding

Reported and fixed blind on 2026-08-25; still needs the test that found it -
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

The nudge in particular is unverifiable from here - it depends on how a real mobile
browser freezes and thaws a tab. **If it still fails, the diagnostic is which
screen you land on:** "Reconnecting…" means the resume path failed; the dimmed
board with the "reconnecting…" pill means the socket is still down; the join form
means the anonymous identity was lost, which is a different bug.

In a 1-human + 1-bot game you are the only client, so while you are away the whole
game is frozen, including the bot. That is inherent to a serverless design.

**A related known gap:** a phone that locks hard freezes its timers, so that client
cannot mark itself away either. In practice it drops the socket and `connected`
catches it - but if the idle-table hang reappears with a locked phone on the table,
that is where to look.

### What iPhone Safari has not covered

It has been opened once (2026-08-27, three phones), which is where the drag-ghost
offset came from. That session did NOT cover: the ghost's new self-correction,
written afterwards and so far only proved on a browser that never needed it;
address-bar behaviour during a drag; and the "no moves" note, which needs a player
genuinely stuck to appear. Nor has anything since 2026-08-27 been on real glass at
all - the sizing rebalance, sitting out, the theme toggle and the ready gate have
only been driven headlessly.

Spec §7 touch acceptance is also still unconfirmed on a phone: no pull-to-refresh,
no rubber-band scroll, no double-tap zoom, no text selection while dragging. So is
the ledgered pointer-capture re-select check on mouse drags.

---

## Known gaps, not blocking

- Test counts are quoted in the header of this file and nowhere else, because
  they drifted three separate ways when they lived in four places. If you add
  tests, update that one line or delete the number.
- Bundle, measured 2026-09-04. **A first load is 140 kB gzip**: the entry at
  16 kB and the vendor chunk at 123 kB. Everything that animates comes later, on
  demand - see "Framer-motion arrives with the board" below. The vendor split
  itself saves no first-load bytes; it lets a returning player keep that chunk
  across deploys, which is most visits to a game that ships this often. Firebase
  is 229 kB of it and cannot leave the home screen without dismantling the
  module-scope store singleton, so it is the floor. The audit's note that a lazy
  keeper route was not worth a loading state still holds on its own terms - the
  route is 3 kB gzip - but it rides along free now, because the boundary exists
  for the library rather than for the route.
- **A centre play used to be invisible to the player who made it for a whole
  round trip, and silently dropped their next one. Fixed on 2026-09-04.**
  `playToCenter` passed `{ applyLocally: false }`, so the write raised no local
  event and the centre pile, which renders straight off server state, did not
  have the card while the hand no longer did. The expensive half was never the
  animation: `playTo` gates the next play on `room.round.spaces[space]`, stale
  for the same window, so a red 3 followed by a red 4 onto one space lost the
  second with no card and no scowl, and flinging made that routine. The option is
  gone, the reasoning is in the comment above `runTransaction` in
  `src/net/plays.ts`, and `plays.emu.test.ts` pins it: the listener must hold the
  card while the transaction is still in flight. **Two things to watch at a
  table**, both new and neither covered by a test: a refused play now flashes
  onto the pile and is pulled off rather than never appearing, and on a
  `datastale` retry a contested space can flicker twice.
- **The database is in us-central1, and that is the right place for it. Do not
  move it.** `databaseURL` is `holland-hustle-default-rtdb.firebaseio.com`, and
  only us-central1 instances are served on the legacy `.firebaseio.com` domain;
  a regional one reads `<name>.<region>.firebasedatabase.app`. The owner
  confirmed on 2026-09-04 that every player is in US Eastern, which settles a
  question an earlier latency pass had to leave open. Eastern to Iowa is roughly
  30 ms of round trip, near enough optimal, and one round trip per centre play
  is already the floor: a play cannot reach another player faster than actor to
  server to other player. Moving the instance to `europe-west1`, which an
  earlier draft of this file suggested while the player base was unknown, would
  roughly triple that for everybody. The name of the game is not evidence about
  where it is played.
  The number matters beyond this bullet, because everything else on the latency
  list is priced against it. A round trip here is worth about 30 ms, not the
  100 ms a transatlantic hop would cost, so removing a round trip buys a third
  of what it would in Europe, and the BYTES on the entry path now cost more than
  the trips do. Re-read the entry and bundle bullets below with that in mind.
- **Entry costs two round trips on the resume path, which is how this app is
  usually entered** (reload, phone lock, tab away to send the invite and back).
  It was four. `peekRoom` read the whole room, `joinRoom` opened with its own
  unconditional `get` of the same node, the listener hashed an empty cache and
  downloaded it a third time, and the rejoin branch awaited a `connected: true`
  write: 47,373 bytes of identical payload for one entry, and the SDK keeps
  nothing between the two gets, because `repoGetValue` caches only active queries
  and drops the sync point on its way out. Both cheap fixes landed on 2026-09-04.
  The awaited write went first (`startPresence` makes the same write a line later
  the moment `.info/connected` reports true), and then the duplicated `get`: the
  room `Join.tsx` peeked is threaded into `joinRoom` as its optional fourth
  argument. On the domestic floor that second one is worth more for the 47 kB
  than for the trip, because a round trip here is about 30 ms.

  **That argument is trusted, not checked, and only the resume path may pass
  it.** Trusting it is the entire saving - a room that got verified would have
  been a room that got downloaded. The cost is that a membership which has since
  gone away is still believed for the length of the window, so the window is what
  has to stay small: on the resume path it is one await, and `Join.tsx` has just
  established membership from that very object. The form path passes nothing and
  pays for its own read, because by the time somebody has typed a name and picked
  a badge the peek can be minutes old, and a stale one turns a room that is
  simply `full`, or whose badge is taken, into a `race` - the player told the
  wrong thing about why they cannot get in. Nothing corrupts either way, because
  the rules and `increment(1)` enforce the cap for real.
  `rooms.emu.test.ts` pins the trust the blunt way, with the same call against a
  code that does not exist answering differently depending only on whether a room
  came with it, and `store.test.ts` pins the wiring in between, which is the part
  a refactor drops silently: the argument is optional, so losing it costs a round
  trip and breaks nothing visible.

  **What is left is the listener's own download**, and it is not worth chasing.
  It is the sync point the SDK establishes for the live subscription, not a
  redundant read of something already held.
- **`createRoom` is one atomic write as of 2026-09-04.** It was two sequential
  ones, held apart by a comment that outlived its rule: the `players/$uid`
  validate used to read `meta/phase`, and that cross-reference only worked
  against already-committed data. Nothing reads `meta/phase` from the rules now.
  The merge is legal because `root` is the PRE-write tree, where the room has no
  players yet, which is the branch `hostId` and `creatorId`'s validate take, and
  badges only checks the writer's own uid. Proved against the rules engine in
  `rooms.emu.test.ts` ("ONE atomic write"), **and separately against the rules
  that are live today**, because this branch's rules file has not been deployed
  and a create that only passed under the new one would have broken every new
  room until it was. It buys a round trip, and it means a create can no longer be
  interrupted between the two writes and leave a meta behind with no players.
- **The join form no longer comes back after a successful join.** For one listen
  round trip `joinPhase` is `in-room` while `room` is still null, and
  `RoomScreen` tested the two together, so it re-rendered the live form, button
  and all, to somebody who had already joined; a second tap re-ran `enterRoom` and
  churned the presence writer through the stale-attempt branch. It now shows the
  `Rejoining` placeholder, which moved out of `Join.tsx` into a component both
  screens share. The decision is `roomView` in `src/ui/screens/roomView.ts`, pure
  and tested, and it is a separate function for a reason worth knowing: zustand
  hands server rendering the INITIAL state, so a `renderToStaticMarkup` of
  `RoomScreen` shows the store as it was at import no matter what a test sets.
  A store-backed screen cannot be render-tested here; pull the decision out and
  test that instead.
- **Every card in a hand stores a 28-character owner id it does not need. HALF
  DONE, and the rest is a two-release change - read this before finishing it.**
  Inside `round/tableaus/$uid` the field is redundant and the rules prove it, by
  validating the owner against the path key. Dropping it roughly halves a 21.7 kB
  eight-player deal, which is no longer dwarfed by the network: that deal is about
  35 ms of host uplink against a round trip of about 30 ms.

  **Release one landed on 2026-09-05.** The rules make `owner` optional on the
  three tableau piles - and still REQUIRE it in a centre space, where the badge on
  the card, the race flashes and the rivalry tallies all read it - and
  `normalizeTableau` now takes the uid of the pile it is reading and fills in any
  card that arrives without one. The client still WRITES the field. Both halves
  are pinned, at the emulator and in `center.test.ts`.

  **Release two is stopping the writer, and it must not follow immediately.** A
  client on a cached older bundle renders every dealt hand EMPTY, because its
  `isCard` wants a string owner - and `startRound` writes every player's tableau,
  so a single host on a new bundle empties the hand of everyone still on an old
  one. That is the failure this file already records from the first iPhone
  playtest. Ship it once every device has reloaded, which in a playtest means
  asking and waiting rather than assuming, and only after the rules above are
  deployed.
- **Two things that are already right, so nobody spends a week on them.** Do not
  narrow the room listener: `startRound` is one multi-path update at the room
  root, and a whole-room listener gets it as one consistent callback, where four
  narrow listeners were probed and split into three frames in different
  macrotasks. The dangerous tear is the re-deal, where `meta.roundNumber` bumps
  while `round` still holds the previous round's board, which reads as valid and
  fires the new-round branch against the wrong spaces. And do not optimise
  `normalizeRoom`: measured at 0.0148 ms against `snap.val()`'s 0.109 ms, call
  it 0.5 to 1 ms on a phone against about 30 ms of network. If per-snapshot
  work ever needs cutting, the order is the render, then `snap.val()`, then
  `normalizeRoom` last.
- The remaining network items the audit found and left are in
  `docs/audit-2026-09-03.md` under "Recorded, not fixed". Two of them were
  re-measured since and are smaller than they read: `centerPlayTxn` rewriting a
  whole space is 331 to 366 bytes and no extra round trip, and the `stuckRounds`
  reset is a 67-byte pipelined put that produces no delta and therefore no
  fan-out at all. Do not add the obvious client-side guard to that reset: a
  player who plays inside the round trip before the host's all-stuck increment
  fans out would skip it and leave the stall counter standing, and three of
  those end a round that is being actively played.
- `database.rules.json` bounds types, enums and ranges on every leaf since the
  audit, but not the SIZE of a write (no `$other: false`, no `hasChildren` on
  containers) and not the shape of a bare `players/$uid` write against the seat
  counter. That structural tier is `docs/database.rules.proposed.json`, explained
  in `docs/audit-2026-09-03.md`, and waits on a production probe of two rule
  semantics the emulator alone cannot prove. The client reads defensively either
  way.
- Rooms are never deleted and cannot be (no `.write` on `rooms/$code`).
  About 28 kB per finished game; Spark's 1 GB holds decades of them and the
  10 GB/month download quota binds first. The rule and client hook for a
  creator-side sweep are in the audit doc.
- One anonymous uid is assumed to be one client. Auth persistence is shared
  across same-origin tabs, so a player with the game open twice writes
  `connected: false` for themselves when either tab closes (presence re-asserts
  only on a connection transition), and two host tabs both drive the bots and
  both tick the countdown. Self-inflicted, and the spec's multi-tab playtest is
  where it shows. A per-tab presence child or a `BroadcastChannel` leader
  election is the fix when wanted.
- A stranger holding the code can still delete `meta/hostId` or the host's
  record: a validate never runs on a delete. The consequence is handled: the
  stand-in watchdog now treats an absent host like a disconnected one, so the
  room recovers a host even with the creator gone. The write itself waits on the
  structural tier (audit doc, seventh reader).
- `joinRoom`'s expiry check is the one cross-device clock comparison left in the
  app (see "Two phones do not agree on the time"). It now runs AFTER the rejoin
  branch, so a member is never told their own room expired, and `createdAt` is
  write-once in the rules (not live until deployed). The skew still turns a
  newcomer away whose clock is a whole day out; that would need a server-side
  comparison.
- Long-session memory has never been measured. The store's maps are bounded by
  inspection; the heap after ten rounds of remounting the board is a number
  nobody has.
- `npm audit` reports 8 moderate advisories, all under the `firebase-tools`
  dev dependency, none reachable from the bundle, none cleared by 15.29.0.
  Re-check on each `firebase-tools` bump; do not run `npm audit fix --force`,
  which downgrades it a major.
- CI runs on push to `main` only, so it gates the deploy and not the merge, and
  the actions are on floating major tags with no Dependabot. Both are fine for
  one author pushing to main and worth revisiting when a second appears.
- `oxlint` reports 8 warnings and zero errors: six `react(only-export-components)`
  fast-refresh hints (`App.tsx` twice, `CenterGrid`, `PileStack`, `ShareInvite`,
  `TableauView`) and two on `GameRoute` - a `react(purity)` for `Date.now` in
  render and a `react(set-state-in-effect)`. The count is worth keeping honest,
  because "no NEW warnings" is the only thing it is useful for.
- ShareInvite clipboard try/catch; rejection-shake remounts the tableau;
  room-code collision check on create; the bell's hue sits near suit red (the
  kite's near-blue went with the kite); host transfer disabled in lobby
  (deliberate).
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
| `d1c85b4` | Swapped wood and Dash - wood to the right thumb |
| `26ff306` | This handoff, rewritten around pending work and the landmines |
| `6abe8bd` | CI runs the rules tests; guard so that cannot silently regress |
| `7803a44` | Race flashes - who won a contested space, told by the loser |
| `18d57d1` | The score sheet plays the change in standings out |
| `4fdd258` | Dash splash: glitter for the winner, worse for the worst round |
| `58ebb3f` | How to drive the real app, and what doing it proved |
| `77bafc1` | The board rendered at last; most of the never-rendered list closed |
| `05516a8` → `cdd986e` | The score sheets talk: commentary, per-game stats, no repeats |
| `b38da9b` | Round arithmetic on the score rows; `--danger-ink` for dark mode |
| `5d7039d` | `#/keeper` - a scorepad for a game played with a real deck |
| `92f57d0` | The keeper's round timer; the wood/Dash side picker |
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
| `85705c4` | The host can cancel a countdown and keep the lobby |
| `406bbad` | Start anyway shares the ready button's row; the stale scowl cleared |
| `e2e61e1` | Start anyway counts down; the players it deals around can deal themselves in |
| `b6e058a` | The host can sit a round out, and the table starts without them |
| `9f1a634` | A stale Away that locked a host out; glitz, card flips and badge jokes |
| `9bb1ba8` | Fireworks, four losing faces, an opaque card turn, and the AI overlords |
| `c2640b7` | Ten times the fireworks; a louder hint; the wood shows what is under |
| `c7a1da9` | The flick aimed by direction; the whole space above the hand |
| `258e544` | A way out of being stuck; a countdown between rounds |
| `1d19fc2` | The gender plates back and softer; the two-player board squared off |
| `26723d5` | The stuck note moved to the empty band beside the wood |
| `e6c6feb` | No em dashes anywhere; the empty band catches a short throw |
| `821d8ab` | A throw takes the space it landed on or beside, before aim is judged |
| `ef295be` | The near radius settled at 45px |
| `aafd534` | The flick bench published beside the app |
| `bbf3cac` | The bicycle retired for a clover |
| `2e2bb62` | The kite retired for a clownfish |
| `8113014` | The fish badge labelled for the glyph the phones draw |
| `e0a8ed2` | A throw takes a space it flew over; the near radius down to 30 |
| `20999f3` | The cone down to 30 degrees; the bench board at any table size |
| `000f212` | The near radius swept along the path; the bench board measured off the game |
| `fc0355e` | A new flick rule waits on the bench until the table approves it |
| `edd3875` | The bench tries the sweep last, and says so; the game has not moved |
| `ab1c651` | The bench colours every legal slot by what the throw did to it |
| `e9bf58c` | The sweep ships as the last resort, behind the cone |
| `0eb22c1` | Every CI action onto a major that runs on Node 24 |
| `cba9fe2` | The stuck band measured off the piles; dash on the pile; Fish |
| `3d20a59` | A layout suite that measures the band in a real browser |
| `40f4d9a` | A dragged card leaves the pile it came from, on every pile |
| `404cafd` | A desktop animates whatever the OS says; Dash everywhere on screen |
| `21aceac` | The code says dash too: keys, types, CSS, tests |
| `aa4ec3e` | The emulator project and the borrowed game name follow |
| `dc78867` → `e3c6676` | Security and performance audit: the ghost off the render path, memoised cards, defensive reads, one-field wood writes, self-hosted fonts, least-privilege CI |
| `cecb628` → `0b29024` | The audit's analysis finished by hand after the limit: the verdict ledger, the seventh reader, and the four small gaps it found closed (late-play rollback, write-once createdAt, an absent host recovered, a CSPRNG room code) |
| `b150224` → `31df523` | Where the multiplayer latency actually goes: a centre play is invisible to the player who made it for a round trip and silently drops their next one, entry costs four serialized round trips on the resume path, and the database is already in the right region because every player is Eastern |
| `c73e341` → `0bdb136` | The last em dash swept out, and a test so none come back |
| `75dec4b` | A centre play its own player can see, so the next one is judged on a board that has it; `createRoom` as one atomic write; the rejoin presence write no longer awaited; and no join form offered to somebody already in the room |
| `e4b029d` | The room the join screen already read, threaded into the join, so entry stops downloading it twice |
| `4b05de8` | The bolt that says who dashed, on the sheet that ends the game and on the scorepad's |
| `4a10893` | A wood turn brings three across the turn-over, so the pile stops showing the same four cards for ever |
| `05279d9` | Framer-motion off the entry path: a first load drops from 199 kB gzip to 140, and the animation code comes down with the board |
| `a025086` | A flick no longer dies on a square it flew over: the square under the finger wins only if the card can go there |
| `206765e` | The turn that takes the wood pile over keeps all three of its cards on the flipped pile, and the pile is written with the index |
| `53fc06e` | The pile going back under the draw pile is a move you can watch, rather than a jump between frames |
| `c1ef6e5` | Rooms can be deleted and a device sweeps its own; a web app manifest; and the owner id made optional on a stored card, half of a two-release change |
| `0feb7b3` | A new icon, full bleed, and a script that renders its PNGs from the SVG instead of redrawing them |
| `ef9aa6b` | A second, simpler drawing of the icon for the tab, where the full one is a speck |
| `ad471e9` | The icon on the home screen, beside the title |
| `eaac4a3` | A dash rains emoji; the fireworks moved behind the sheet that says who won |
| `b8f156e` | Twice the fireworks over twice as long, and a twinkle that stops when the flight does |
| `bdfabce` | Roman candles up the edges of the win, a different instrument from the shells |
| `facfaf8` | The host can remove a player, in the lobby or mid-game, and the removed client leaves cleanly |
| `6d89e1b` | Options below the ready button, a rematch that waits, a ready pill that says away, score history behind a total, and fireworks for the winner alone |
| `00b145d` | A player who is still stuck after sinking a card stays stuck, and can send the next one down at once |
| `4bc468c` | Forty-five shells over the same eight seconds, and what that costs |
| `dcaaf8e` | The flicker on the white sparks only, which is where the glitter was coming from |
| `b10c891` | A two second race window, and a halo for every player who went for the space |
| `f59bb68` | The haloes arrive one at a time, the first one centred |
| `55abb9b` | The flick cone down to 20 degrees, in the game and on the bench together |
| `57d1c1e` | The near radius down to 25px, which moves the swept band with it |
| `ec976fc` | Bots aim at the lowest open space; Genius cheats four ways |
| `5657a09` | The wood turn at half speed, gather in the middle of the deal |
| `4a289a2` | Eight canned soundbites, a host switch and a player switch, a launcher over the Dash pile with tap and hold-to-slide, and the emoji falling down the top third of the screen |
| `4612f2e` | The fire falls only on a run of two or more dashes, and the glyph count stays the same with it or without it |
| `952ebb5` | The wood cards overlap again, and the gather is 250ms |
| `951705e` | A drift sweep over this file: createRoom is one write and had been for a while, the wood nonce is woodTurnover, and the lint tally is eight |
| `0e1adb7` | Six soundbite fixes: the first press, the queue, the sticky menu, the stack, the chime |
| `1e1a4d8` | Another 50ms off the wood step, so the cards overlap by 100ms |
| `28f4d70` | A finished pile turns over to show whose it was; the bots hesitate |
| `45c275d` | Genius lies in wait; countdown tones; the race remarks get seen |
| `83f1979` | The carousel cycles its remarks instead of repeating them |

Earlier history, the approved design spec and the original 15-task execution
ledger are in `docs/superpowers/`.
