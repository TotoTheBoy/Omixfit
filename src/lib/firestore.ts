// ---------------------------------------------------------------------------
// Firestore backend. The ONLY module (besides firebase.ts) that imports the
// firestore SDK; it's code-split (store.ts dynamic-imports it) so it stays off
// the critical bundle. Responsibilities:
//   • stream every collection in via onSnapshot → store.hydrate (live, multi-
//     client sync - this is what makes data real and shared across devices)
//   • seed the database once, if empty
//   • run the booking mutations; capacity is enforced atomically with a
//     per-session counter inside a transaction (plan.md §4.4)
// Roles are gated in the UI; firestore.rules enforces sign-in + booking
// ownership (un-forgeable roles need Blaze + custom claims - see README).
// ---------------------------------------------------------------------------

import { getApps, initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";
import { getState, hydrate, setCurrentUser } from "./store";
import * as engine from "./engine";
import { buildSeed } from "./seed";
import { fmtTime, fromKey } from "./date";
import type {
  ApprovalStatus,
  AuditAction,
  AuditEntry,
  Booking,
  ClassSession,
  ClassType,
  Facility,
  HealthForm,
  Location,
  Lead,
  Payment,
  Service,
  SpecialEvent,
  EventSignup,
  Subscription,
  User,
} from "./types";

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
// Persistent IndexedDB cache → the PWA hydrates from cache offline and on cold
// loads, and the data is available across tabs.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // Optional model fields (units, online, note, seriesId, …) are often
  // undefined; Firestore rejects undefined values unless we drop them.
  ignoreUndefinedProperties: true,
});

const col = {
  users: collection(db, "users"),
  classTypes: collection(db, "classTypes"),
  sessions: collection(db, "sessions"),
  bookings: collection(db, "bookings"),
  locations: collection(db, "locations"),
  services: collection(db, "services"),
  payments: collection(db, "payments"),
  events: collection(db, "events"),
  eventSignups: collection(db, "eventSignups"),
  leads: collection(db, "leads"),
  audit: collection(db, "audit"),
};

// ---- init: seed (once) + live listeners -------------------------------------
let ready: Promise<void> | null = null;

export function initFirestore(): Promise<void> {
  if (!ready) {
    ready = seedIfEmpty();
    startListeners();
  }
  return ready;
}

function startListeners(): void {
  onSnapshot(col.users, (s) => hydrate({ users: s.docs.map((d) => d.data() as User) }));
  onSnapshot(col.classTypes, (s) =>
    hydrate({ classTypes: s.docs.map((d) => d.data() as ClassType) }),
  );
  onSnapshot(col.sessions, (s) =>
    hydrate({ sessions: s.docs.map((d) => d.data() as ClassSession) }),
  );
  onSnapshot(col.bookings, (s) =>
    hydrate({ bookings: s.docs.map((d) => d.data() as Booking) }),
  );
  onSnapshot(col.locations, (s) =>
    hydrate({ locations: s.docs.map((d) => d.data() as Location) }),
  );
  onSnapshot(col.services, (s) =>
    hydrate({ services: s.docs.map((d) => d.data() as Service) }),
  );
  onSnapshot(col.events, (s) =>
    hydrate({ events: s.docs.map((d) => d.data() as SpecialEvent) }),
  );
  onSnapshot(col.leads, (s) =>
    hydrate({ leads: s.docs.map((d) => d.data() as Lead) }),
  );
  onSnapshot(col.payments, (s) =>
    hydrate({ payments: s.docs.map((d) => d.data() as Payment) }),
  );
  onSnapshot(col.audit, (s) =>
    hydrate({
      audit: s.docs
        .map((d) => d.data() as AuditEntry)
        .sort((a, b) => b.ts - a.ts),
    }),
  );
  onSnapshot(doc(db, "meta", "facility"), (d) => {
    if (d.exists()) hydrate({ facility: d.data() as Facility });
  });
  // Owner-only (the rules deny non-owners) — ignore the permission error for
  // everyone else so it doesn't surface as a console error.
  onSnapshot(
    doc(db, "meta", "subscriptions"),
    (d) => hydrate({ subscriptions: d.exists() ? ((d.data().items as Subscription[]) ?? []) : [] }),
    () => {},
  );
}

/** Owner-only business subscriptions tracker (a single admin doc). */
export async function saveSubscriptions(items: Subscription[]): Promise<void> {
  await setDoc(doc(db, "meta", "subscriptions"), { items });
}

/** Business Bit/PayBox payment links (stored on the facility doc). */
export async function savePaymentLinks(links: { bitLink?: string; payboxLink?: string }): Promise<void> {
  await setDoc(doc(db, "meta", "facility"), links, { merge: true });
}

/** Seed the database on first ever run (guarded by a marker doc).
 *  Demo seeding is OPT-IN: it only runs when VITE_SEED_DEMO="1" so a real
 *  studio's schedule isn't polluted with demo classes. Set the flag in
 *  .env.local for demos/showcases; leave it unset in production. */
async function seedIfEmpty(): Promise<void> {
  if (import.meta.env.VITE_SEED_DEMO !== "1") return;
  const marker = await getDoc(doc(db, "meta", "seed"));
  if (marker.exists()) return;
  const seed = buildSeed();
  const ops: Array<[string, string, object]> = [];
  for (const u of seed.users) ops.push(["users", u.id, u]);
  for (const c of seed.classTypes) ops.push(["classTypes", c.id, c]);
  for (const s of seed.sessions) ops.push(["sessions", s.id, withCounters(s, seed.bookings)]);
  for (const b of seed.bookings) ops.push(["bookings", b.id, b]);
  for (const l of seed.locations) ops.push(["locations", l.id, l]);
  for (const sv of seed.services) ops.push(["services", sv.id, sv]);
  for (const a of seed.audit) ops.push(["audit", a.id, a]);
  // Firestore batches are capped at 500 writes - chunk (+1 for the marker).
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const [c, id, data] of ops.slice(i, i + 400)) batch.set(doc(db, c, id), data);
    await batch.commit();
  }
  const fin = writeBatch(db);
  fin.set(doc(db, "meta", "facility"), seed.facility);
  fin.set(doc(db, "meta", "seed"), { seeded: true, at: Date.now() });
  await fin.commit();
}

function withCounters(s: ClassSession, bookings: Booking[]): ClassSession {
  let confirmed = 0;
  let waitlist = 0;
  for (const b of bookings) {
    if (b.sessionId !== s.id) continue;
    if (b.state === "confirmed") confirmed++;
    else if (b.state === "waitlisted") waitlist++;
  }
  return { ...s, confirmed, waitlist };
}

// ---- auth → user reconciliation ---------------------------------------------
const AVATAR_COLORS = [
  "#D6FF3D", "#8E7BFF", "#FF8A3D", "#27E0B0", "#FF5A8A",
  "#5AC8FF", "#FFD23D", "#B26BFF", "#3DE0FF", "#FF6B6B",
];

// The business owners - these (and only these) verified emails become admins on
// sign-in. Kept in sync with firestore.rules `isOwnerEmail()`.
// omer@omixfit.com (business) and omerido20@gmail.com (personal) are the same
// person; both are full owners.
const OWNER_EMAILS = ["office@omixfit.com", "omer@omixfit.com", "omerido20@gmail.com"];
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
function hashCode(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Map a signed-in Firebase identity to a Firestore user (by email), creating an
 * inactive member for an unknown email. Waits for the seed so a seeded staff
 * email resolves to its real role instead of being recreated as a member.
 */
export async function resolveAuthUser(
  uid: string,
  email: string,
  displayName: string | null,
  emailVerified = false,
): Promise<void> {
  await initFirestore();
  const e = email.trim().toLowerCase();
  const owner = OWNER_EMAILS.includes(e); // the two business owners → admins
  const prefix = email.split("@")[0];
  // The name chosen at sign-up (stashed before the auth listener fired).
  let stashed: string | null = null;
  try {
    stashed = sessionStorage.getItem("omix:signupName");
    sessionStorage.removeItem("omix:signupName");
  } catch { /* no sessionStorage */ }
  const chosenName = stashed?.trim() || displayName?.trim() || prefix || email;

  // Existing account (mirror first, then a query). Promote an owner to admin
  // if they aren't already (idempotent).
  const existing =
    getState().users.find((u) => u.email?.toLowerCase() === e) ??
    (await getDocs(query(col.users, where("email", "==", email.trim())))).docs
      .map((d) => d.data() as User)[0];
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (owner && existing.role !== "admin") {
      patch.role = "admin";
      patch.approvalStatus = "approved";
      patch.membershipActive = true;
    }
    if (existing.emailVerified !== emailVerified) patch.emailVerified = emailVerified;
    patch.lastLoginAt = Date.now();
    // Heal a name that's still just the email prefix (e.g. owners who skipped
    // onboarding) when we now have a real name.
    if (existing.name === prefix && chosenName !== prefix) {
      patch.name = chosenName;
      patch.initials = initialsOf(chosenName);
    }
    // Fire-and-forget: profile touch-ups (lastLoginAt, verification, healed name)
    // must NOT block the session from resolving — matters most offline, where an
    // awaited write would stall the app shell.
    if (Object.keys(patch).length) {
      void updateDoc(doc(db, "users", existing.id), patch).catch(() => {});
    }
    return setCurrentUser(existing.id);
  }

  // New account: an owner is created as an approved admin; everyone else is a
  // plain member pending approval (no app path to instructor/manager/admin).
  const name = chosenName;
  const user: User = {
    id: uid,
    name,
    phone: "",
    email: email.trim(),
    role: owner ? "admin" : "member",
    approvalStatus: owner ? "approved" : "pending",
    membershipActive: owner,
    emailVerified,
    lastLoginAt: Date.now(),
    avatarColor: AVATAR_COLORS[hashCode(email) % AVATAR_COLORS.length],
    initials: initialsOf(name),
    prefs: { push: true, email: true, whatsapp: false, reminderHours: 2 },
  };
  await setDoc(doc(db, "users", uid), user);
  setCurrentUser(uid);
}

/** Registrant submits their signed health declaration (stays pending). */
export async function submitHealthForm(
  userId: string,
  form: HealthForm,
): Promise<void> {
  await updateDoc(doc(db, "users", userId), {
    healthForm: form as unknown as Record<string, unknown>,
  });
}

/** Staff approves/rejects a registrant. Admin accounts are never editable. */
export async function setApproval(
  userId: string,
  status: ApprovalStatus,
): Promise<void> {
  const before = getState().users.find((u) => u.id === userId);
  if (before?.role === "admin") return; // admin is off-limits to the app
  const patch: Partial<User> = { approvalStatus: status };
  if (status === "approved") {
    patch.membershipActive = true; // approval activates membership (trial)
    patch.approvedAt = Date.now(); // starts the "new client" + 7-day trial window
  }
  await updateDoc(doc(db, "users", userId), patch as Record<string, unknown>);
  await audit(
    status === "approved" ? "member_approved" : "member_rejected",
    before?.name ?? userId,
  );
  if (status === "approved") {
    // Best-effort: e-mail the member their "you're approved, log in" link. The
    // approval itself is already persisted, so a mail hiccup must not fail it.
    try {
      const call = httpsCallable(getFunctions(app, "us-central1"), "notifyApproval");
      await call({ uid: userId });
    } catch {
      /* mail is best-effort */
    }
  }
}

// ---- audit ------------------------------------------------------------------
function sessionLabel(s: ClassSession): string {
  const type = getState().classTypes.find((c) => c.id === s.classTypeId);
  return `${type?.name ?? "שיעור"} · ${s.date} ${fmtTime(s.startMin)}`;
}
async function audit(action: AuditAction, summary: string): Promise<void> {
  const id = engine.genId("a");
  const entry: AuditEntry = {
    id,
    ts: Date.now(),
    actorId: getState().currentUserId ?? "",
    action,
    summary,
  };
  await setDoc(doc(db, "audit", id), entry);
}

// ---- booking mutations (atomic capacity via the session counter) ------------
// Fire-and-forget transactional e-mails. Best-effort: a mail hiccup must never
// affect the booking/cancel result, so these swallow all errors.
function fireMemberMail(kind: "booking" | "promotion", uid: string, sessionId: string): void {
  try {
    void httpsCallable(getFunctions(app, "us-central1"), "memberMail")({ kind, uid, sessionId }).catch(() => {});
  } catch {
    /* ignore */
  }
}
function fireSessionCancelled(sessionId: string): void {
  try {
    void httpsCallable(getFunctions(app, "us-central1"), "notifySessionCancelled")({ sessionId }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export async function book(
  sessionId: string,
  userId: string,
): Promise<engine.BookOutcome> {
  const s = getState();
  const session = s.sessions.find((x) => x.id === sessionId);
  if (!session) return "full";
  // Fast client-side gates for nice messages (capacity is re-checked in the tx).
  const check = engine.bookability(session, userId, s);
  if (check.alreadyBooked) return "already";
  if (!check.canBook && check.reason !== "full") return check.reason!;

  const sessionRef = doc(db, "sessions", sessionId);
  try {
    const outcome = await runTransaction(db, async (tx): Promise<engine.BookOutcome> => {
      const sd = await tx.get(sessionRef);
      if (!sd.exists()) return "full";
      const data = sd.data() as ClassSession;
      if (data.cancelled) return "cancelled";
      if ((data.confirmed ?? 0) >= data.capacity) return "full";
      const bRef = doc(col.bookings);
      const booking: Booking = {
        id: bRef.id,
        sessionId,
        userId,
        state: "confirmed",
        createdAt: Date.now(),
      };
      tx.set(bRef, booking);
      tx.update(sessionRef, { confirmed: increment(1) });
      return "ok";
    });
    if (outcome === "ok") fireMemberMail("booking", userId, sessionId);
    return outcome;
  } catch {
    return "full";
  }
}

export async function joinWaitlist(
  sessionId: string,
  userId: string,
): Promise<engine.WaitlistOutcome> {
  const s = getState();
  const session = s.sessions.find((x) => x.id === sessionId);
  if (!session) return "notfull";
  if (session.cancelled) return "cancelled";
  if (engine.userBooking(sessionId, userId, s)) return "already";
  const minsToStart = (engine.sessionStartDate(session).getTime() - Date.now()) / 60000;
  if (minsToStart < s.facility.bookingClosesBeforeMin) return "closed";
  const user = s.users.find((u) => u.id === userId);
  if (!user?.membershipActive) return "membership";

  const sessionRef = doc(db, "sessions", sessionId);
  try {
    return await runTransaction(db, async (tx): Promise<engine.WaitlistOutcome> => {
      const sd = await tx.get(sessionRef);
      if (!sd.exists()) return "notfull";
      const data = sd.data() as ClassSession;
      if ((data.confirmed ?? 0) < data.capacity) return "notfull";
      const bRef = doc(col.bookings);
      const booking: Booking = {
        id: bRef.id,
        sessionId,
        userId,
        state: "waitlisted",
        createdAt: Date.now(),
      };
      tx.set(bRef, booking);
      tx.update(sessionRef, { waitlist: increment(1) });
      return "ok";
    });
  } catch {
    return "notfull";
  }
}

export async function cancelBooking(
  sessionId: string,
  userId: string,
): Promise<{ promotedUserId: string | null }> {
  const mine = engine.userBooking(sessionId, userId, getState());
  if (!mine) return { promotedUserId: null };
  const wasConfirmed = mine.state === "confirmed";
  const sessionRef = doc(db, "sessions", sessionId);
  await runTransaction(db, async (tx) => {
    tx.update(doc(db, "bookings", mine.id), { state: "cancelled" });
    if (wasConfirmed) tx.update(sessionRef, { confirmed: increment(-1) });
  });
  const promotedUserId = wasConfirmed ? await promoteWaitlist(sessionId) : null;
  return { promotedUserId };
}

/**
 * Promote earliest-waitlisted members into open slots (FIFO). Reads a fresh
 * waitlist via a query (reliable ordering), then confirms each in a transaction
 * that re-checks capacity. Returns the first promoted user (for the toast).
 */
async function promoteWaitlist(sessionId: string): Promise<string | null> {
  const sessionRef = doc(db, "sessions", sessionId);
  const snap = await getDocs(query(col.bookings, where("sessionId", "==", sessionId)));
  const wl = snap.docs
    .map((d) => d.data() as Booking)
    .filter((b) => b.state === "waitlisted")
    .sort((a, b) => a.createdAt - b.createdAt);
  let first: string | null = null;
  for (const b of wl) {
    const result = await runTransaction(db, async (tx): Promise<"full" | "skip" | string> => {
      const sd = await tx.get(sessionRef);
      const bd = await tx.get(doc(db, "bookings", b.id));
      if (!sd.exists() || !bd.exists()) return "skip";
      const data = sd.data() as ClassSession;
      if ((data.confirmed ?? 0) >= data.capacity) return "full";
      if ((bd.data() as Booking).state !== "waitlisted") return "skip";
      tx.update(doc(db, "bookings", b.id), { state: "confirmed" });
      tx.update(sessionRef, { confirmed: increment(1), waitlist: increment(-1) });
      return b.userId;
    });
    if (result === "full") break;
    if (result !== "skip") {
      if (!first) first = result;
      fireMemberMail("promotion", result, sessionId); // "a spot opened" e-mail
    }
  }
  return first;
}

// ---- manager mutations ------------------------------------------------------
export async function upsertSession(session: ClassSession): Promise<void> {
  const cur = getState().sessions.find((s) => s.id === session.id);
  const exists = !!cur;
  const data: ClassSession = {
    ...session,
    confirmed: cur?.confirmed ?? engine.confirmedCount(session.id, getState()),
    waitlist: cur?.waitlist ?? engine.waitlistCount(session.id, getState()),
  };
  await setDoc(doc(db, "sessions", session.id), data);
  await audit(exists ? "session_updated" : "session_created", sessionLabel(session));
  await promoteWaitlist(session.id); // a capacity increase may open slots (Q4)
  bumpCalendar();
}

export async function createSessions(
  base: Omit<ClassSession, "id" | "date"> & { date: string },
  recurrenceWeeks: number,
): Promise<void> {
  const seriesId = recurrenceWeeks > 1 ? engine.genId("series") : undefined;
  const made: ClassSession[] = [];
  const batch = writeBatch(db);
  for (let w = 0; w < Math.max(1, recurrenceWeeks); w++) {
    const d = fromKey(base.date);
    d.setDate(d.getDate() + w * 7);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const id = engine.genId("s");
    const s: ClassSession = { ...base, id, date, seriesId, confirmed: 0, waitlist: 0 };
    made.push(s);
    batch.set(doc(db, "sessions", id), s);
  }
  await batch.commit();
  const first = made[0];
  await audit(
    "session_created",
    made.length > 1
      ? `${sessionLabel(first)} (+${made.length - 1} בסדרה)`
      : sessionLabel(first),
  );
  bumpCalendar();
}

export async function cancelSession(sessionId: string): Promise<void> {
  const target = getState().sessions.find((s) => s.id === sessionId);
  await updateDoc(doc(db, "sessions", sessionId), { cancelled: true });
  await audit("session_cancelled", target ? sessionLabel(target) : sessionId);
  fireSessionCancelled(sessionId); // e-mail everyone who was booked
  bumpCalendar();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const target = getState().sessions.find((s) => s.id === sessionId);
  const snap = await getDocs(query(col.bookings, where("sessionId", "==", sessionId)));
  const batch = writeBatch(db);
  batch.delete(doc(db, "sessions", sessionId));
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
  await audit("session_deleted", target ? sessionLabel(target) : sessionId);
  bumpCalendar();
}

// ---- Google Calendar sync (calls the Cloud Function) ------------------------
/** Mirror upcoming sessions into the connected Google Calendar. */
export async function syncCalendar(
  mode?: "personal",
): Promise<{ connected: boolean; synced: number }> {
  const call = httpsCallable(getFunctions(app, "us-central1"), "syncCalendar");
  const res = await call(mode ? { mode } : undefined);
  return res.data as { connected: boolean; synced: number };
}

/** Returns a Google consent URL for the CURRENT user's own calendar. */
export async function calConnectUrl(): Promise<string> {
  const call = httpsCallable(getFunctions(app, "us-central1"), "calConnectUrl");
  const res = await call();
  return (res.data as { url: string }).url;
}
/** Fire-and-forget re-sync after a schedule change (no-op until connected). */
function bumpCalendar() {
  syncCalendar().catch(() => {});
}

export async function setAttendance(
  bookingId: string,
  attended: boolean,
): Promise<void> {
  await updateDoc(doc(db, "bookings", bookingId), {
    state: attended ? "attended" : "no_show",
  });
}

export async function updateUser(
  userId: string,
  patch: Partial<User>,
): Promise<void> {
  const before = getState().users.find((u) => u.id === userId);
  const isSelf = userId === getState().currentUserId;
  // An admin may edit their OWN profile (name/phone/prefs/…), but no one can
  // demote/de-approve an admin and others can't touch an admin doc at all.
  if (before?.role === "admin") {
    if (!isSelf) return;
    delete patch.role;
    delete patch.approvalStatus;
    delete patch.membershipActive;
  }
  if (patch.role === "admin") delete patch.role; // no app action grants admin
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, "users", userId), patch as Record<string, unknown>);
  if (before && patch.role && patch.role !== before.role) {
    await audit("role_changed", `${before.name}: ${before.role} ← ${patch.role}`);
  } else if (
    before &&
    patch.membershipActive !== undefined &&
    patch.membershipActive !== before.membershipActive
  ) {
    await audit(
      "membership_changed",
      `${before.name}: מנוי ${patch.membershipActive ? "הופעל" : "הושהה"}`,
    );
  }
}

export async function upsertClassType(ct: ClassType): Promise<void> {
  const exists = getState().classTypes.some((c) => c.id === ct.id);
  await setDoc(doc(db, "classTypes", ct.id), ct);
  await audit(exists ? "type_updated" : "type_created", ct.name);
}

export async function deleteClassType(typeId: string): Promise<boolean> {
  // Refuse if any session references it (keeps the schedule consistent).
  if (getState().sessions.some((s) => s.classTypeId === typeId)) return false;
  const target = getState().classTypes.find((c) => c.id === typeId);
  await deleteDoc(doc(db, "classTypes", typeId));
  await audit("type_deleted", target?.name ?? typeId);
  return true;
}

// ---- services & payments (revenue) ------------------------------------------
export async function upsertService(s: Service): Promise<void> {
  await setDoc(doc(db, "services", s.id), s);
}

export async function deleteService(id: string): Promise<void> {
  await deleteDoc(doc(db, "services", id));
}

export async function recordPayment(
  p: Omit<Payment, "id" | "actorId">,
): Promise<void> {
  const ref = doc(col.payments);
  const payment: Payment = { ...p, id: ref.id, actorId: getState().currentUserId ?? "" };
  await setDoc(ref, payment);
}

export async function deletePayment(id: string): Promise<void> {
  await deleteDoc(doc(db, "payments", id));
}

// ---- special events / retreats (docs/business.md §5.2) ----------------------
export async function upsertEvent(ev: SpecialEvent): Promise<void> {
  await setDoc(doc(db, "events", ev.id), ev);
  await audit("session_created", `אירוע: ${ev.title}`);
}
export async function deleteEvent(id: string): Promise<void> {
  await deleteDoc(doc(db, "events", id));
}
export function newEventId(): string {
  return engine.genId("ev");
}

/** PUBLIC (no login): fetch the events open for registration. */
export async function fetchPublishedEvents(): Promise<SpecialEvent[]> {
  await initFirestore();
  const snap = await getDocs(col.events);
  return snap.docs
    .map((d) => d.data() as SpecialEvent)
    .filter((e) => e.published)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** PUBLIC (no login): register for an event. Rules allow the create. */
export async function submitEventSignup(
  eventId: string,
  who: { name: string; phone: string; email?: string },
): Promise<void> {
  await initFirestore();
  const ref = doc(col.eventSignups);
  const signup: EventSignup = {
    id: ref.id,
    eventId,
    name: who.name.trim(),
    phone: who.phone.trim(),
    email: who.email?.trim() || undefined,
    createdAt: Date.now(),
  };
  // Firestore rejects `undefined`; drop an absent email.
  if (!signup.email) delete (signup as Partial<EventSignup>).email;
  await setDoc(ref, signup);
}

/** Staff: the registrations for one event. */
export async function fetchEventSignups(eventId: string): Promise<EventSignup[]> {
  const snap = await getDocs(query(col.eventSignups, where("eventId", "==", eventId)));
  return snap.docs
    .map((d) => d.data() as EventSignup)
    .sort((a, b) => a.createdAt - b.createdAt);
}
export async function markEventSignupPaid(id: string, paid: boolean): Promise<void> {
  await updateDoc(doc(db, "eventSignups", id), { paid });
}

// ---- landing leads ("just sign up", docs/business.md §4) ---------------------
/** PUBLIC (no login): a prospect leaves their details from the landing page. */
export async function submitLead(who: {
  name: string; phone: string; email?: string; note?: string;
}): Promise<void> {
  await initFirestore();
  const ref = doc(col.leads);
  const lead: Lead = {
    id: ref.id,
    name: who.name.trim(),
    phone: who.phone.trim(),
    email: who.email?.trim() || undefined,
    note: who.note?.trim() || undefined,
    createdAt: Date.now(),
  };
  if (!lead.email) delete (lead as Partial<Lead>).email;
  if (!lead.note) delete (lead as Partial<Lead>).note;
  await setDoc(ref, lead);
}
export async function setLeadHandled(id: string, handled: boolean): Promise<void> {
  await updateDoc(doc(db, "leads", id), { handled });
}
export async function deleteLead(id: string): Promise<void> {
  await deleteDoc(doc(db, "leads", id));
}
