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

/** New registrants must be approved by staff before they can use the app. */
export type ApprovalStatus = "pending" | "approved" | "rejected";

/** PAR-Q-style pre-exercise health declaration + terms, signed at registration. */
export interface HealthForm {
  /** Each is a yes/no answer to a standard pre-activity screening question. */
  q1: boolean; // heart condition - activity only on doctor's advice
  q2: boolean; // chest pain during physical activity
  q3: boolean; // chest pain at rest in the last month
  q4: boolean; // loses balance from dizziness / loses consciousness
  q5: boolean; // bone/joint problem worsened by activity
  q6: boolean; // medication for blood pressure / heart
  q7: boolean; // any other reason not to do physical activity
  notes: string; // free-text health notes
  termsAccepted: boolean;
  signedName: string; // typed signature
  submittedAt: number;
}

export type Gender = "female" | "male" | "other";

export interface User {
  id: string;
  name: string;
  phone: string;
  /** Firebase Auth identity. Sign-in matches a user by email (case-insensitive). */
  email?: string;
  /** Collected at registration (onboarding). */
  gender?: Gender;
  age?: number;
  address?: string;
  /** Whether the Firebase email was verified (mirrored from auth so staff can
   *  see it on the approval card). */
  emailVerified?: boolean;
  role: Role;
  /**
   * Registration gate. Seeded/legacy users are `approved`. A fresh sign-up is
   * `pending` until staff approves (then `membershipActive` is turned on).
   * Undefined is treated as `approved` for backward compatibility.
   */
  approvalStatus?: ApprovalStatus;
  /** The signed health declaration + terms (present once the registrant submits). */
  healthForm?: HealthForm;
  /** Q3: booking is gated on this even before a payment engine exists. */
  membershipActive: boolean;
  /** When staff approved this member (ms). Drives the "new client" flag and the
   *  7-day trial → buy-a-pass window. */
  approvedAt?: number;
  /** Last time this account signed in (ms) — rollout / re-engagement visibility. */
  lastLoginAt?: number;
  /** Set true once Omer records that the member bought a pass (punch-card); the
   *  trial auto-disconnect leaves passholders alone. */
  hasPass?: boolean;
  /** Membership tier label + validity (manager-managed in v1). */
  membershipPlan?: string;
  membershipValidUntil?: string; // YYYY-MM-DD
  avatarColor: string; // derived chip color
  initials: string;
  /** Optional fun avatar persona (an emoji) shown instead of the initials. */
  avatarSkin?: string;
  prefs?: NotifyPrefs;
  /** True once the member connected their own Google Calendar (set by the OAuth
   *  callback function); gates the "sync my classes" UI. */
  calConnected?: boolean;
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
  /** ISO date, local - the day the session happens. */
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
  /** Online session → a free Jitsi video room (meet.jit.si/omix-<id>). */
  online?: boolean;
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
  | "waitlisted" // reserved in the model (Q4) - not user-creatable in v1
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

// ---- services & revenue (the trainer's business) ---------------------------

/** The kinds of service the trainer sells. Therapy/injury are future offerings. */
export type ServiceKind =
  | "personal"
  | "group"
  | "zoom"
  | "therapy"
  | "injury";

/** How a service is billed. */
export type BillingModel = "package" | "subscription" | "session";

/** A sellable service the trainer manages (name, price, billing). */
export interface Service {
  id: string;
  name: string;
  kind: ServiceKind;
  billing: BillingModel;
  /** Price in ₪ - per package / per month / per session depending on `billing`. */
  price: number;
  /** Sessions included (package billing only). */
  units?: number;
  /** Auto-generate a free Jitsi video room for online (zoom-kind) sessions. */
  online?: boolean;
  active: boolean;
}

/** A recorded sale/payment - the unit of revenue. */
export interface Payment {
  id: string;
  userId: string;
  serviceId: string;
  serviceName: string; // denormalized so it survives service edits/deletes
  kind: ServiceKind;
  amount: number; // ₪
  /** Sessions added to the client's balance by this sale (package billing). */
  units?: number;
  date: number; // epoch ms
  note?: string;
  actorId: string;
}

// ---- business subscriptions / billing (admin-only tracker) -----------------

export type BillingCycle = "monthly" | "yearly" | "once" | "free";

/** A recurring business subscription/bill the owner wants to keep track of. */
export interface Subscription {
  id: string;
  name: string; // "Google Workspace"
  vendor: string; // "Google"
  purpose: string; // what it's for
  amount: number; // 0 for free
  currency: string; // "EUR" | "ILS" | "USD"
  cycle: BillingCycle;
  status: "active" | "trial" | "cancelled";
  note?: string;
  url?: string; // manage/billing link
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
  | "membership_changed"
  | "member_approved"
  | "member_rejected";

/** Audit log entry - who changed/cancelled what (plan.md §4.6). */
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
  /** Business payment-request links (Bit / PayBox) for client self-pay. */
  bitLink?: string;
  payboxLink?: string;
}

export interface AppData {
  users: User[];
  classTypes: ClassType[];
  sessions: ClassSession[];
  bookings: Booking[];
  locations: Location[];
  services: Service[];
  payments: Payment[];
  subscriptions: Subscription[];
  facility: Facility;
  audit: AuditEntry[];
  /** null when logged out (the app shows the login screen). */
  currentUserId: string | null;
  version: number;
}
