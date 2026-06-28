// ---------------------------------------------------------------------------
// Seed data. Sessions are generated relative to "today" so the weekly calendar
// is always populated. Bookings are seeded so fill-rates look realistic.
// ---------------------------------------------------------------------------

import type {
  AppData,
  Booking,
  ClassSession,
  ClassType,
  User,
} from "./types";
import { addDays, fromKey, startOfWeek, toKey } from "./date";

const LOCATION_ID = "loc-main";

const users: User[] = [
  // Top-privilege admin. The app never grants this role and never lets it be
  // edited from the UI - set/manage it only in the Firebase console.
  u("u-admin", "מנהל/ת המערכת", "050-0000000", "admin", "#11161D"),
  u("u-noa", "נועה אלון", "050-1112233", "manager", "#D6FF3D"),
  u("u-yael", "יעל כהן", "052-7654321", "instructor", "#8E7BFF"),
  u("u-tom", "תום לוי", "054-3219876", "instructor", "#FF8A3D"),
  u("u-ran", "רן מזרחי", "053-4567890", "instructor", "#27E0B0"),
  u("u-dana", "דנה פרץ", "050-9988776", "member", "#FF5A8A"),
  u("u-avi", "אבי שטרן", "058-1234567", "member", "#5AC8FF"),
  u("u-mor", "מור ביטון", "052-2223344", "member", "#FFD23D"),
  u("u-eli", "אלי נחום", "054-5556677", "member", "#B26BFF"),
  u("u-shira", "שירה גל", "053-8889900", "member", "#3DE0FF"),
  u("u-gil", "גיל אבני", "050-7778899", "member", "#FF6B6B"),
  u("u-roni", "רוני דהן", "052-4445566", "member", "#FF9F1C"),
  u("u-lior", "ליאור כץ", "054-7778811", "member", "#2EC4B6"),
  u("u-maya", "מאיה ברק", "053-1239876", "member", "#E84855"),
  u("u-omer", "עומר שלו", "050-6543210", "member", "#9B5DE5"),
  u("u-tal", "טל אביב", "058-3334455", "member", "#00BBF9"),
  u("u-noaa", "נועם רז", "052-9871234", "member", "#F15BB5"),
  u("u-yarin", "ירין מור", "054-1112299", "member", "#06D6A0"),
  u("u-shaked", "שקד לב", "053-7654399", "member", "#FFCA3A"),
];

const classTypes: ClassType[] = [
  ct("ct-spin", "ספינינג אקספרס", "spinning", 18, 45,
    "45 דקות של דיווש אינטנסיבי על קצב המוזיקה. שורף, אנרגטי, מכור."),
  ct("ct-yoga", "ויניאסה יוגה", "yoga", 14, 60,
    "זרימה רציפה בין תנוחות לשחרור הגוף והנשימה. מתאים לכל הרמות."),
  ct("ct-cross", "קרוספיט WOD", "crossfit", 16, 60,
    "אימון פונקציונלי משתנה - כוח, סיבולת ומטבוליק בעצימות גבוהה."),
  ct("ct-pil", "פילאטיס מכשירים", "pilates", 10, 50,
    "חיזוק שרירי הליבה ושיפור היציבה בעבודה מדויקת ושקטה."),
  ct("ct-box", "אגרוף לכושר", "boxing", 20, 50,
    "קומבינציות על שקים, עבודת רגליים וקרדיו אגרסיבי. בלי ניסיון קודם."),
  ct("ct-str", "אימון כוח", "strength", 12, 55,
    "משקולות חופשיות ותרגילי מורכבים לבניית מסת שריר וכוח."),
  ct("ct-hiit", "HIIT שורף", "hiit", 22, 40,
    "אינטרוולים קצרים ועצימים. מקסימום שריפה במינימום זמן."),
  ct("ct-dance", "מחול אירובי", "dance", 24, 55,
    "ריקוד, קרדיו וכיף - אימון שלא מרגישים שהוא אימון."),
];

// Weekly template: [dayOfWeek (0=Sun), startMin, classTypeId, instructorId, room]
type Slot = [number, number, string, string, string];
const TEMPLATE: Slot[] = [
  // Sunday
  [0, 7 * 60, "ct-hiit", "u-ran", "סטודיו A"],
  [0, 9 * 60 + 30, "ct-yoga", "u-yael", "סטודיו B"],
  [0, 17 * 60, "ct-spin", "u-tom", "אולם ספינינג"],
  [0, 18 * 60 + 30, "ct-cross", "u-ran", "סטודיו A"],
  [0, 20 * 60, "ct-box", "u-tom", "אולם רב-תכליתי"],
  // Monday
  [1, 6 * 60 + 30, "ct-spin", "u-tom", "אולם ספינינג"],
  [1, 8 * 60, "ct-pil", "u-yael", "סטודיו B"],
  [1, 17 * 60 + 30, "ct-str", "u-ran", "חדר כושר"],
  [1, 19 * 60, "ct-dance", "u-yael", "סטודיו A"],
  [1, 20 * 60 + 15, "ct-hiit", "u-ran", "סטודיו A"],
  // Tuesday
  [2, 7 * 60, "ct-cross", "u-ran", "סטודיו A"],
  [2, 9 * 60, "ct-yoga", "u-yael", "סטודיו B"],
  [2, 18 * 60, "ct-spin", "u-tom", "אולם ספינינג"],
  [2, 19 * 60 + 30, "ct-box", "u-tom", "אולם רב-תכליתי"],
  // Wednesday
  [3, 6 * 60 + 30, "ct-hiit", "u-ran", "סטודיו A"],
  [3, 8 * 60, "ct-str", "u-ran", "חדר כושר"],
  [3, 17 * 60, "ct-pil", "u-yael", "סטודיו B"],
  [3, 18 * 60 + 30, "ct-spin", "u-tom", "אולם ספינינג"],
  [3, 20 * 60, "ct-cross", "u-ran", "סטודיו A"],
  // Thursday
  [4, 7 * 60, "ct-spin", "u-tom", "אולם ספינינג"],
  [4, 9 * 60, "ct-dance", "u-yael", "סטודיו A"],
  [4, 18 * 60, "ct-cross", "u-ran", "סטודיו A"],
  [4, 19 * 60 + 30, "ct-yoga", "u-yael", "סטודיו B"],
  // Friday (short day)
  [5, 7 * 60 + 30, "ct-hiit", "u-ran", "סטודיו A"],
  [5, 9 * 60, "ct-spin", "u-tom", "אולם ספינינג"],
  [5, 10 * 60 + 30, "ct-yoga", "u-yael", "סטודיו B"],
  // Saturday: closed (Shabbat)
];

function buildSessions(): ClassSession[] {
  const sessions: ClassSession[] = [];
  const typeById = new Map(classTypes.map((c) => [c.id, c]));
  // Generate for previous week (for "past"), current, and next 2 weeks.
  const base = startOfWeek(new Date());
  for (let w = -1; w <= 2; w++) {
    const weekStart = addDays(base, w * 7);
    for (const [dow, startMin, typeId, instructorId, room] of TEMPLATE) {
      const date = toKey(addDays(weekStart, dow));
      const type = typeById.get(typeId)!;
      sessions.push({
        id: `s-${date}-${startMin}-${typeId}`,
        classTypeId: typeId,
        date,
        startMin,
        durationMin: type.defaultDurationMin,
        capacity: type.defaultCapacity,
        instructorId,
        locationId: LOCATION_ID,
        room,
        seriesId: `series-${typeId}-${dow}-${startMin}`,
      });
    }
  }
  return sessions;
}

// Deterministic pseudo-random so seeded fill-rates are stable between reloads.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function buildBookings(sessions: ClassSession[]): Booking[] {
  const bookings: Booking[] = [];
  // Exclude the initial demo user so they start with an empty "My Bookings"
  // and full freedom to book (otherwise seeded fill can hit the active limit).
  const memberIds = users
    .filter((u) => u.role === "member" && u.id !== "u-dana")
    .map((u) => u.id);
  const now = Date.now();
  let seq = 0;
  for (const s of sessions) {
    const start = fromKey(s.date);
    start.setMinutes(s.startMin);
    const isPast = start.getTime() < now;
    // Each session gets a pseudo-random fill level.
    const fill = hashStr(s.id);
    const target = Math.round(fill * s.capacity);
    const shuffled = [...memberIds].sort(
      (a, b) => hashStr(s.id + a) - hashStr(s.id + b),
    );
    for (let i = 0; i < Math.min(target, shuffled.length); i++) {
      // Resolve past sessions: most attended, a few no-shows - so attendance
      // reports and the profile's "attended" stat have real data.
      const state: Booking["state"] = isPast
        ? hashStr(s.id + shuffled[i] + "att") < 0.12
          ? "no_show"
          : "attended"
        : "confirmed";
      bookings.push({
        id: `b-${seq++}`,
        sessionId: s.id,
        userId: shuffled[i],
        state,
        createdAt: now - (seq * 60000),
      });
    }
  }
  return bookings;
}

function buildAudit(): AppData["audit"] {
  const now = Date.now();
  const h = 3600 * 1000;
  // A few recent manager actions so the log isn't empty on first visit.
  const e = (
    n: number,
    actorId: string,
    action: AppData["audit"][number]["action"],
    summary: string,
    hoursAgo: number,
  ) => ({ id: `a-seed-${n}`, ts: now - hoursAgo * h, actorId, action, summary });
  return [
    e(1, "u-noa", "session_created", "HIIT שורף · ראשון 20:15 (+7 בסדרה)", 2),
    e(2, "u-noa", "membership_changed", "גיל אבני: מנוי הופעל", 6),
    e(3, "u-tom", "session_cancelled", "ספינינג אקספרס · שבת 09:00", 26),
    e(4, "u-noa", "type_updated", "פילאטיס מכשירים", 49),
    e(5, "u-noa", "role_changed", "יעל כהן: member ← instructor", 72),
  ];
}

// Starter service catalogue - editable in the app. Prices are placeholders (₪).
const services: AppData["services"] = [
  { id: "svc-personal-pack", name: "אימון אישי · חבילה", kind: "personal", billing: "package", price: 1500, units: 10, active: true },
  { id: "svc-personal-1", name: "אימון אישי בודד", kind: "personal", billing: "session", price: 180, active: true },
  { id: "svc-group", name: "מנוי אימונים קבוצתי", kind: "group", billing: "subscription", price: 320, active: true },
  { id: "svc-zoom", name: "אימון בזום", kind: "zoom", billing: "session", price: 120, online: true, active: true },
  { id: "svc-therapy", name: "ספורט-תרפיה", kind: "therapy", billing: "session", price: 250, active: false },
  { id: "svc-injury", name: "טיפול ושיקום פציעות", kind: "injury", billing: "package", price: 2000, units: 8, active: false },
];

export function buildSeed(): AppData {
  const sessions = buildSessions();
  const bookings = buildBookings(sessions);
  return {
    users,
    classTypes,
    sessions,
    bookings,
    services,
    payments: [],
    subscriptions: [],
    locations: [{ id: LOCATION_ID, name: "Omix · הסניף הראשי" }],
    facility: {
      name: "Omix",
      bookingWindowDays: 14,
      bookingClosesBeforeMin: 30,
      cancelCutoffHours: 3,
      maxActiveBookings: 6,
    },
    audit: buildAudit(),
    // Logged out by default - Firebase Auth (App.tsx) sets the current user once
    // a session resolves; until then the Login screen renders.
    currentUserId: null,
    version: 6,
  };
}

// ---- builders ----------------------------------------------------------------
function u(
  id: string,
  name: string,
  phone: string,
  role: User["role"],
  color: string,
): User {
  const parts = name.split(" ");
  const initials = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return {
    id,
    name,
    phone,
    // Demo email derived from the id (e.g. u-noa → noa@omixfit.app). Sign up
    // with this address in Firebase Auth to log in as that seeded user/role.
    email: `${id.replace(/^u-/, "")}@omixfit.app`,
    role,
    // Seeded users are pre-approved; only fresh sign-ups go through approval.
    approvalStatus: "approved" as const,
    membershipActive: true,
    membershipPlan: role === "member" ? "מנוי חופשי חודשי" : "צוות",
    membershipValidUntil: "2026-12-31",
    avatarColor: color,
    initials,
    prefs: { push: true, email: true, whatsapp: true, reminderHours: 2 },
  };
}

function ct(
  id: string,
  name: string,
  category: ClassType["category"],
  defaultCapacity: number,
  defaultDurationMin: number,
  description: string,
): ClassType {
  return { id, name, category, defaultCapacity, defaultDurationMin, description };
}
