# German Spree

A mobile-first multiplayer Dutch Blitz card game for 2-8 players. Create a room,
text the invite link, race to empty your Blitz pile. React + Firebase Realtime
Database, hosted on GitHub Pages.

## Local development (no Firebase account needed)

Prereqs: Node 20+, Java 11+ (for the Firebase emulator).

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

## Deploy to GitHub Pages

1. Push this repo to GitHub (default branch `main`).
2. Repo Settings -> Pages -> Source: **GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site lands at
   `https://<user>.github.io/<repo>/`.

## House rules vs. the physical game

16 fixed center spaces (completed piles clear to free their space) and digital
stuck-handling: when every player is stuck, wood piles rotate automatically;
three fruitless rotations end the round.
