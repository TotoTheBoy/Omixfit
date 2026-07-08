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

/** Monthly 1-on-1 coaching subscription (managed over WhatsApp; the app just
 *  nudges Omer to keep up the weekly call / daily contact / monthly charge). */
export interface Coaching {
  active: boolean;
  startedAt?: number;
  /** Goals set at the first (online/physical) meeting. */
  goals?: string;
  firstMeetingDone?: boolean;
  lastCallAt?: number; // last weekly 1-hour call (ms)
  lastContactAt?: number; // last WhatsApp touchpoint (ms)
  lastPaidMonth?: string; // "YYYY-MM" of the last collected payment
  monthlyFee?: number; // ₪ (for the "collect payment" reminder)
}

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
  /** Sessions remaining on the current punch-card (כרטיסייה), shown on the
   *  membership card in gold when set. */
  passSessionsLeft?: number;
  /** Omer's clinical notes (sports-therapist): injuries, pain, and the exercise
   *  ADAPTATIONS she prepares for this client. Staff-only; shown during class. */
  trainerNotes?: string;
  /** Monthly 1-on-1 coaching subscription state (the premium tier Omer runs over
   *  WhatsApp). Present once the client is enrolled. */
  coaching?: Coaching;
  /** Membership tier label + validity (manager-managed in v1). */
  membershipPlan?: string;
  membershipValidUntil?: string; // YYYY-MM-DD
  avatarColor: string; // derived chip color
  initials: string;
  /** Optional fun avatar persona (an emoji or `svg:<id>`) shown instead of initials. */
  avatarSkin?: string;
  /** Admin-only loyalty tier override — staff aren't gated by attended count and
   *  set their own OMIX tier by tapping the card badge. */
  loyaltyOverride?: "pace" | "endurance" | "elite" | "marathoner";
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

/** A one-off special event / retreat / workshop (docs/business.md §5.2). Sold at
 *  a one-time price and open to the PUBLIC (non-members sign up too). */
export interface SpecialEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  time?: string; // free-text, e.g. "10:00"
  location?: string;
  includes?: string; // "יוגה, נשימה, אמבט קרח, ארוחה..."
  price: number; // one-time ₪
  capacity: number;
  imageUrl?: string;
  published: boolean;
  createdAt: number;
}

/** A low-friction lead from the landing page — a prospect who left their details
 *  without creating an account, for Omer to follow up (docs/business.md §4). */
export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  note?: string;
  handled?: boolean; // Omer ticks it once she's followed up
  createdAt: number;
}

/** A public registration for a SpecialEvent (no app account required). */
export interface EventSignup {
  id: string;
  eventId: string;
  name: string;
  phone: string;
  email?: string;
  paid?: boolean; // Omer marks once the one-time payment lands
  createdAt: number;
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
  events: SpecialEvent[];
  leads: Lead[];
  facility: Facility;
  audit: AuditEntry[];
  /** null when logged out (the app shows the login screen). */
  currentUserId: string | null;
  version: number;
}
