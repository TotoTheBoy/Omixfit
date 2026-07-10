// ---------------------------------------------------------------------------
// Firebase Authentication wiring (email + password).
//
// This is the ONLY module that imports the firebase SDK. The domain store
// (store.ts) stays firebase-free so the booking-engine smoke test keeps
// bundling for node. Config comes from VITE_FIREBASE_* env vars (see
// .env.example) - the web config is not secret, but env-injecting it keeps the
// repo host-agnostic and lets the Pages build use repo variables.
// ---------------------------------------------------------------------------

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
  type User as FbUser,
} from "firebase/auth";
import { firebaseConfig, firebaseConfigured } from "./firebaseConfig";

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
if (firebaseConfigured) {
  app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
}

/** The Auth instance, or null when no config was provided. */
export const auth = authInstance;

export type { FbUser };

export interface AuthIdentity {
  uid: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
}

function toIdentity(u: FbUser): AuthIdentity {
  return {
    uid: u.uid,
    email: u.email ?? "",
    displayName: u.displayName,
    emailVerified: u.emailVerified,
  };
}

/** Re-fetch the current user from Firebase and report whether the email is now
 *  verified (call after the user clicks the link in their inbox). */
export async function refreshEmailVerified(): Promise<boolean> {
  if (!auth?.currentUser) return false;
  await auth.currentUser.reload();
  return auth.currentUser.emailVerified;
}

/** Re-send the "confirm your email" link to the signed-in user. */
export async function resendVerification(): Promise<void> {
  if (auth?.currentUser) await sendEmailVerification(auth.currentUser);
}

/** Subscribe to sign-in/out. Fires once with the current state on attach. */
export function watchAuth(cb: (identity: AuthIdentity | null) => void): () => void {
  if (!auth) {
    // No config → behave as permanently signed out, but still "ready".
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (u) => cb(u ? toIdentity(u) : null));
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!auth) throw new Error("auth/not-configured");
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<void> {
  if (!auth) throw new Error("auth/not-configured");
  const display = name.trim();
  // Stash the chosen name: the auth listener (which creates the Firestore user)
  // can fire before updateProfile lands, so resolveAuthUser reads this to avoid
  // falling back to the email prefix.
  if (display) try { sessionStorage.setItem("omix:signupName", display); } catch { /**/ }
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (display) await updateProfile(cred.user, { displayName: display });
  // Send a "confirm your email" link so the address is verified (free on Spark).
  try { await sendEmailVerification(cred.user); } catch { /* non-fatal */ }
}

export async function signOutUser(): Promise<void> {
  if (auth) await signOut(auth);
}

/** "Forgot password" — email the user a secure reset link (the link in their
 *  inbox is the verification factor). Uses Firebase's built-in reset flow; the
 *  email template can be branded in the Firebase console. */
export async function resetPassword(email: string): Promise<void> {
  if (!auth) throw new Error("auth/not-configured");
  await sendPasswordResetEmail(auth, email.trim());
}

/** Map a firebase auth error code to Hebrew copy (falls back to a generic msg). */
export function authErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  switch (code) {
    case "auth/invalid-email":
      return "כתובת אימייל לא תקינה";
    case "auth/missing-password":
      return "יש להזין סיסמה";
    case "auth/weak-password":
      return "הסיסמה חייבת להכיל לפחות 6 תווים";
    case "auth/email-already-in-use":
      return "כתובת האימייל כבר רשומה - נסה/י להתחבר";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "אימייל או סיסמה שגויים";
    case "auth/too-many-requests":
      return "יותר מדי ניסיונות - נסה/י שוב מאוחר יותר";
    case "auth/network-request-failed":
      return "בעיית רשת - בדוק/י את החיבור";
    case "auth/not-configured":
      return "התחברות אינה מוגדרת (חסר Firebase config)";
    default:
      return "ההתחברות נכשלה - נסה/י שוב";
  }
}
