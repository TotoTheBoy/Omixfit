// ---------------------------------------------------------------------------
// Omixfit domain model
// Mirrors docs/plan.md §3. Deliberately separates ClassType (template) from
// ClassSession (a single dated occurrence). See plan.md for rationale.
// ---------------------------------------------------------------------------

export type Role = "member" | "instructor" | "manager" | "admin";

export interface NotifyPrefs {
  push: boolean;
  email: boolean;
  whatsapp: boolean;
  /** Reminder lead time before a session, in hours. */
  reminderHours: number;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  /** Firebase Auth identity. Sign-in matches a user by email (case-insensitive). */
  email?: string;
  role: Role;
  /** Q3: booking is gated on this even before a payment engine exists. */
  membershipActive: boolean;
  /** Membership tier label + validity (manager-managed in v1). */
  membershipPlan?: string;
  membershipValidUntil?: string; // YYYY-MM-DD
  avatarColor: string; // derived chip color
  initials: string;
  prefs?: NotifyPrefs;
}

export type ClassCategory =
  | "spinning"
  | "yoga"
  | "crossfit"
  | "pilates"
  | "boxing"
  | "strength"
  | "dance"
  | "hiit";

export interface ClassType {
  id: string;
  name: string;
  description: string;
  category: ClassCategory;
  defaultCapacity: number;
  defaultDurationMin: number;
}

export interface ClassSession {
  id: string;
  classTypeId: string;
  /** ISO date, local — the day the session happens. */
  date: string; // YYYY-MM-DD
  /** Minutes from midnight, local. */
  startMin: number;
  durationMin: number;
  capacity: number;
  instructorId: string;
  /** Q6: kept on every session even with a single branch. */
  locationId: string;
  room: string;
  cancelled?: boolean;
  /** Set when generated from a recurrence rule. */
  seriesId?: string;
  /**
   * Denormalized counters maintained transactionally by the Firestore backend
   * for atomic capacity enforcement (a query can't run inside a transaction).
   * The UI ignores these and counts the live `bookings` mirror instead.
   */
  confirmed?: number;
  waitlist?: number;
}

export type BookingState =
  | "confirmed"
  | "waitlisted" // reserved in the model (Q4) — not user-creatable in v1
  | "cancelled"
  | "attended"
  | "no_show";

export interface Booking {
  id: string;
  sessionId: string;
  userId: string;
  state: BookingState;
  createdAt: number;
}

export interface Location {
  id: string;
  name: string;
}

export type AuditAction =
  | "session_created"
  | "session_updated"
  | "session_cancelled"
  | "session_deleted"
  | "type_created"
  | "type_updated"
  | "type_deleted"
  | "role_changed"
  | "membership_changed";

/** Audit log entry — who changed/cancelled what (plan.md §4.6). */
export interface AuditEntry {
  id: string;
  ts: number;
  actorId: string;
  action: AuditAction;
  summary: string;
}

export interface Facility {
  name: string;
  /** Booking opens this many days ahead. */
  bookingWindowDays: number;
  /** Booking closes this many minutes before start. */
  bookingClosesBeforeMin: number;
  /** Cancellation allowed up to this many hours before start. */
  cancelCutoffHours: number;
  /** Max concurrent confirmed bookings per member (anti-hoarding). */
  maxActiveBookings: number;
}

export interface AppData {
  users: User[];
  classTypes: ClassType[];
  sessions: ClassSession[];
  bookings: Booking[];
  locations: Location[];
  facility: Facility;
  audit: AuditEntry[];
  /** null when logged out (the app shows the login screen). */
  currentUserId: string | null;
  version: number;
}
