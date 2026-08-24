# Holland Hustle

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

1. Push this repo to GitHub (suggested repo name `holland-hustle`; default branch `main`).
2. Repo Settings -> Pages -> Source: **GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site lands at
   `https://<user>.github.io/<repo>/`.

## House rules vs. the physical game

16 fixed center spaces (completed piles clear to free their space) and digital
stuck-handling: when every player is stuck, wood piles rotate automatically;
three fruitless rotations end the round.

Tied at the target? The round simply continues to another round until someone
stands alone on top.
