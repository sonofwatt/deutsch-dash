// Firebase web-app config (Firebase console -> Project settings -> Your apps).
// Committing it is safe by design: these are public client identifiers shipped in
// every page load, and access control lives in database.rules.json, not in secrecy.
export const firebaseConfig = {
  apiKey: 'AIzaSyAnT1rBEZP9jvaES_XJ9NQ-yDLboiHvz9U',
  authDomain: 'holland-hustle.firebaseapp.com',
  databaseURL: 'https://holland-hustle-default-rtdb.firebaseio.com',
  projectId: 'holland-hustle',
  appId: '1:173331571710:web:b21ff7b984c8c1e18d16af',
};

export const isConfigured = firebaseConfig.apiKey !== 'PASTE_ME';
