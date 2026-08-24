// Paste your Firebase web-app config here (Firebase console -> Project settings -> Your apps).
// Committing it is safe by design: security comes from database.rules.json, not secrecy.
export const firebaseConfig = {
  apiKey: 'PASTE_ME',
  authDomain: 'PASTE_ME',
  databaseURL: 'PASTE_ME',
  projectId: 'PASTE_ME',
  appId: 'PASTE_ME',
};

export const isConfigured = firebaseConfig.apiKey !== 'PASTE_ME';
