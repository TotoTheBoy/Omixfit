// ---------------------------------------------------------------------------
// SDK-free Firebase config. Kept separate from firebase.ts (which imports the
// heavy firebase SDK) so modules can check whether auth is configured without
// pulling the SDK into the initial bundle. The SDK itself is code-split and
// loaded on demand (see App.tsx / Login.tsx dynamic imports).
// ---------------------------------------------------------------------------

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** True once a real project config is present — guards against a blank deploy. */
export const firebaseConfigured =
  !!firebaseConfig.apiKey && !!firebaseConfig.authDomain;
