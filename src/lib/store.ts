// ---------------------------------------------------------------------------
// Tiny external store with localStorage persistence + a useSyncExternalStore
// hook. Holds all app state and the booking mutations. Capacity enforcement is
// done atomically here (plan.md §4.4): we re-count confirmed bookings inside
// the mutation and reject if full — never a stale read-then-write.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from "react";
import type {
  AppData,
  Booking,
  ClassSession,
  ClassType,
  User,
} from "./types";
import { buildSeed } from "./seed";
import { fromKey } from "./date";

const STORAGE_KEY = "omixfit:v1";

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      // Bump CURRENT_VERSION (here + seed) whenever the data shape changes so
      // returning users re-seed instead of rendering against a stale schema.
      if (parsed && parsed.version === 2) return parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return buildSeed();
}

let state: AppData = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full / private mode — keep working in-memory */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function set(next: AppData) {
  state = next;
  emit();
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

// ---- derived selectors -------------------------------------------------------

export function confirmedCount(sessionId: string, s: AppData = state): number {
  let n = 0;
  for (const b of s.bookings) {
    if (b.sessionId === sessionId && b.state === "confirmed") n++;
  }
  return n;
}

export function userBooking(
  sessionId: string,
  userId: string,
  s: AppData = state,
): Booking | undefined {
  return s.bookings.find(
    (b) =>
      b.sessionId === sessionId &&
      b.userId === userId &&
      (b.state === "confirmed" || b.state === "waitlisted"),
  );
}

export function classTypeOf(
  session: ClassSession,
  s: AppData = state,
): ClassType {
  return s.classTypes.find((c) => c.id === session.classTypeId)!;
}

export function sessionStartDate(session: ClassSession): Date {
  const d = fromKey(session.date);
  d.setMinutes(session.startMin);
  return d;
}

export type BookOutcome =
  | "ok"
  | "full"
  | "already"
  | "closed"
  | "membership"
  | "limit"
  | "cancelled";

/** Can this user currently book this session, and why not. */
export function bookability(
  session: ClassSession,
  userId: string,
  s: AppData = state,
): { canBook: boolean; reason: Exclude<BookOutcome, "ok" | "already"> | null; alreadyBooked: boolean } {
  const user = s.users.find((u) => u.id === userId)!;
  const already = !!userBooking(session.id, userId, s);
  if (session.cancelled) return { canBook: false, reason: "cancelled", alreadyBooked: already };
  if (already) return { canBook: false, reason: null, alreadyBooked: true };

  const start = sessionStartDate(session).getTime();
  const minsToStart = (start - Date.now()) / 60000;
  if (minsToStart < s.facility.bookingClosesBeforeMin)
    return { canBook: false, reason: "closed", alreadyBooked: false };

  if (!user.membershipActive)
    return { canBook: false, reason: "membership", alreadyBooked: false };

  const active = s.bookings.filter(
    (b) => b.userId === userId && b.state === "confirmed" &&
      sessionStartDate(s.sessions.find((x) => x.id === b.sessionId)!).getTime() > Date.now(),
  ).length;
  if (active >= s.facility.maxActiveBookings)
    return { canBook: false, reason: "limit", alreadyBooked: false };

  if (confirmedCount(session.id, s) >= session.capacity)
    return { canBook: false, reason: "full", alreadyBooked: false };

  return { canBook: true, reason: null, alreadyBooked: false };
}

// ---- mutations ---------------------------------------------------------------

let idSeq = Date.now();
function nextId(prefix: string): string {
  return `${prefix}-${(idSeq++).toString(36)}`;
}

/** Atomic-ish booking: re-validate against the freshest state, then commit. */
export function book(sessionId: string, userId: string): BookOutcome {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return "full";
  const check = bookability(session, userId);
  if (check.alreadyBooked) return "already";
  if (!check.canBook) return (check.reason ?? "full") as BookOutcome;

  const booking: Booking = {
    id: nextId("b"),
    sessionId,
    userId,
    state: "confirmed",
    createdAt: Date.now(),
  };
  set({ ...state, bookings: [...state.bookings, booking] });
  return "ok";
}

export function cancelBooking(sessionId: string, userId: string): void {
  const next = state.bookings.map((b) =>
    b.sessionId === sessionId &&
    b.userId === userId &&
    (b.state === "confirmed" || b.state === "waitlisted")
      ? { ...b, state: "cancelled" as const }
      : b,
  );
  set({ ...state, bookings: next });
}

export function setCurrentUser(userId: string): void {
  set({ ...state, currentUserId: userId });
}

// ---- manager mutations -------------------------------------------------------

export function upsertSession(session: ClassSession): void {
  const exists = state.sessions.some((s) => s.id === session.id);
  const sessions = exists
    ? state.sessions.map((s) => (s.id === session.id ? session : s))
    : [...state.sessions, session];
  set({ ...state, sessions });
}

export function createSessions(
  base: Omit<ClassSession, "id" | "date"> & { date: string },
  recurrenceWeeks: number,
): void {
  const seriesId = recurrenceWeeks > 1 ? nextId("series") : undefined;
  const newSessions: ClassSession[] = [];
  for (let w = 0; w < Math.max(1, recurrenceWeeks); w++) {
    const d = fromKey(base.date);
    d.setDate(d.getDate() + w * 7);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    newSessions.push({ ...base, id: nextId("s"), date, seriesId });
  }
  set({ ...state, sessions: [...state.sessions, ...newSessions] });
}

export function cancelSession(sessionId: string): void {
  const sessions = state.sessions.map((s) =>
    s.id === sessionId ? { ...s, cancelled: true } : s,
  );
  set({ ...state, sessions });
}

export function deleteSession(sessionId: string): void {
  set({
    ...state,
    sessions: state.sessions.filter((s) => s.id !== sessionId),
    bookings: state.bookings.filter((b) => b.sessionId !== sessionId),
  });
}

export function setAttendance(
  bookingId: string,
  attended: boolean,
): void {
  const bookings = state.bookings.map((b) =>
    b.id === bookingId
      ? { ...b, state: attended ? ("attended" as const) : ("no_show" as const) }
      : b,
  );
  set({ ...state, bookings });
}

export function updateUser(userId: string, patch: Partial<User>): void {
  set({
    ...state,
    users: state.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)),
  });
}

export function upsertClassType(ct: ClassType): void {
  const exists = state.classTypes.some((c) => c.id === ct.id);
  const classTypes = exists
    ? state.classTypes.map((c) => (c.id === ct.id ? ct : c))
    : [...state.classTypes, ct];
  set({ ...state, classTypes });
}

export function deleteClassType(typeId: string): boolean {
  // Refuse if any session references it (keeps the schedule consistent).
  if (state.sessions.some((s) => s.classTypeId === typeId)) return false;
  set({ ...state, classTypes: state.classTypes.filter((c) => c.id !== typeId) });
  return true;
}

export function newTypeId(): string {
  return nextId("ct");
}

/** Personal stats for the profile screen. */
export function memberStats(userId: string, s: AppData = state) {
  const mine = s.bookings.filter((b) => b.userId === userId);
  const attended = mine.filter((b) => b.state === "attended").length;
  const upcoming = mine.filter(
    (b) =>
      b.state === "confirmed" &&
      sessionStartDate(s.sessions.find((x) => x.id === b.sessionId)!).getTime() >
        Date.now(),
  ).length;
  // favorite category by booking count
  const tally = new Map<string, number>();
  for (const b of mine) {
    const sess = s.sessions.find((x) => x.id === b.sessionId);
    if (!sess) continue;
    const cat = s.classTypes.find((c) => c.id === sess.classTypeId)!.category;
    tally.set(cat, (tally.get(cat) ?? 0) + 1);
  }
  let favorite: string | null = null;
  let max = 0;
  for (const [cat, n] of tally) if (n > max) ((max = n), (favorite = cat));
  return { attended, upcoming, total: mine.length, favorite };
}

export function resetData(): void {
  set(buildSeed());
}
