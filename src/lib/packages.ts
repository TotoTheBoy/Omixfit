// Trainee-facing shop pricing, grouped into tracks (sections). Config-only so
// tracks/tiers drop in without touching UI. Prices in ₪.
export interface PackageTier {
  id: string;
  /** Track (section) this tier belongs to. */
  track: "personal" | "online" | "group" | "therapy";
  title: string;
  sessions: number;
  total: number;
  /** Per-session breakdown (fine gold subtext); omit for single/trial. */
  perSession?: number;
  featured?: boolean;
}

export const PACKAGE_TRACKS: { id: PackageTier["track"]; label: string }[] = [
  { id: "personal", label: "אימון אישי (1-על-1)" },
  { id: "online", label: "אימון אונליין" },
  { id: "group", label: "אימון קבוצתי" },
  { id: "therapy", label: "טיפול ושיקום בספורט" },
];

export const PACKAGES: PackageTier[] = [
  // ---- personal (1-on-1) ----
  { id: "per-12", track: "personal", title: "12 אימונים", sessions: 12, total: 3960, perSession: 330, featured: true },
  { id: "per-8", track: "personal", title: "8 אימונים", sessions: 8, total: 2800, perSession: 350 },
  { id: "per-4", track: "personal", title: "4 אימונים", sessions: 4, total: 1520, perSession: 380 },
  { id: "per-1", track: "personal", title: "אימון בודד / ניסיון", sessions: 1, total: 370 },
  // ---- online ----
  { id: "onl-12", track: "online", title: "12 אימונים", sessions: 12, total: 2880, perSession: 240, featured: true },
  { id: "onl-8", track: "online", title: "8 אימונים", sessions: 8, total: 2000, perSession: 250 },
  { id: "onl-4", track: "online", title: "4 אימונים", sessions: 4, total: 1040, perSession: 260 },
  // ---- group ----
  { id: "grp-12", track: "group", title: "12 אימונים", sessions: 12, total: 780, perSession: 65, featured: true },
  { id: "grp-8", track: "group", title: "8 אימונים", sessions: 8, total: 600, perSession: 75 },
  { id: "grp-4", track: "group", title: "4 אימונים", sessions: 4, total: 340, perSession: 85 },
  // ---- therapy / rehab (prices adjustable) ----
  { id: "thr-4", track: "therapy", title: "4 טיפולים", sessions: 4, total: 1000, perSession: 250 },
  { id: "thr-1", track: "therapy", title: "טיפול בודד", sessions: 1, total: 280 },
];
