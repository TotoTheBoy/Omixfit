// ---------------------------------------------------------------------------
// Tiny external store with localStorage persistence + a useSyncExternalStore
// hook. Holds all app state and the booking mutations. Capacity enforcement is
// done atomically here (plan.md §4.4): we re-count confirmed bookings inside
// the mutation and reject if full — never a stale read-then-write.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from "react";
import type {
  AppData,
  AuditAction,
  AuditEntry,
  Booking,
  ClassSession,
  ClassType,
  User,
} from "./types";
import { buildSeed } from "./seed";
import { fmtTime, fromKey } from "./date";

const STORAGE_KEY = "omixfit:v1";

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      // Bump CURRENT_VERSION (here + seed) whenever the data shape changes so
      // returning users re-seed instead of rendering against a stale schema.
      if (parsed && parsed.version === 4) return parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  // Persist the seed on first load so state is stable from the very first visit
  // (and inspectable in localStorage immediately, not only after a mutation).
  const seed = buildSeed();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  } catch {
    /* private mode — keep working in-memory */
  }
  return seed;
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

export function waitlistCount(sessionId: string, s: AppData = state): number {
  let n = 0;
  for (const b of s.bookings)
    if (b.sessionId === sessionId && b.state === "waitlisted") n++;
  return n;
}

/** 1-based position of a user in a session's waitlist (FIFO), or 0. */
export function waitlistPosition(
  sessionId: string,
  userId: string,
  s: AppData = state,
): number {
  const wl = s.bookings
    .filter((b) => b.sessionId === sessionId && b.state === "waitlisted")
    .sort((a, b) => a.createdAt - b.createdAt);
  const idx = wl.findIndex((b) => b.userId === userId);
  return idx < 0 ? 0 : idx + 1;
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

// What action a member can take on a session — drives the booking UI.
export type ActionState =
  | { kind: "book" }
  | { kind: "booked" }
  | { kind: "waitlist"; ahead: number }
  | { kind: "waitlisted"; pos: number }
  | { kind: "closed" }
  | { kind: "cancelled" }
  | { kind: "blocked"; reason: "membership" | "limit" };

export function actionFor(
  session: ClassSession,
  userId: string,
  s: AppData = state,
): ActionState {
  if (session.cancelled) return { kind: "cancelled" };
  const mine = userBooking(session.id, userId, s);
  if (mine?.state === "confirmed") return { kind: "booked" };
  if (mine?.state === "waitlisted")
    return { kind: "waitlisted", pos: waitlistPosition(session.id, userId, s) };

  const minsToStart = (sessionStartDate(session).getTime() - Date.now()) / 60000;
  if (minsToStart < s.facility.bookingClosesBeforeMin) return { kind: "closed" };

  const user = s.users.find((u) => u.id === userId)!;
  if (!user.membershipActive) return { kind: "blocked", reason: "membership" };

  // Full → offer the waitlist (joining doesn't consume a confirmed slot).
  if (confirmedCount(session.id, s) >= session.capacity)
    return { kind: "waitlist", ahead: waitlistCount(session.id, s) };

  const active = s.bookings.filter(
    (b) =>
      b.userId === userId &&
      b.state === "confirmed" &&
      sessionStartDate(s.sessions.find((x) => x.id === b.sessionId)!).getTime() > Date.now(),
  ).length;
  if (active >= s.facility.maxActiveBookings) return { kind: "blocked", reason: "limit" };

  return { kind: "book" };
}

/** Promote earliest-waitlisted members into any open confirmed slots (Q4). */
function fillFromWaitlist(
  bookings: Booking[],
  session: ClassSession,
): { bookings: Booking[]; promoted: string[] } {
  if (session.cancelled) return { bookings, promoted: [] };
  const confirmed = bookings.filter(
    (b) => b.sessionId === session.id && b.state === "confirmed",
  ).length;
  const slots = session.capacity - confirmed;
  if (slots <= 0) return { bookings, promoted: [] };
  const wl = bookings
    .filter((b) => b.sessionId === session.id && b.state === "waitlisted")
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, slots);
  if (!wl.length) return { bookings, promoted: [] };
  const ids = new Set(wl.map((b) => b.id));
  return {
    bookings: bookings.map((b) => (ids.has(b.id) ? { ...b, state: "confirmed" as const } : b)),
    promoted: wl.map((b) => b.userId),
  };
}

// ---- mutations ---------------------------------------------------------------

let idSeq = Date.now();
function nextId(prefix: string): string {
  return `${prefix}-${(idSeq++).toString(36)}`;
}

// ---- audit log (plan.md §4.6) ------------------------------------------------
function auditEntry(action: AuditAction, summary: string): AuditEntry {
  return {
    id: nextId("a"),
    ts: Date.now(),
    actorId: state.currentUserId,
    action,
    summary,
  };
}

function sessionLabel(s: ClassSession): string {
  const type = state.classTypes.find((c) => c.id === s.classTypeId);
  return `${type?.name ?? "שיעור"} · ${s.date} ${fmtTime(s.startMin)}`;
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

/** Cancel a booking; if a confirmed spot opened, auto-promote the waitlist. */
export function cancelBooking(
  sessionId: string,
  userId: string,
): { promotedUserId: string | null } {
  let wasConfirmed = false;
  let next = state.bookings.map((b) => {
    if (
      b.sessionId === sessionId &&
      b.userId === userId &&
      (b.state === "confirmed" || b.state === "waitlisted")
    ) {
      if (b.state === "confirmed") wasConfirmed = true;
      return { ...b, state: "cancelled" as const };
    }
    return b;
  });

  let promotedUserId: string | null = null;
  const session = state.sessions.find((s) => s.id === sessionId);
  if (wasConfirmed && session) {
    const r = fillFromWaitlist(next, session);
    next = r.bookings;
    promotedUserId = r.promoted[0] ?? null;
  }
  set({ ...state, bookings: next });
  return { promotedUserId };
}

export type WaitlistOutcome =
  | "ok"
  | "already"
  | "closed"
  | "membership"
  | "cancelled"
  | "notfull";

export function joinWaitlist(sessionId: string, userId: string): WaitlistOutcome {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return "notfull";
  if (session.cancelled) return "cancelled";
  if (userBooking(sessionId, userId)) return "already";
  const minsToStart = (sessionStartDate(session).getTime() - Date.now()) / 60000;
  if (minsToStart < state.facility.bookingClosesBeforeMin) return "closed";
  const user = state.users.find((u) => u.id === userId)!;
  if (!user.membershipActive) return "membership";
  if (confirmedCount(sessionId) < session.capacity) return "notfull";

  const booking: Booking = {
    id: nextId("b"),
    sessionId,
    userId,
    state: "waitlisted",
    createdAt: Date.now(),
  };
  set({ ...state, bookings: [...state.bookings, booking] });
  return "ok";
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
  // A capacity increase may open slots — promote from the waitlist (Q4).
  const { bookings } = fillFromWaitlist(state.bookings, session);
  const entry = auditEntry(
    exists ? "session_updated" : "session_created",
    sessionLabel(session),
  );
  set({ ...state, sessions, bookings, audit: [entry, ...state.audit] });
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
  const first = newSessions[0];
  const entry = auditEntry(
    "session_created",
    newSessions.length > 1
      ? `${sessionLabel(first)} (+${newSessions.length - 1} בסדרה)`
      : sessionLabel(first),
  );
  set({
    ...state,
    sessions: [...state.sessions, ...newSessions],
    audit: [entry, ...state.audit],
  });
}

export function cancelSession(sessionId: string): void {
  const target = state.sessions.find((s) => s.id === sessionId);
  const sessions = state.sessions.map((s) =>
    s.id === sessionId ? { ...s, cancelled: true } : s,
  );
  const entry = auditEntry(
    "session_cancelled",
    target ? sessionLabel(target) : sessionId,
  );
  set({ ...state, sessions, audit: [entry, ...state.audit] });
}

export function deleteSession(sessionId: string): void {
  const target = state.sessions.find((s) => s.id === sessionId);
  const entry = auditEntry(
    "session_deleted",
    target ? sessionLabel(target) : sessionId,
  );
  set({
    ...state,
    sessions: state.sessions.filter((s) => s.id !== sessionId),
    bookings: state.bookings.filter((b) => b.sessionId !== sessionId),
    audit: [entry, ...state.audit],
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
  const before = state.users.find((u) => u.id === userId);
  const users = state.users.map((u) => (u.id === userId ? { ...u, ...patch } : u));
  // Only role / membership changes are audit-worthy (not self profile edits).
  let entry: AuditEntry | null = null;
  if (before && patch.role && patch.role !== before.role) {
    entry = auditEntry("role_changed", `${before.name}: ${before.role} ← ${patch.role}`);
  } else if (before && patch.membershipActive !== undefined && patch.membershipActive !== before.membershipActive) {
    entry = auditEntry(
      "membership_changed",
      `${before.name}: מנוי ${patch.membershipActive ? "הופעל" : "הושהה"}`,
    );
  }
  set({ ...state, users, audit: entry ? [entry, ...state.audit] : state.audit });
}

export function upsertClassType(ct: ClassType): void {
  const exists = state.classTypes.some((c) => c.id === ct.id);
  const classTypes = exists
    ? state.classTypes.map((c) => (c.id === ct.id ? ct : c))
    : [...state.classTypes, ct];
  const entry = auditEntry(exists ? "type_updated" : "type_created", ct.name);
  set({ ...state, classTypes, audit: [entry, ...state.audit] });
}

export function deleteClassType(typeId: string): boolean {
  // Refuse if any session references it (keeps the schedule consistent).
  if (state.sessions.some((s) => s.classTypeId === typeId)) return false;
  const target = state.classTypes.find((c) => c.id === typeId);
  const entry = auditEntry("type_deleted", target?.name ?? typeId);
  set({
    ...state,
    classTypes: state.classTypes.filter((c) => c.id !== typeId),
    audit: [entry, ...state.audit],
  });
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
