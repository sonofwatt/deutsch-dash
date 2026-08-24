/// <reference types="node" />
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, onValue, ref, type Database } from 'firebase/database';
import { firebaseConfig, isConfigured } from './firebaseConfig';

// Emulator only when explicitly forced (npm run test:emu) or when unconfigured in dev.
// A pasted config always wins in dev/test unless EMULATOR=1; an unconfigured
// production build must NOT silently point at 127.0.0.1 - it surfaces configMissing.
const forceEmu = typeof process !== 'undefined' && process.env?.EMULATOR === '1';
export const usingEmulator = forceEmu || (!isConfigured && import.meta.env.DEV);
export const configMissing = !isConfigured && !usingEmulator;

const app = initializeApp(
  usingEmulator
    ? { apiKey: 'demo', projectId: 'demo-blitz', databaseURL: 'http://127.0.0.1:9000?ns=demo-blitz' }
    : firebaseConfig,
);

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
