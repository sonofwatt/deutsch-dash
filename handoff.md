# Project Handoff — Deutsch Dash

_Last updated: 2026-08-26 at `05516a8`. Working tree clean, `main` ==
`origin/main`, CI green including the emulator suite, and the live site matches
`HEAD`._

_**195 tests green** (177 unit + 18 emulator). This is the only place in the repo
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

### 1. Move the recycle button to the bottom right — _retired 2026-08-26_

**Removed instead of moved** (`8f66869`). It covered `.card-badge` at every card
size and took about two thirds of a small phone's card width, and the empty draw
slot beside it already shows the ↻ and flips on tap. The note below is kept for
why the move was never the right answer.

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

- Three or more players — only two have ever played, and the bots have now been
  driven for real but only briefly.
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
