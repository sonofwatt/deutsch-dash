# Deutsch Dash

A mobile-first multiplayer Dutch Blitz card game for 2-8 players. Create a room,
text the invite link, race to empty your Blitz pile. React + Firebase Realtime
Database, hosted on GitHub Pages.

## Local development (no Firebase account needed)

Prereqs: Node 20+, and Java 11+ for the Firebase emulator. If you don't have
Java system-wide, drop a portable JRE at `.tools/jre` (gitignored) —
`scripts/with-java.mjs` puts it on PATH for the emulator scripts automatically,
and falls back to system Java when that folder is absent.

    npm install
    npm run emu     # terminal 1: local Firebase emulator
    npm run dev     # terminal 2: Vite dev server

Open http://localhost:5173 in two windows (one incognito) to play yourself.

Tests: `npm test` (pure logic) · `npm run test:emu` (adds emulator integration tests)

**Dev and tests always use the emulator, never the live database** — even with a
real config committed. That keeps `npm run dev` from writing real rooms and stops
unit tests opening a socket to production. A production build (`npm run build`)
always uses the real project. To point the dev server at the live backend
deliberately, run `VITE_USE_PROD=1 npm run dev`.

## One-time Firebase setup (~10 min)

1. https://console.firebase.google.com -> Add project (no Analytics needed).
2. Build -> Authentication -> Get started -> enable **Anonymous**.
3. Build -> Realtime Database -> Create database (pick the region closest to
   your players) -> start in locked mode.
4. Project settings -> Your apps -> Web app (</>) -> register -> copy the
   `firebaseConfig` values into `src/net/firebaseConfig.ts`.
5. Put your project id in `.firebaserc`, then deploy the security rules:
   `npx firebase login` and `npx firebase deploy --only database`.
6. Commit and push. Committing the config is safe: access control lives in
   `database.rules.json`, not in the config values.
7. Authentication -> Settings -> User account management -> enable **automatic
   clean-up of anonymous accounts**. See "Security model" below for why.

## Security model

The trust model is deliberate: **knowing a room code is the credential.** You text
a link to friends, and anyone holding that link can play in that room. Everything
below follows from that choice.

**Anonymous auth is not a login wall.** Anyone can mint an anonymous token
directly from the Firebase REST API without ever loading this site, so any rule
guarded by `auth != null` is effectively public. That isn't a weakness introduced
by enabling anonymous sign-in — it's what that gate is worth. The rules are
written on that assumption.

What that means in practice:

- **Protected.** Each player's tableau and player record are writable only by
  that player (or the host, who deals and commits scores). These are bound to
  `auth.uid`, which is exactly why anonymous auth is *better* here than no auth
  at all — without it there'd be no identity to bind those rules to.
- **Enforced server-side.** The 8-player cap, badge uniqueness, and lobby-only
  joining live in `database.rules.json`, not just the client. The cap uses a
  `meta/playerCount` counter written with the `increment(1)` sentinel so the
  server resolves it atomically and concurrent joins can't both slip through.
  (`numChildren()` would be the obvious way to count players, but the RTDB
  emulator's rules engine rejects it at parse time, so it can't be tested locally.)
- **Deliberately open.** Reading a room and writing the shared center piles
  require only `auth != null`. Someone who has a room code can watch or interfere
  with that game. Codes are 6 characters from a 32-letter alphabet (~1 billion
  combinations), so guessing a specific live room is impractical.

**The realistic risk is resource abuse, not data theft.** A script could create
large numbers of rooms or accumulate anonymous accounts. What's actually stored is
player-chosen display names and card positions — no emails, no payment details.
On the free Spark plan there is no billing exposure: exhausting quota stops the
database rather than generating a charge. That changes if you upgrade to Blaze.

**Mitigations, in order of value:**

1. Enable automatic clean-up of anonymous accounts (setup step 7). It deletes
   anonymous accounts older than 30 days, and with it enabled anonymous auth stops
   counting toward usage limits and billing quotas.
2. Stay on Spark unless you have a reason not to — it caps the blast radius at
   "service degrades."
3. If abuse ever becomes real, add [App Check](https://firebase.google.com/docs/app-check),
   which attests that requests come from the genuine web app. Overkill for a game
   you text to friends.

**Do not** apply the common advice to reject anonymous users in rules
(`sign_in_provider != 'anonymous'`). Every player here is anonymous by design;
that rule would lock out the entire game.

## Deploy to GitHub Pages

1. Push this repo to GitHub (repo name `deutsch-dash`; default branch `main`).
   The Firebase project keeps its original id `holland-hustle` — project ids are
   immutable, and it is never shown to players. The Pages base path is derived
   from the repo name by the workflow, so renaming the repo is all it takes to
   move the site; no config change here.
2. Repo Settings -> Pages -> Source: **GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site lands at
   `https://<user>.github.io/<repo>/`.

## AI players

The host can add AI players in the lobby at Easy, Medium or Hard. Difficulty is
mostly hands, not brains: every level only ever makes legal moves, and the levels
differ in how fast they act (`BOT_PROFILES` in `src/game/bot.ts`), how often they
take a worse legal move than the best one available, how often they fumble a turn
entirely, and how often they turn wood over instead of noticing the play in front
of them. Effective rate works out at roughly one action every 4.9s / 2.3s / 1.1s.
All three were tuned down after the first game against them — a bot punches above
its settings because it never plays illegally and never loses track of the board,
so speed and attention are the only honest handicaps. Move quality is ranked
the way the game actually rewards — anything that takes a card off the Blitz pile,
or empties a post so the Blitz pile refills it, beats an equivalent wood play.

Bots have no client and no auth identity of their own: **the host plays their
hands**, and if the host changes mid-game the new host picks them up. They are
never handed the host role themselves. Their badge is claimed under the host's
uid, which is what stops a human taking the same one without needing a rules
change. Bots do not count toward `meta/playerCount` (the server-side cap on human
joins, which can never decrease); the eight-seat total is held on the client.

## House rules vs. the physical game

A pile that reaches 1..10 is turned face down and **clears its space**, then
appears on one of the two rails flanking the board — so the finished count and
the suits that have gone stay readable instead of the cards simply vanishing.

Board size is **4 × players center spaces, capped at 24**. Four per player is the
natural figure: only an Ace opens a space, and each player holds exactly one Ace
per suit. The cap is a legibility choice — because finished piles clear, the board
only ever has to hold the piles open at one moment, so past six players the extra
slots would just shrink the cards. A full board is transient (the next pile to
finish frees a space), and a genuine deadlock is what stuck detection handles.
Two players get 8 spaces, four get 16, six or more get 24; the layout stays four
rows and grows sideways.

Cards are drawn at poker-standard 2.5 × 3.5 proportions.

Digital stuck-handling: when every player is stuck, wood piles rotate
automatically and three fruitless rotations end the round. **Being stuck is
detected, not declared** — the "I'm stuck" button stays off behind
`ENABLE_STUCK_BUTTON` in `src/ui/screens/Game.tsx`, and `isStuck` in
`src/game/rules.ts` decides instead. Having no legal move is not enough on its
own: with wood left you can turn the next three over, which is what the old
button got wrong (you could claim stuck holding 25 unflipped cards). Two cases
are conclusive — no wood at all, or having turned the whole pile over since your
last successful play. The claim is withdrawn the instant somebody else's play
frees you, and it covers AI players too, so a bot game can still reach the
rotation.

**Placing an Ace:** drag any card onto the band under the board and it lands in
the nearest space it can legally reach — for an Ace, simply the closest free one,
so you never have to aim at a particular slot mid-race.

**Tableau layout** is Blitz on the left, post piles in the middle, wood on the
right. Wood is the pile a player touches most — every flip of three is another
tap — so it sits under the right thumb. The opponent strip mirrors the same order
so a glance across the table reads the same way.

Tied at the target? The round simply continues to another round until someone
stands alone on top.
