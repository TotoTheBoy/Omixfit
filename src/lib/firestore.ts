// ---------------------------------------------------------------------------
// Firestore backend. The ONLY module (besides firebase.ts) that imports the
// firestore SDK; it's code-split (store.ts dynamic-imports it) so it stays off
// the critical bundle. Responsibilities:
//   • stream every collection in via onSnapshot → store.hydrate (live, multi-
//     client sync — this is what makes data real and shared across devices)
//   • seed the database once, if empty
//   • run the booking mutations; capacity is enforced atomically with a
//     per-session counter inside a transaction (plan.md §4.4)
// Roles are gated in the UI; firestore.rules enforces sign-in + booking
// ownership (un-forgeable roles need Blaze + custom claims — see README).
// ---------------------------------------------------------------------------

import { getApps, initializeApp } from "firebase/app";
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
  Payment,
  Service,
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
}

/** Seed the database on first ever run (guarded by a marker doc). */
async function seedIfEmpty(): Promise<void> {
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
  // Firestore batches are capped at 500 writes — chunk (+1 for the marker).
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
): Promise<void> {
  await initFirestore();
  const e = email.trim().toLowerCase();
  const fromMirror = getState().users.find((u) => u.email?.toLowerCase() === e);
  if (fromMirror) return setCurrentUser(fromMirror.id);

  const snap = await getDocs(query(col.users, where("email", "==", email.trim())));
  const found = snap.docs.map((d) => d.data() as User)[0];
  if (found) return setCurrentUser(found.id);

  const name = displayName?.trim() || email.split("@")[0] || email;
  const user: User = {
    id: uid,
    name,
    phone: "",
    email: email.trim(),
    // Auto-registration ALWAYS creates a plain member, pending staff approval —
    // there is no app path to instructor/manager/admin.
    role: "member",
    approvalStatus: "pending",
    membershipActive: false,
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
  if (status === "approved") patch.membershipActive = true; // approval activates membership
  await updateDoc(doc(db, "users", userId), patch as Record<string, unknown>);
  await audit(
    status === "approved" ? "member_approved" : "member_rejected",
    before?.name ?? userId,
  );
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
    return await runTransaction(db, async (tx): Promise<engine.BookOutcome> => {
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
    if (result !== "skip" && !first) first = result;
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
}

export async function cancelSession(sessionId: string): Promise<void> {
  const target = getState().sessions.find((s) => s.id === sessionId);
  await updateDoc(doc(db, "sessions", sessionId), { cancelled: true });
  await audit("session_cancelled", target ? sessionLabel(target) : sessionId);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const target = getState().sessions.find((s) => s.id === sessionId);
  const snap = await getDocs(query(col.bookings, where("sessionId", "==", sessionId)));
  const batch = writeBatch(db);
  batch.delete(doc(db, "sessions", sessionId));
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
  await audit("session_deleted", target ? sessionLabel(target) : sessionId);
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
  // The admin account can never be modified through the app, and no app action
  // may ever grant the admin role (admin is console-only).
  if (before?.role === "admin") return;
  if (patch.role === "admin") delete patch.role;
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
