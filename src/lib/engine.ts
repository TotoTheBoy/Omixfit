// ---------------------------------------------------------------------------
// Pure booking engine - no React, no Firebase, no persistence. Just the domain
// rules (plan.md §4.3/§4.4) as functions over an AppData snapshot, so they're
// trivially unit-testable (test/smoke.ts) and reusable by both the in-memory
// store selectors and the Firestore backend. Everything here is side-effect
// free except the local id counter used by the apply* reference transforms.
// ---------------------------------------------------------------------------

import type { AppData, Booking, ClassSession, ClassType, User } from "./types";
import { fromKey } from "./date";

/** True when a member's PAR-Q health declaration flags any pre-activity risk.
 *  Surfaced to staff on class rosters and the member pipeline so the coach is
 *  aware of a medical condition / injury / limitation before the workout. */
export function hasMedicalFlag(u: Pick<User, "healthForm">): boolean {
  const hf = u.healthForm;
  return !!hf && (["q1", "q2", "q3", "q4", "q5", "q6", "q7"] as const).some((k) => hf[k]);
}

const DAY_MS = 86_400_000;
export const NEW_CLIENT_DAYS = 21;
export const TRIAL_DAYS = 7; // buy a pass within this window or get disconnected

/** A freshly-approved client (needs extra attention) — within NEW_CLIENT_DAYS. */
export function isNewClient(u: Pick<User, "approvedAt">, nowMs = Date.now()): boolean {
  return !!u.approvedAt && nowMs - u.approvedAt < NEW_CLIENT_DAYS * DAY_MS;
}

/** Days left in the trial for a not-yet-passholder (<=0 means it lapsed).
 *  null = not on a trial clock (no approval date, or already bought a pass). */
export function trialDaysLeft(
  u: Pick<User, "approvedAt" | "hasPass">,
  nowMs = Date.now(),
): number | null {
  if (!u.approvedAt || u.hasPass) return null;
  return TRIAL_DAYS - Math.floor((nowMs - u.approvedAt) / DAY_MS);
}

// ---- OMIX loyalty (refactor spec §8) ----------------------------------------
export interface LoyaltyTier {
  id: "pace" | "endurance" | "elite" | "marathoner";
  name: string;
  min: number; // attended classes to reach this tier
}
export const LOYALTY_TIERS: LoyaltyTier[] = [
  { id: "pace", name: "OMIX Pace", min: 0 },
  { id: "endurance", name: "OMIX Endurance", min: 25 },
  { id: "elite", name: "OMIX Elite", min: 75 },
  { id: "marathoner", name: "OMIX Marathoner", min: 150 },
];

/** Current loyalty tier + progress toward the next, from attended count. */
export function loyaltyFor(attended: number) {
  let idx = 0;
  for (let i = 0; i < LOYALTY_TIERS.length; i++) if (attended >= LOYALTY_TIERS[i].min) idx = i;
  const current = LOYALTY_TIERS[idx];
  const next = LOYALTY_TIERS[idx + 1] ?? null;
  const toNext = next ? next.min - attended : 0;
  const span = next ? next.min - current.min : 1;
  const progress = next ? Math.min(1, Math.max(0, (attended - current.min) / span)) : 1;
  return { current, next, toNext, progress, index: idx };
}

/** OMIX Marathoner (150+ attended) may book 1h before general release. */
export function loyaltyEarlyBookingMin(attended: number): number {
  return attended >= 150 ? 60 : 0;
}

function weekStamp(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // back to Sunday (week start)
  return Math.floor(x.getTime() / 86_400_000);
}

/** Consecutive weeks (ending this week) with >= 1 attended class. */
export function weeklyStreak(userId: string, s: AppData, nowMs = Date.now()): number {
  const weeks = new Set<number>();
  for (const b of s.bookings) {
    if (b.userId !== userId || b.state !== "attended") continue;
    const sess = s.sessions.find((x) => x.id === b.sessionId);
    if (sess) weeks.add(weekStamp(sessionStartDate(sess)));
  }
  let streak = 0;
  let w = weekStamp(new Date(nowMs));
  while (weeks.has(w)) { streak++; w--; }
  return streak;
}

/** What Omer is overdue on for a coaching client: weekly call (>7d), a daily
 *  WhatsApp touch (>2d), first meeting not done, and this month's payment. */
export function coachingFlags(u: Pick<User, "coaching">, nowMs = Date.now()) {
  const c = u.coaching;
  const month = new Date(nowMs).toISOString().slice(0, 7);
  return {
    needsFirstMeeting: !c?.firstMeetingDone,
    needsCall: !c?.lastCallAt || nowMs - c.lastCallAt > 7 * DAY_MS,
    needsContact: !c?.lastContactAt || nowMs - c.lastContactAt > 2 * DAY_MS,
    needsPayment: c?.lastPaidMonth !== month,
  };
}

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

// What action a member can take on a session - drives the booking UI.
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

// ---- revenue & client scoring (the trainer's business) ----------------------

/** Total / last-30-days revenue and a breakdown by service kind. */
export function revenueSummary(s: AppData) {
  const monthAgo = Date.now() - 30 * 864e5;
  let total = 0;
  let month = 0;
  const byKind = new Map<string, number>();
  for (const p of s.payments) {
    total += p.amount;
    if (p.date >= monthAgo) month += p.amount;
    byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + p.amount);
  }
  return { total, month, byKind, count: s.payments.length };
}

/**
 * Combined value score per member (0–100): 60% normalized revenue + 40%
 * normalized engagement (sessions attended). Sorted high→low.
 */
export function clientValueScores(s: AppData) {
  const revByUser = new Map<string, number>();
  for (const p of s.payments)
    revByUser.set(p.userId, (revByUser.get(p.userId) ?? 0) + p.amount);
  const attByUser = new Map<string, number>();
  for (const b of s.bookings)
    if (b.state === "attended")
      attByUser.set(b.userId, (attByUser.get(b.userId) ?? 0) + 1);
  const maxRev = Math.max(1, ...revByUser.values());
  const maxAtt = Math.max(1, ...attByUser.values());
  return s.users
    .filter((u) => u.role === "member")
    .map((user) => {
      const revenue = revByUser.get(user.id) ?? 0;
      const attended = attByUser.get(user.id) ?? 0;
      const score = Math.round(
        ((revenue / maxRev) * 0.6 + (attended / maxAtt) * 0.4) * 100,
      );
      return { user, revenue, attended, score };
    })
    .sort((a, b) => b.score - a.score || b.revenue - a.revenue);
}

/**
 * Per-client engagement "traffic light" from attendance recency:
 *   green  = trained in the last 14 days (active/regular)
 *   orange = 15-35 days (slowing down)
 *   red    = 35+ days or never (at risk of churning)
 */
export function clientActivityLight(userId: string, s: AppData): "green" | "orange" | "red" {
  const last = s.bookings
    .filter((b) => b.userId === userId && b.state === "attended")
    .map((b) => {
      const sess = s.sessions.find((x) => x.id === b.sessionId);
      return sess ? sessionStartDate(sess).getTime() : 0;
    })
    .reduce((a, b) => Math.max(a, b), 0);
  if (!last) return "red";
  const days = (Date.now() - last) / 864e5;
  if (days <= 14) return "green";
  if (days <= 35) return "orange";
  return "red";
}

export interface ClientBalance {
  user: User;
  purchased: number; // total package sessions bought
  used: number; // attended sessions (consumed)
  remaining: number; // purchased − used (may go ≤ 0 → needs a top-up)
}

/**
 * Live per-client package balance. Every package sale adds its `units`; every
 * attended session consumes one. Sorted lowest-remaining first so the clients
 * who need to renew surface at the top.
 */
export function clientBalances(s: AppData): ClientBalance[] {
  return s.users
    .filter((u) => u.role === "member")
    .map((u) => {
      const purchased = s.payments
        .filter((p) => p.userId === u.id && p.units)
        .reduce((a, p) => a + (p.units || 0), 0);
      const used = s.bookings.filter((b) => b.userId === u.id && b.state === "attended").length;
      return { user: u, purchased, used, remaining: purchased - used };
    })
    .filter((b) => b.purchased > 0)
    .sort((a, b) => a.remaining - b.remaining);
}

// ---- Admin overview dashboard (#1) -----------------------------------------
// Aggregates ONLY the items that need the admin's attention, each computed live
// from the domain data against a fixed threshold (no stored/mock state).

export interface AdminOverview {
  /** New registrants awaiting approval. */
  pending: User[];
  /** Active members with no attended class in the last month. */
  inactive: { user: User; lastAttendedMs: number | null }[];
  /** Members whose subscription expired > 30 days ago with no renewal since. */
  stagnant: { user: User; expiredMs: number }[];
  /** Class types whose sessions in the last 2 weeks drew zero bookings. */
  lowOccupancy: { type: ClassType; sessions: number }[];
}

export function adminOverview(data: AppData, now: number = Date.now()): AdminOverview {
  const DAY = 24 * 60 * 60 * 1000;
  const MONTH = 30 * DAY;
  const TWO_WEEKS = 14 * DAY;
  const members = data.users.filter((u) => u.role === "member");

  const pending = data.users.filter((u) => u.approvalStatus === "pending");

  // latest attended session time per user
  const lastAttended = new Map<string, number>();
  for (const b of data.bookings) {
    if (b.state !== "attended") continue;
    const s = data.sessions.find((x) => x.id === b.sessionId);
    if (!s) continue;
    const ms = sessionStartDate(s).getTime();
    const prev = lastAttended.get(b.userId);
    if (prev === undefined || ms > prev) lastAttended.set(b.userId, ms);
  }

  const inactive = members
    .filter((u) => u.membershipActive && u.approvalStatus !== "pending")
    .map((u) => ({ user: u, lastAttendedMs: lastAttended.get(u.id) ?? null }))
    .filter(({ user, lastAttendedMs }) =>
      lastAttendedMs !== null
        ? now - lastAttendedMs > MONTH
        : user.approvedAt !== undefined && now - user.approvedAt > MONTH,
    );

  const stagnant = members
    .map((u) => {
      if (!u.membershipValidUntil) return null;
      const expiredMs = fromKey(u.membershipValidUntil).getTime();
      if (expiredMs >= now || now - expiredMs < MONTH) return null;
      const renewed = data.payments.some((p) => p.userId === u.id && p.date > expiredMs);
      return renewed ? null : { user: u, expiredMs };
    })
    .filter((x): x is { user: User; expiredMs: number } => x !== null);

  const bookedSessionIds = new Set(
    data.bookings
      .filter((b) => b.state !== "cancelled")
      .map((b) => b.sessionId),
  );
  const lowOccupancy: { type: ClassType; sessions: number }[] = [];
  for (const type of data.classTypes) {
    const recent = data.sessions.filter((s) => {
      if (s.classTypeId !== type.id || s.cancelled) return false;
      const ms = sessionStartDate(s).getTime();
      return ms <= now && ms >= now - TWO_WEEKS;
    });
    if (recent.length >= 1 && recent.every((s) => !bookedSessionIds.has(s.id))) {
      lowOccupancy.push({ type, sessions: recent.length });
    }
  }

  return { pending, inactive, stagnant, lowOccupancy };
}
