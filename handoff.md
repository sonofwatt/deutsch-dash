# Project Handoff — Deutsch Dash

_Last updated: 2026-08-26 at `b38da9b`. Working tree clean, `main` ==
`origin/main`, CI green including the emulator suite, and the live site matches
`HEAD`._

_**138 tests green** (122 unit + 16 emulator). This is the only place in the repo
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
  finished pile. Finished piles show on the rails flanking the board.
- Board size is `min(24, 4 × players)` — `spaceCountForPlayers`. Four per player
  is one space per Ace in the game; the cap is a legibility choice.
- **`ENABLE_STUCK_BUTTON` is `false`** and the whole stuck path still runs
  underneath. Being stuck is *detected* by `isStuck` + `syncStuck`, not declared.
  `isStuck` needs more than "no legal move": either zero wood, or
  `flipsSinceProgress >= ceil(wood.length / 3)`.
- That flip counter is a closure-scoped `Map` in `createGameStore`, never
  persisted — **it resets to zero on any page reload**.
- Tableau order is Blitz | posts | wood. Wood sits under the right thumb because
  it's the pile touched most. `render.test.ts` pins this order in both the
  tableau and the opponent strip.

---

## Pending work

Seven requests from the 2026-08-25/26 playtests. **#7 landed** and **#4 is
deferred**; the other five are unstarted. Each was specced against the real code;
the open questions are decisions only the product owner can make, and several
genuinely change the game rather than the interface. Numbering is kept as-is so
earlier notes still point at the right item.

### 1. Move the recycle button to the bottom right — _small_

The `↻` on the turned-over wood card is `.recycle` in `game.css` (`left: 3px` →
`right: 3px`). One declaration.

**Decide first:** the 22×22px button **completely covers `.card-badge`** at every
card size, so one of them has to give. Options: accept the occlusion (the badge
is decorative on your own tableau), suppress the badge on that one card, or
shrink the button. Related: `.recycle` is a fixed 22px while `--card-w` floors at
34px, so on a small phone it covers about two-thirds of the card's width — and
moving it right puts that dead-to-drag zone on the side the thumb arrives from.

**Watch:** `render.test.ts` asserts `toContain('class="recycle"')` as an exact
substring including the closing quote, so adding any second class to that button
breaks it. Nothing pins the button's position, so the move itself is unguarded.

### 2. Choose which side wood and Blitz sit on — _small_

New `src/ui/prefs.ts` + a `SidePicker` on Home and Join, storing `bz.woodSide`
alongside `bz.name` / `bz.badge`. Thread a `woodSide` prop into `TableauView` and
`OpponentStrip` and swap the two end groups.

**Decide first:**
- Pre-join only, or changeable mid-game? A player resumed by auto-rejoin never
  sees the Join form again, so pre-join only means they cannot change it without
  clearing storage.
- When wood moves left, does the **whole tableau mirror** (posts reversed too), or
  do only the two end piles swap? A true mirror is what a left-handed player
  probably pictures; swapping only the ends keeps each post where they last saw it.
- Label it ergonomically ("Right-handed" / "Left-handed") or literally ("Wood on
  the right")? That decides whether it reads as an accessibility setting.

**Watch:** invalidates the two order-pinning tests in `render.test.ts` — they must
become parameterised rather than deleted. Required prop ⇒ build break (see traps).

### 3. Move the "no moves" alert into the drop band — _small_

Delete the `.stuck-note` `<p>` under the tableau, pass `stuck={me.stuckAt != null}`
into `CenterGrid`, and render the text inside `.snap-band` — brighter and bolder
than the band's existing hint. Fixes the board shifting when the alert appears.

**Decide first:** does the stuck band take an alert colour (`--danger`, amber) or
stay neutral? Is the copy fixed, or can it shorten to guarantee one line in a
~260px band on a 360px phone? And while the note shows, is the faint "drop here"
hint hidden or still visible alongside it?

**Watch:** pinning `.snap-band` to a fixed height removes its growth escape hatch
— longer copy clips rather than reflows. That's the intended trade, but it
constrains future wording.

### 4. Move a run of cards between post piles — _deferred 2026-08-26_

Not being built for now. The spec below stands if it comes back.

**It is a house rule, confirmed at the source.** Dutch Blitz's own FAQ says of the
post piles: "You can move one card at a time - you cannot shift entire piles."
(https://dutchblitz.com/pages/policies-faq). The design spec's one-card-at-a-time
wording is therefore correct as written, and shipping this would need the lobby
toggle below rather than being a silent change to everyone's game.

Today only the top card of a post pile can move (`placeOnPost`). The request:
tap-and-hold a pile, see its cards in a row, tap which to move, tap a destination.

**This is the one that needs the most thought before any code.**

- **The wording says "wood piles" but the example describes post piles.** In this
  codebase `wood` is a single face-down draw pile flipped three at a time, with
  only `wood[woodIndex-1]` playable — it cannot hold a run and there is only one
  of it. The descending alternating runs in the example (9,8 and 10,9,8,7,6,5) are
  post piles. **Confirm this reading before starting.**
- **Everyone or nobody.** House rule for every game, or a lobby toggle so a purist
  table can play by the book? It cannot be per-player — it's a shared rule.
- **What does "tap which cards to move" mean?** Taking the card at depth k plus
  everything above it (a contiguous suffix) is the only reading that leaves both
  piles legal runs, and it is the reading under which the given example works.
  Arbitrary multi-select does not.
- **May the whole pile move**, emptying the post so the Blitz top drops into it via
  `refillPosts`? That is the strongest move in the game — emptying the Blitz pile
  is the only way to win a round.
- Trigger at 3+ cards as proposed, or 2+? A 2-card pile is equally movable.

**Watch:** `hasLegalMove` / `isStuck` become *wrong* if not updated with the rule —
`syncStuck` writes stuck claims automatically and three fruitless rotations end
the round, so a player with a legal run move could be declared stuck. The hold
gesture also collides with `useDrag`, which takes pointer capture and shows a
ghost card on pointerdown. And `movePostRun` must not assume a post stack is a
clean run: `reconcileTableau` filters post stacks by centre membership and
`normalizeTableau` returns whatever RTDB holds.

### 5. Host option: orderly grid, one colour per column — _medium_

`CenterSpace` gains a `suit` constraint, `RoomMeta` gains `orderlyGrid`, and
`centerPlayTxn` enforces it server-side. Lobby toggle next to "Play to".

**Decide first:**
- At 5+ players an orderly board needs **8 columns** to stay within 4 rows, which
  drops the slot to ~34px on a 360px phone — at or below the card floor that is
  already flagged as having about 3px of slack. Accept smaller cards in orderly
  mode, cap orderly boards at 16 spaces, or allow more rows?
- A 5-player board is 20 spaces = 5 per suit, which does not split evenly into two
  columns — four visible holes in the bottom row. Accept, or bump orderly
  5-player boards to 24?
- Orderly mode **strictly narrows where an Ace can go**, so a suit whose columns
  are full starves while others sit empty: more stuck declarations, more
  rotations, a more reachable "three fruitless rotations ends the round". Is that
  the intended texture?

**Watch:** `store.test.ts` asserts `playToCenter` was called with exactly three
arguments, and `toHaveBeenCalledWith` is arity-exact — adding a fourth breaks two
tests. Adding to `Deps` breaks `fakeDeps()` at typecheck time, so it's a build
break.

### 6. Helper hint that flashes a playable card — _small_

New `src/game/hint.ts` reusing the bot's own `botMoves` / `rankMove`, a `hint`
prop through `TableauView`, and a CSS pulse. No Firebase write needed if it's a
local preference.

**Decide first:**
- Local per-player, or host-controlled for the room (fairness in a competitive
  game)? Local is far cheaper.
- Flash **only the single best move**, or every playable source? Flashing
  everything is often three or four cards at once and comes close to playing the
  round for them.
- Immediate, or only after a few seconds of no input? A delay needs an idle timer
  and a decision on what resets it.
- When nothing is playable, should it point at the wood pile to suggest a flip?
  That overlaps with the automatic stuck detection.

**Watch:** the hint hands a human the exact move a Hard bot would pick — it is
literally the branch `chooseBotAction` takes when not being sloppy. Bot difficulty
was tuned against a human *without* hints, so "is Easy beatable" reopens for
players with hints on. Also: `.glow` green currently means exactly one thing
("the held card can land here") — a second green would erode it, so use a
different colour. Reduced motion is unhandled today; `MotionConfig
reducedMotion="user"` does not cover CSS keyframes.

### 7. Score screen: round arithmetic — _landed in `b38da9b`_

Rows on both sheets now read `🌷 Dave -4 +6 = +2 │ 47`: penalty, cards played,
`=`, the round's delta, then the running total set off by a rule.

Decisions taken, so they don't get re-litigated:

- **The `=` sits between the components and the sum, not before the total.** The
  originally requested `-4 +6 2 = 47` asserts "2 = 47", which is false for anyone
  with a prior score. No header row: labels wide enough to read ("Played",
  "Round") cost more width than the numbers they label and squeeze the name below
  an ellipsis on a 360px phone.
- **The sum is `RoundScore.delta` verbatim**, never recomputed from
  `centerCount`/`blitzLeft`, so it cannot disagree with the total beside it.
  `render.test.ts` feeds a contradicting fixture to pin exactly that.
- **Zero is unsigned and muted** — a blitzer reads `0 +9 = +9`, not `-0`, and the
  danger red is reserved for a real penalty.
- The duplicated row moved out of both overlays into `ScoreRow`, which takes
  `score` as optional: game over can render from a snapshot with no
  `round/scores`, and degrades to a name and a total.

Rendered headlessly at 360px in both themes (see "What still needs testing" for
the recipe), which caught two things worth keeping:

- **Every row is its own grid**, because the row is the card that carries the
  background and border. `auto` columns therefore size to each row's own digits
  and the `=` signs stagger down the sheet, so the value columns are floored at
  `3ch` — exactly three tabular digits, which is every value the game can produce
  — and right-aligned. `minmax` lets anything wider grow rather than clip.
- **`--danger` at 1.9:1 on the dark surface** was barely readable as text. It is
  now two tokens: `--danger` stays the fill (the disconnected pill needs white
  text on it), `--danger-ink` is the text colour and lifts to `#ff8a7d` in dark
  mode. `.error` uses it too, so every error message in the app got legible.

That leaves the name track: `minmax(0, 1fr)` with `text-overflow: ellipsis`, which
is what keeps a 14-character name from overflowing the sheet into a horizontal
scrollbar. At 360px a name gets about 90px — "Annalisa-Marie" ellipses to
"Annalisa-…". Widening it means taking width from the arithmetic.

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

That covers layout and legibility at a known width in both themes. It does not
cover touch, timing, or how a real phone actually lays out — the list below still
stands.

### Check the URL first if something looks broken

**GitHub does not redirect Pages for a renamed repo.** Verified: the old
`/flemish-fury/` path returns a bare 404 with no redirect. A browser holding the
*old* cached `index.html` renders a **blank page**, because that shell points at
`/flemish-fury/assets/*`. Blank page ⇒ check the URL and hard-refresh before
assuming a code fault.

### Never rendered

- Container-query grid sizing (`container-type: inline-size` + `100cqw`), Chrome
  105+ / Safari 16+. Where unsupported the slot falls back to a fixed `--card-w`,
  which can overflow at six columns.
- `aspect-ratio: 2.5 / 3.5` card proportions, and that the old `--card-h` bug is
  genuinely gone on a wide window (it was invisible at 360px because both values
  clamped to the same number).
- `color-mix()` in rail chips, card backs and finished-pile tints — Chrome 111+ /
  Safari 16.2+.
- Pile-depth peek layers now that the step scales with the card.
- The washroom plates: legibility at 44px, and whether boy and girl are told apart
  at a glance.
- Dark mode across every new surface: rails, snap band, stuck note, AI tag,
  recycle button.
- **The 44px card floor at 24 spaces / six columns on a 360px phone.** The
  arithmetic says it fits with about 3px to spare. Not a margin worth trusting.
- Drag ghost tracking the cursor exactly, after the `left: 0; top: 0` fix.
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
- Automatic stuck detection firing in a real game, and the all-stuck rotation with
  bots in the room.
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

### Scale

- Three or more players — only two have ever played.
- Five to eight players, and the 24-space cap in practice.
- Several bots at once with a low-end phone as host — every bot turn runs there.

### Carried over, still true

- iPhone Safari has never been opened.
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

Earlier history, the approved design spec and the original 15-task execution
ledger are in `docs/superpowers/`. The README carries setup, the security model
and the house rules.
