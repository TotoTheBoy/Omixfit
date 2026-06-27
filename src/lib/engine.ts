// ---------------------------------------------------------------------------
// Pure booking engine — no React, no Firebase, no persistence. Just the domain
// rules (plan.md §4.3/§4.4) as functions over an AppData snapshot, so they're
// trivially unit-testable (test/smoke.ts) and reusable by both the in-memory
// store selectors and the Firestore backend. Everything here is side-effect
// free except the local id counter used by the apply* reference transforms.
// ---------------------------------------------------------------------------

import type { AppData, Booking, ClassSession, ClassType } from "./types";
import { fromKey } from "./date";

export function sessionStartDate(session: ClassSession): Date {
  const d = fromKey(session.date);
  d.setMinutes(session.startMin);
  return d;
}

export function confirmedCount(sessionId: string, s: AppData): number {
  let n = 0;
  for (const b of s.bookings)
    if (b.sessionId === sessionId && b.state === "confirmed") n++;
  return n;
}

export function userBooking(
  sessionId: string,
  userId: string,
  s: AppData,
): Booking | undefined {
  return s.bookings.find(
    (b) =>
      b.sessionId === sessionId &&
      b.userId === userId &&
      (b.state === "confirmed" || b.state === "waitlisted"),
  );
}

export function waitlistCount(sessionId: string, s: AppData): number {
  let n = 0;
  for (const b of s.bookings)
    if (b.sessionId === sessionId && b.state === "waitlisted") n++;
  return n;
}

/** 1-based position of a user in a session's waitlist (FIFO), or 0. */
export function waitlistPosition(
  sessionId: string,
  userId: string,
  s: AppData,
): number {
  const wl = s.bookings
    .filter((b) => b.sessionId === sessionId && b.state === "waitlisted")
    .sort((a, b) => a.createdAt - b.createdAt);
  const idx = wl.findIndex((b) => b.userId === userId);
  return idx < 0 ? 0 : idx + 1;
}

export function classTypeOf(session: ClassSession, s: AppData): ClassType {
  return s.classTypes.find((c) => c.id === session.classTypeId)!;
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
  s: AppData,
): {
  canBook: boolean;
  reason: Exclude<BookOutcome, "ok" | "already"> | null;
  alreadyBooked: boolean;
} {
  const user = s.users.find((u) => u.id === userId)!;
  const already = !!userBooking(session.id, userId, s);
  if (session.cancelled)
    return { canBook: false, reason: "cancelled", alreadyBooked: already };
  if (already) return { canBook: false, reason: null, alreadyBooked: true };

  const start = sessionStartDate(session).getTime();
  const minsToStart = (start - Date.now()) / 60000;
  if (minsToStart < s.facility.bookingClosesBeforeMin)
    return { canBook: false, reason: "closed", alreadyBooked: false };

  if (!user.membershipActive)
    return { canBook: false, reason: "membership", alreadyBooked: false };

  const active = activeBookingCount(userId, s);
  if (active >= s.facility.maxActiveBookings)
    return { canBook: false, reason: "limit", alreadyBooked: false };

  if (confirmedCount(session.id, s) >= session.capacity)
    return { canBook: false, reason: "full", alreadyBooked: false };

  return { canBook: true, reason: null, alreadyBooked: false };
}

function activeBookingCount(userId: string, s: AppData): number {
  return s.bookings.filter(
    (b) =>
      b.userId === userId &&
      b.state === "confirmed" &&
      sessionStartDate(s.sessions.find((x) => x.id === b.sessionId)!).getTime() >
        Date.now(),
  ).length;
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
  s: AppData,
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

  if (activeBookingCount(userId, s) >= s.facility.maxActiveBookings)
    return { kind: "blocked", reason: "limit" };

  return { kind: "book" };
}

/** Promote earliest-waitlisted members into any open confirmed slots (Q4). */
export function fillFromWaitlist(
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
    bookings: bookings.map((b) =>
      ids.has(b.id) ? { ...b, state: "confirmed" as const } : b,
    ),
    promoted: wl.map((b) => b.userId),
  };
}

export type WaitlistOutcome =
  | "ok"
  | "already"
  | "closed"
  | "membership"
  | "cancelled"
  | "notfull";

/** Personal stats for the profile screen. */
export function memberStats(userId: string, s: AppData) {
  const mine = s.bookings.filter((b) => b.userId === userId);
  const attended = mine.filter((b) => b.state === "attended").length;
  const upcoming = mine.filter(
    (b) =>
      b.state === "confirmed" &&
      sessionStartDate(s.sessions.find((x) => x.id === b.sessionId)!).getTime() >
        Date.now(),
  ).length;
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

// ---- reference transforms (pure) --------------------------------------------
// Canonical booking algorithm over an AppData snapshot. The Firestore backend
// enforces capacity atomically with a per-session counter (a query can't run
// inside a transaction), but these are the source-of-truth rules and what the
// smoke test asserts.

let idSeq = Date.now();
export function genId(prefix: string): string {
  return `${prefix}-${(idSeq++).toString(36)}`;
}

export function applyBook(
  s: AppData,
  sessionId: string,
  userId: string,
): { bookings: Booking[]; outcome: BookOutcome } {
  const session = s.sessions.find((x) => x.id === sessionId);
  if (!session) return { bookings: s.bookings, outcome: "full" };
  const check = bookability(session, userId, s);
  if (check.alreadyBooked) return { bookings: s.bookings, outcome: "already" };
  if (!check.canBook)
    return { bookings: s.bookings, outcome: (check.reason ?? "full") as BookOutcome };
  const booking: Booking = {
    id: genId("b"),
    sessionId,
    userId,
    state: "confirmed",
    createdAt: Date.now(),
  };
  return { bookings: [...s.bookings, booking], outcome: "ok" };
}

export function applyJoinWaitlist(
  s: AppData,
  sessionId: string,
  userId: string,
): { bookings: Booking[]; outcome: WaitlistOutcome } {
  const session = s.sessions.find((x) => x.id === sessionId);
  if (!session) return { bookings: s.bookings, outcome: "notfull" };
  if (session.cancelled) return { bookings: s.bookings, outcome: "cancelled" };
  if (userBooking(sessionId, userId, s))
    return { bookings: s.bookings, outcome: "already" };
  const minsToStart = (sessionStartDate(session).getTime() - Date.now()) / 60000;
  if (minsToStart < s.facility.bookingClosesBeforeMin)
    return { bookings: s.bookings, outcome: "closed" };
  const user = s.users.find((u) => u.id === userId)!;
  if (!user.membershipActive)
    return { bookings: s.bookings, outcome: "membership" };
  if (confirmedCount(sessionId, s) < session.capacity)
    return { bookings: s.bookings, outcome: "notfull" };
  const booking: Booking = {
    id: genId("b"),
    sessionId,
    userId,
    state: "waitlisted",
    createdAt: Date.now(),
  };
  return { bookings: [...s.bookings, booking], outcome: "ok" };
}

export function applyCancel(
  s: AppData,
  sessionId: string,
  userId: string,
): { bookings: Booking[]; promotedUserId: string | null } {
  let wasConfirmed = false;
  let next = s.bookings.map((b) => {
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
  const session = s.sessions.find((x) => x.id === sessionId);
  if (wasConfirmed && session) {
    const r = fillFromWaitlist(next, session);
    next = r.bookings;
    promotedUserId = r.promoted[0] ?? null;
  }
  return { bookings: next, promotedUserId };
}
