/// <reference types="node" />
import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth,
  signInAnonymously, type Auth,
} from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, goOffline, goOnline, onValue, ref, type Database } from 'firebase/database';
import { firebaseConfig, isConfigured } from './firebaseConfig';

// Local work (dev server, unit tests, test:emu) uses the emulator; a production
// BUILD uses the real project. Dev must never default to the live database - that
// would write real rooms on every `npm run dev` and make unit tests open a socket
// to production. Opt into the real backend from dev with VITE_USE_PROD=1.
// An unconfigured production build must NOT silently point at 127.0.0.1 either -
// it surfaces configMissing so App.tsx can render the "Not configured" banner.
const forceEmu = typeof process !== 'undefined' && process.env?.EMULATOR === '1';
const forceProd = import.meta.env.VITE_USE_PROD === '1';
export const usingEmulator = forceEmu || (import.meta.env.DEV && !forceProd);
export const configMissing = !isConfigured && !usingEmulator;

// Exported so emulator tests can spin up a *second* signed-in identity
// (initializeApp(demoConfig, 'secondary')) against the exact same
// namespace the app itself uses - see rooms.emu.test.ts.
export const demoConfig = { apiKey: 'demo', projectId: 'demo-dash', databaseURL: 'http://127.0.0.1:9000?ns=demo-dash-default-rtdb' };

// An unconfigured production build must still initialize with SOMETHING routable
// (the demo config) rather than crash on firebaseConfig's placeholder databaseURL -
// the configMissing banner in App.tsx needs to render, and nothing behind it
// actually connects (usingEmulator gates the emulator wiring below).
const app = initializeApp(usingEmulator || configMissing ? demoConfig : firebaseConfig);

export const db: Database = getDatabase(app);
// initializeAuth rather than getAuth: getAuth wires in the popup and redirect
// resolver and session persistence, about 10 kB of minified code for sign-in
// flows this app never runs (signInAnonymously is the only auth call). The two
// persistences named here are exactly the ones getAuth would have used FIRST, in
// the same order, so the anonymous identity a phone already holds in IndexedDB is
// still found and nobody loses their seat over the change. Do not drop
// indexedDBLocalPersistence for the same reason.
export const auth: Auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});

if (usingEmulator) {
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

export function ensureSignedIn(): Promise<string> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  return signInAnonymously(auth).then(cred => cred.user.uid);
}

export function watchConnected(cb: (ok: boolean) => void): () => void {
  return onValue(ref(db, '.info/connected'), snap => cb(snap.val() === true));
}

/**
 * Force the SDK to rebuild its connection. Switching to another app on a phone
 * freezes the tab, and it can come back holding a WebSocket the OS killed while
 * it was asleep - the SDK's own retry does not always fire from that state.
 * goOffline/goOnline drops whatever is there and dials again immediately.
 * Only call this when already believed offline: it would otherwise flap presence
 * for everyone else in the room.
 */
export function reconnect(): void {
  try {
    goOffline(db);
    goOnline(db);
  } catch {
    // no backend wired up (unit tests) - nothing to reconnect
  }
}
