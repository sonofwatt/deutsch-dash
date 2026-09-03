# Deutsch Dash

A mobile-first multiplayer card game for 2-8 players. Create a room,
text the invite link, race to empty your Dash pile. React + Firebase Realtime
Database, hosted on GitHub Pages.

## Local development (no Firebase account needed)

Prereqs: Node 22 (20.19 or newer also works), and Java 21+ for the Firebase
emulator (firebase-tools refuses to start it on anything older). If you don't have
Java system-wide, drop a portable JRE at `.tools/jre` (gitignored) -
`scripts/with-java.mjs` puts it on PATH for the emulator scripts automatically,
and falls back to system Java when that folder is absent.

    npm install
    npm run emu     # terminal 1: local Firebase emulator
    npm run dev     # terminal 2: Vite dev server

Open http://localhost:5173 in two windows (one incognito) to play yourself.

Tests: `npm test` (pure logic) · `npm run test:emu` (adds emulator integration tests)

**Dev and tests always use the emulator, never the live database** - even with a
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
   `npx firebase login` and `npx firebase deploy --only database`. **Re-run that
   deploy every time `database.rules.json` changes** - tests and local dev use the
   emulator, which reads the file straight off disk, so nothing here will tell you
   the live database is running older rules.
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
by enabling anonymous sign-in - it's what that gate is worth. The rules are
written on that assumption.

What that means in practice:

- **Protected.** Each player's tableau and player record are writable only by
  that player (or the host, who deals and commits scores). These are bound to
  `auth.uid`, which is exactly why anonymous auth is *better* here than no auth
  at all - without it there'd be no identity to bind those rules to.
- **Enforced server-side.** The 8-player cap, badge uniqueness, and lobby-only
  joining live in `database.rules.json`, not just the client. The cap uses a
  `meta/playerCount` counter written with the `increment(1)` sentinel so the
  server resolves it atomically and concurrent joins can't both slip through.
  (`numChildren()` would be the obvious way to count players, but the RTDB
  emulator's rules engine rejects it at parse time, so it can't be tested locally.)
  One honest limit: the cap holds for the app's own join path. A client that
  writes its own `players/$uid` record directly bypasses the counter; the rule
  that would close that is in `docs/database.rules.proposed.json`, waiting on a
  production probe.
- **Bounded server-side.** Since the audit the rules also say what may be
  stored: a badge id must be a badge, the phase a phase, every number a number
  in range, a card a card owned by the hand it sits in, and the host alone
  writes the scores. Like every rules change it takes effect once deployed.
- **Deliberately open.** Reading a room and writing the shared center piles
  require only `auth != null`. Someone who has a room code can watch or interfere
  with that game. Codes are 6 characters from a 32-letter alphabet (~1 billion
  combinations), so guessing a specific live room is impractical.

**The realistic risk is resource abuse, not data theft.** A script could create
large numbers of rooms or accumulate anonymous accounts. What's actually stored is
player-chosen display names and card positions - no emails, no payment details.
On the free Spark plan there is no billing exposure: exhausting quota stops the
database rather than generating a charge. That changes if you upgrade to Blaze.

**Mitigations, in order of value:**

1. Enable automatic clean-up of anonymous accounts (setup step 7). It deletes
   anonymous accounts older than 30 days, and with it enabled anonymous auth stops
   counting toward usage limits and billing quotas.
2. Stay on Spark unless you have a reason not to - it caps the blast radius at
   "service degrades."
3. If abuse ever becomes real, add [App Check](https://firebase.google.com/docs/app-check),
   which attests that requests come from the genuine web app. Overkill for a game
   you text to friends.

**What the client trusts.** Every field under a room was written by some player's
client, so the app reads a room defensively: a badge it does not know is drawn
grey rather than taking the screen down, a stack entry that is not a card is not
in the pile, and the board and post counts are held to what a real deal can
produce before anything allocates on them. The rules bound the same things at
the door (see above), so a hostile write is refused and, for the ones already
stored, drawn harmlessly.

**No third parties.** The page talks to Firebase and nothing else. The Outfit
font is served from this site (`public/fonts`, SIL Open Font License) rather than
from Google, so loading the game discloses a player's address to nobody but the
game's own database.

**Do not** apply the common advice to reject anonymous users in rules
(`sign_in_provider != 'anonymous'`). Every player here is anonymous by design;
that rule would lock out the entire game.

## Deploy to GitHub Pages

1. Push this repo to GitHub (repo name `deutsch-dash`; default branch `main`).
   The Firebase project keeps its original id `holland-hustle` - project ids are
   immutable, and it is never shown to players. The Pages base path is derived
   from the repo name by the workflow, so renaming the repo is all it takes to
   move the site; no config change here.
2. Repo Settings -> Pages -> Source: **GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site lands at
   `https://<user>.github.io/<repo>/`.

## Theme

The board follows your phone: light or dark, switching by itself when the device
does. The **◐ button in the top-right corner** overrides that for this phone only
- tap it to cycle *follow the phone → light → dark*. It is a per-device setting
like the wood-pile side, so two people at one table can disagree about it
harmlessly.

## Sitting out

The **‖ button** in the top corner of the board takes you out of the round you are
in, right now - press it twice, because it stops you being scored for that round.
Nobody waits on you and the round can finish without you. There is a plainer
**Sit out the next rounds** button in the lobby for the same thing before a round
starts.

**Your hand is kept, so you can come straight back.** Tap **I'm back - rejoin this
round** and you pick up exactly where you left off. If the round was dealt while
you were out you have no hand to return to, so you come back in the next one -
the button says which case you are in.

A round you sat out moves your score not at all, in either direction: no penalty
for the Dash pile you left, no credit for what you had already played. Cards you
had played to the middle stay there - other people are building on them.

## Host options

Four controls in the lobby, all set by the host and all applying to the whole
room rather than to one device - everybody should be playing the same game.

**Play to** 25, 50, 75 or 100 points.

**Helper hints** (off by default). One switch, two nudges - room-wide rather than
per-device on purpose, because a hint is a real advantage and the bots were tuned
against a human playing without one.

*When you stall:* after five seconds of touching nothing, the space where your
best move would land pulses twice in violet and fades. It marks the
*destination*, never the card: you still have to work out which of your cards
fits and get it there. It returns every ten seconds for as long as you go on not
playing, and any tap restarts the clock.

*When the board moves:* if somebody else plays a card and you are holding one
that fits on top of it, that space rings once in the colour of the card that just
landed. On a board of up to 32 squares a card arriving is easy to miss, and this
is about the change - it never marks a space that did not just move, and never
one you put a card on yourself.

Two silences are deliberate. A move from one post pile to another has no square
on the board to point at, so nothing flashes for it - which early in a round,
before anyone has an Ace down, can mean no hint at all. And a player who is
genuinely stuck has no move to be shown, so the amber "no moves left" note in the
drop zone speaks for them instead.

**White cards in dark mode** (off by default). Card faces sit on a white ground
whatever theme each player is in, while the board around them stays dark. It does
nothing for anyone already playing in a light theme. A room option rather than a
per-device one because it changes how the cards read, and two players describing
the same board to each other should be looking at the same thing.

**Orderly grid** (off by default). Every center space belongs to one colour for
the whole round, so the board reads as blocks of colour rather than a jumble, and
an Ace can only start a pile in its own colour's block. The constraint is enforced
by the same center transaction that settles every other play, so a client that
disagrees cannot slip a card in. The columns follow the suits: four columns up to
sixteen spaces, eight above that, paired so each colour owns two adjacent ones.

It does not narrow the game as much as it looks like it should. Because the board
is 4 × players spaces and every player holds one Ace per colour, each colour has
exactly as many spaces as there are Aces of it - so an Ace always has somewhere to
go. (That is only true because the space cap was raised to 32; see the house rules
below.)

## AI players

The host can add AI players in the lobby at Easy, Medium or Hard. Difficulty is
mostly hands, not brains: every level only ever makes legal moves, and the levels
differ in how fast they act (`BOT_PROFILES` in `src/game/bot.ts`), how often they
take a worse legal move than the best one available, how often they fumble a turn
entirely, and how often they turn wood over instead of noticing the play in front
of them. Effective rate works out at roughly one action every 4.9s / 2.3s / 1.1s.
All three were tuned down after the first game against them - a bot punches above
its settings because it never plays illegally and never loses track of the board,
so speed and attention are the only honest handicaps. Move quality is ranked
the way the game actually rewards - anything that takes a card off the Dash pile,
or empties a post so the Dash pile refills it, beats an equivalent wood play.

Bots have no client and no auth identity of their own: **the host plays their
hands**, and if the host changes mid-game the new host picks them up. They are
never handed the host role themselves. Their badge is claimed under the host's
uid, which is what stops a human taking the same one without needing a rules
change. Bots do not count toward `meta/playerCount` (the server-side cap on human
joins, which can never decrease); the eight-seat total is held on the client.

## House rules vs. the physical game

A pile that reaches 1..10 is turned face down and **clears its space**, then
appears on one of the two rails flanking the board - so the finished count and
the suits that have gone stay readable instead of the cards simply vanishing. At
seven and eight players the rails leave the board and hang over the edges of the
screen with about a third of each chip showing: by then the grid is eight columns
wide, and the width the rails were holding is worth more to the cards.

Board size is **4 × players center spaces**. Four per player is an exact figure
rather than a rounded one: only an Ace opens a space, and each player holds
exactly one Ace per suit, so it is one space per Ace in the game - which is what
guarantees an Ace always has somewhere to go. If every space is occupied, every
Ace is already down and nobody can be holding one. Two players get 8, four get 16,
eight get 32; the layout stays four rows and grows sideways, with the slots
shrinking to fit.

It used to be capped at 24 for legibility, which quietly broke that guarantee at
seven and eight players. An ordinary board survives the shortfall - a full board
is transient, and a real deadlock is what stuck detection handles - but the
orderly grid splits its spaces between four colours and cannot lend one colour's
space to another, so the whole shortfall lands on a single colour and starves it.
The cap is now 32, which is 4 × the eight-player maximum, so it no longer binds.

Cards are drawn at poker-standard 2.5 × 3.5 proportions.

Digital stuck-handling: when every player is stuck, wood piles rotate
automatically and three fruitless rotations end the round. **Being stuck is
detected, not declared** - the "I'm stuck" button stays off behind
`ENABLE_STUCK_BUTTON` in `src/ui/screens/Game.tsx`, and `isStuck` in
`src/game/rules.ts` decides instead. Having no legal move is not enough on its
own: with wood left you can turn the next three over, which is what the old
button got wrong (you could claim stuck holding 25 unflipped cards). Two cases
are conclusive - no wood at all, or having turned the whole pile over since your
last successful play. The claim is withdrawn the instant somebody else's play
frees you, and it covers AI players too, so a bot game can still reach the
rotation.

**Placing an Ace:** drag any card onto the band under the board and it lands in
the nearest space it can legally reach - for an Ace, simply the closest free one,
so you never have to aim at a particular slot mid-race.

**Tableau layout** is Dash on the left, post piles in the middle, wood on the
right. Wood is the pile a player touches most - every flip of three is another
tap - so it sits under the right thumb. The opponent strip mirrors the same order
so a glance across the table reads the same way.

Tied at the target? The round simply continues to another round until someone
stands alone on top.
