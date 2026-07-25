// ---------------------------------------------------------------------------
// SDK-free Firebase config. Kept separate from firebase.ts (which imports the
// heavy firebase SDK) so modules can check whether auth is configured without
// pulling the SDK into the initial bundle. The SDK itself is code-split and
// loaded on demand (see App.tsx / Login.tsx dynamic imports).
//
// The values below are the Firebase **web** config. Per Google's docs these are
// safe to expose / commit (they identify the project; access is enforced by the
// Firestore security rules + Auth, not by hiding the key). They're baked in as
// fallbacks so the app works on any host (Vercel, Firebase Hosting, …) even
// without VITE_FIREBASE_* env vars set - env vars still take precedence.
// ---------------------------------------------------------------------------

const FALLBACK = {
  apiKey: "AIzaSyDtyZu_JV8xHaC9AX58sD0CyOheFosa57Q",
  authDomain: "omixfit-be3ff.firebaseapp.com",
  projectId: "omixfit-be3ff",
  storageBucket: "omixfit-be3ff.firebasestorage.app",
  messagingSenderId: "257613655748",
  appId: "1:257613655748:web:9df250b9dbac34ef08e391",
};

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || FALLBACK.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || FALLBACK.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || FALLBACK.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || FALLBACK.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || FALLBACK.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || FALLBACK.appId,
};

/** True once a real project config is present - guards against a blank deploy. */
export const firebaseConfigured =
  !!firebaseConfig.apiKey && !!firebaseConfig.authDomain;
