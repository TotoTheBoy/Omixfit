// ---------------------------------------------------------------------------
// In-memory mirror of the Firestore data + a useSyncExternalStore hook.
//
// Firestore is the source of truth; `firestore.ts` streams snapshots in via
// onSnapshot and calls hydrate(). Components read synchronously through
// useStore(selector) against this mirror (so reads stay sync and cheap), and
// call the async mutations below — thin wrappers that delegate to the
// code-split Firestore backend (dynamic import keeps it off the critical bundle
// AND keeps this module free of the firebase SDK, so the node smoke test, which
// imports the pure engine, never pulls firebase in).
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from "react";
import type { AppData, ClassSession, ClassType, User } from "./types";
import * as engine from "./engine";

const EMPTY: AppData = {
  users: [],
  classTypes: [],
  sessions: [],
  bookings: [],
  locations: [],
  facility: {
    name: "אומיקספיט",
    bookingWindowDays: 14,
    bookingClosesBeforeMin: 30,
    cancelCutoffHours: 3,
    maxActiveBookings: 6,
  },
  audit: [],
  currentUserId: null,
  version: 6,
};

let state: AppData = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getState(): AppData {
  return state;
}

export function useStore<T>(selector: (s: AppData) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

/** Merge a slice of freshly-streamed Firestore data into the mirror. */
export function hydrate(partial: Partial<AppData>): void {
  state = { ...state, ...partial };
  emit();
}

export function setCurrentUser(userId: string): void {
  state = { ...state, currentUserId: userId };
  emit();
}

/** Sign out — clears the session so the app shows the login screen. */
export function logout(): void {
  state = { ...state, currentUserId: null };
  emit();
}

// ---- selectors (engine, bound to the live mirror) ---------------------------
export const sessionStartDate = engine.sessionStartDate;
export const confirmedCount = (sessionId: string, s: AppData = state) =>
  engine.confirmedCount(sessionId, s);
export const userBooking = (sessionId: string, userId: string, s: AppData = state) =>
  engine.userBooking(sessionId, userId, s);
export const waitlistCount = (sessionId: string, s: AppData = state) =>
  engine.waitlistCount(sessionId, s);
export const waitlistPosition = (sessionId: string, userId: string, s: AppData = state) =>
  engine.waitlistPosition(sessionId, userId, s);
export const classTypeOf = (session: ClassSession, s: AppData = state) =>
  engine.classTypeOf(session, s);
export const bookability = (session: ClassSession, userId: string, s: AppData = state) =>
  engine.bookability(session, userId, s);
export const actionFor = (session: ClassSession, userId: string, s: AppData = state) =>
  engine.actionFor(session, userId, s);
export const memberStats = (userId: string, s: AppData = state) =>
  engine.memberStats(userId, s);
export type { BookOutcome, ActionState, WaitlistOutcome } from "./engine";

export function newTypeId(): string {
  return engine.genId("ct");
}

// ---- mutations (delegated to the code-split Firestore backend) ---------------
const backend = () => import("./firestore");

export const book = (sessionId: string, userId: string) =>
  backend().then((b) => b.book(sessionId, userId));
export const cancelBooking = (sessionId: string, userId: string) =>
  backend().then((b) => b.cancelBooking(sessionId, userId));
export const joinWaitlist = (sessionId: string, userId: string) =>
  backend().then((b) => b.joinWaitlist(sessionId, userId));
export const upsertSession = (session: ClassSession) =>
  backend().then((b) => b.upsertSession(session));
export const createSessions = (
  base: Omit<ClassSession, "id" | "date"> & { date: string },
  recurrenceWeeks: number,
) => backend().then((b) => b.createSessions(base, recurrenceWeeks));
export const cancelSession = (sessionId: string) =>
  backend().then((b) => b.cancelSession(sessionId));
export const deleteSession = (sessionId: string) =>
  backend().then((b) => b.deleteSession(sessionId));
export const setAttendance = (bookingId: string, attended: boolean) =>
  backend().then((b) => b.setAttendance(bookingId, attended));
export const updateUser = (userId: string, patch: Partial<User>) =>
  backend().then((b) => b.updateUser(userId, patch));
export const upsertClassType = (ct: ClassType) =>
  backend().then((b) => b.upsertClassType(ct));
export const deleteClassType = (typeId: string) =>
  backend().then((b) => b.deleteClassType(typeId));

/** Start the Firestore listeners + one-time seed (called once from App). */
export const initData = () => backend().then((b) => b.initFirestore());

/** Reconcile a signed-in Firebase identity to a Firestore user, then set it. */
export const onAuthIdentity = (
  uid: string,
  email: string,
  displayName: string | null,
) => backend().then((b) => b.resolveAuthUser(uid, email, displayName));
