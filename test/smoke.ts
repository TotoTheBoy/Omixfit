// Runtime smoke test for the core booking engine (capacity atomicity, gating,
// waitlist FIFO, dates). Targets the pure engine (src/lib/engine.ts) over a
// local AppData snapshot — no Firebase, no persistence — so it bundles for node
// and stays the fastest regression gate. The Firestore backend enforces the
// same invariants atomically; this guards the algorithm.
import { startOfWeek, toKey, addDays, fmtTime } from "../src/lib/date";
import { buildSeed } from "../src/lib/seed";
import * as engine from "../src/lib/engine";
import type { AppData, ClassSession } from "../src/lib/types";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    console.log("  ✗ " + name);
  }
}

// Local mutable snapshot + thin appliers mirroring the store mutations.
const data: AppData = buildSeed();
data.facility.maxActiveBookings = 999; // isolate capacity from the anti-hoarding limit
const book = (sid: string, uid: string) => {
  const r = engine.applyBook(data, sid, uid);
  data.bookings = r.bookings;
  return r.outcome;
};
const cancel = (sid: string, uid: string) => {
  const r = engine.applyCancel(data, sid, uid);
  data.bookings = r.bookings;
  return r.promotedUserId;
};
const joinWl = (sid: string, uid: string) => {
  const r = engine.applyJoinWaitlist(data, sid, uid);
  data.bookings = r.bookings;
  return r.outcome;
};
const addSession = (s: ClassSession) => {
  data.sessions = [...data.sessions.filter((x) => x.id !== s.id), s];
};
const count = (sid: string) => engine.confirmedCount(sid, data);
const wlPos = (sid: string, uid: string) => engine.waitlistPosition(sid, uid, data);

// 1. Week starts Sunday
ok("startOfWeek lands on Sunday", startOfWeek(new Date()).getDay() === 0);
ok("fmtTime formats minutes", fmtTime(18 * 60 + 30) === "18:30");

// 2. Seed invariants
let overbooked = 0;
for (const s of data.sessions) {
  const n = data.bookings.filter(
    (b) => b.sessionId === s.id && b.state === "confirmed",
  ).length;
  if (n > s.capacity) overbooked++;
}
ok("no seeded session exceeds capacity", overbooked === 0);
ok(
  "past sessions are resolved (attendance data exists)",
  data.bookings.some((b) => b.state === "attended") &&
    data.bookings.some((b) => b.state === "no_show"),
);
ok(
  "seed has sessions this week",
  data.sessions.some((s) => {
    const ws = startOfWeek(new Date());
    const keys = new Set(Array.from({ length: 7 }, (_, i) => toKey(addDays(ws, i))));
    return keys.has(s.date);
  }),
);

// 3. Atomic capacity: synthetic future session, capacity 1
const future = toKey(addDays(new Date(), 10));
const member = data.users.find((u) => u.role === "member")!;
const member2 = data.users.filter((u) => u.role === "member")[1]!;
const synthetic: ClassSession = {
  id: "test-synth-1",
  classTypeId: data.classTypes[0].id,
  date: future,
  startMin: 18 * 60,
  durationMin: 45,
  capacity: 1,
  instructorId: data.users.find((u) => u.role === "instructor")!.id,
  locationId: data.locations[0].id,
  room: "טסט",
};
addSession(synthetic);

ok("first booking succeeds", book(synthetic.id, member.id) === "ok");
ok("count is 1 after booking", count(synthetic.id) === 1);
ok("double-booking same user blocked", book(synthetic.id, member.id) === "already");
ok("second user hits capacity -> full", book(synthetic.id, member2.id) === "full");

cancel(synthetic.id, member.id);
ok("count is 0 after cancel", count(synthetic.id) === 0);
ok("spot reopens after cancel", book(synthetic.id, member2.id) === "ok");

// 3b. Waitlist (Q4) — synthetic (cap 1) is now full with member2 confirmed.
const m4 = data.users.filter((u) => u.role === "member")[3]!;
const m5 = data.users.filter((u) => u.role === "member")[4]!;
ok("join waitlist when full", joinWl(synthetic.id, m4.id) === "ok");
ok("second waitlister joins", joinWl(synthetic.id, m5.id) === "ok");
ok("cannot join waitlist twice", joinWl(synthetic.id, m4.id) === "already");
ok(
  "waitlist is FIFO",
  wlPos(synthetic.id, m4.id) === 1 && wlPos(synthetic.id, m5.id) === 2,
);
ok(
  "actionFor reports waitlisted",
  engine.actionFor(synthetic, m4.id, data).kind === "waitlisted",
);
const promoted = cancel(synthetic.id, member2.id);
ok("cancel auto-promotes the first waitlister", promoted === m4.id);
ok(
  "promoted member is now confirmed",
  count(synthetic.id) === 1 &&
    engine.actionFor(synthetic, m4.id, data).kind === "booked",
);
ok("remaining waitlister moves up to position 1", wlPos(synthetic.id, m5.id) === 1);

// 4. Membership gating (Q3)
const blocked: ClassSession = { ...synthetic, id: "test-synth-2", capacity: 5 };
addSession(blocked);
const m3 = data.users.filter((u) => u.role === "member")[2]!;
m3.membershipActive = false; // mutate in place; bookability reads current state
ok("inactive membership blocks booking", book(blocked.id, m3.id) === "membership");

// 5. Booking window: a session in the past is closed
const past: ClassSession = {
  ...synthetic,
  id: "test-synth-3",
  date: toKey(addDays(new Date(), -2)),
};
addSession(past);
ok("past session is closed", book(past.id, member.id) === "closed");

// 6. Profile stats
const ms = engine.memberStats(member.id, data);
ok("memberStats returns numeric totals", typeof ms.total === "number" && ms.upcoming >= 0);

// 7. Revenue + client value scoring
data.payments = [
  { id: "p1", userId: member.id, serviceId: "svc-zoom", serviceName: "זום", kind: "zoom", amount: 120, date: Date.now(), actorId: "u-actor" },
  { id: "p2", userId: member.id, serviceId: "svc-personal-1", serviceName: "אישי", kind: "personal", amount: 180, date: Date.now(), actorId: "u-actor" },
  { id: "p3", userId: member2.id, serviceId: "svc-zoom", serviceName: "זום", kind: "zoom", amount: 120, date: Date.now(), actorId: "u-actor" },
];
const rev = engine.revenueSummary(data);
ok("revenueSummary totals payments", rev.total === 420 && rev.count === 3);
ok("revenueSummary breaks down by kind", rev.byKind.get("zoom") === 240 && rev.byKind.get("personal") === 180);
// Isolate the ranking on spend: the value score blends revenue (60%) with
// attendance (40%), and the seed's attendance is date-relative, so neutralize it
// here to keep this assertion about the top spender deterministic.
data.bookings = data.bookings.filter((b) => b.state !== "attended");
const vs = engine.clientValueScores(data);
ok("clientValueScores ranks the top spender first", vs[0].user.id === member.id && vs[0].revenue === 300);
ok("value score is 0–100", vs.every((x) => x.score >= 0 && x.score <= 100));

// ---- admin overview thresholds (#1) ----
{
  const now = Date.now();
  const DAY = 86400000;
  const mk = (id: string, validUntil: string) => ({
    ...member,
    id,
    name: id,
    approvalStatus: "approved" as const,
    membershipActive: true,
    membershipValidUntil: validUntil,
    approvedAt: now - 200 * DAY,
  });
  data.users.push(mk("u-stale", toKey(new Date(now - 45 * DAY)))); // expired 45d ago, no renewal
  data.users.push(mk("u-fresh", toKey(new Date(now + 30 * DAY)))); // still valid
  const ov = engine.adminOverview(data, now);
  ok(
    "adminOverview pending matches raw pending count",
    ov.pending.length === data.users.filter((u) => u.approvalStatus === "pending").length,
  );
  ok("adminOverview flags expired-no-renewal as stagnant", ov.stagnant.some((s) => s.user.id === "u-stale"));
  ok("adminOverview ignores still-valid subscriptions", !ov.stagnant.some((s) => s.user.id === "u-fresh"));
}

// ---- hasMedicalFlag (#13) ----
ok("hasMedicalFlag: no form → false", engine.hasMedicalFlag({ healthForm: undefined }) === false);
ok("hasMedicalFlag: a 'yes' answer → true", engine.hasMedicalFlag({ healthForm: { q3: true } } as never) === true);
ok(
  "hasMedicalFlag: all-no form → false",
  engine.hasMedicalFlag({ healthForm: { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false } } as never) === false,
);

// ---- adminOverview: inactivity + low-occupancy (#1) ----
{
  const now = Date.now();
  const DAY = 86400000;
  // an active member approved 60d ago with zero bookings → never attended → inactive
  data.users.push({ ...member, id: "u-inactive", role: "member", membershipActive: true, approvalStatus: "approved", approvedAt: now - 60 * DAY });
  // a class type whose only recent session (yesterday) drew no bookings → low-occupancy
  data.classTypes.push({ ...data.classTypes[0], id: "ct-lonely", name: "Lonely" });
  data.sessions.push({ ...data.sessions[0], id: "s-lonely", classTypeId: "ct-lonely", date: toKey(new Date(now - DAY)), startMin: 600, cancelled: false });
  const ov = engine.adminOverview(data, now);
  ok("adminOverview: long-approved never-attended member is inactive", ov.inactive.some((x) => x.user.id === "u-inactive"));
  ok("adminOverview: class type with a recent zero-booking session is low-occupancy", ov.lowOccupancy.some((x) => x.type.id === "ct-lonely"));
}

// ---- dashboardStats (owner dashboard KPIs) ----
{
  const ds = engine.dashboardStats(data, Date.now());
  ok("dashboardStats: revenueMonth is a non-negative number", typeof ds.revenueMonth === "number" && ds.revenueMonth >= 0);
  ok("dashboardStats: attendanceTrend spans 7 days", ds.attendanceTrend.length === 7);
  ok(
    "dashboardStats: activeMembers matches active member count",
    ds.activeMembers === data.users.filter((u) => u.role === "member" && u.membershipActive).length,
  );
  ok("dashboardStats: fillRate is within 0–100", ds.fillRate >= 0 && ds.fillRate <= 100);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  // @ts-expect-error node global
  process.exit(1);
}
