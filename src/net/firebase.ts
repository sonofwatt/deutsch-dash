/// <reference types="node" />
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, onValue, ref, type Database } from 'firebase/database';
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
export const demoConfig = { apiKey: 'demo', projectId: 'demo-blitz', databaseURL: 'http://127.0.0.1:9000?ns=demo-blitz-default-rtdb' };

// An unconfigured production build must still initialize with SOMETHING routable
// (the demo config) rather than crash on firebaseConfig's placeholder databaseURL -
// the configMissing banner in App.tsx needs to render, and nothing behind it
// actually connects (usingEmulator gates the emulator wiring below).
const app = initializeApp(usingEmulator || configMissing ? demoConfig : firebaseConfig);

export const db: Database = getDatabase(app);
export const auth: Auth = getAuth(app);

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
