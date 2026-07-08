// Pricing tiers (docs/refactor-spec.md §7). Config-only so new tracks (group
// classes, etc.) drop in without touching UI. Prices in ₪.
export interface PackageTier {
  id: string;
  /** Track this tier belongs to — lets us group/extend later. */
  track: "personal" | "group";
  title: string;
  sessions: number;
  total: number;
  /** Per-session breakdown (fine gold subtext); omit for single/trial. */
  perSession?: number;
  featured?: boolean;
}

export const PACKAGE_TRACKS: { id: PackageTier["track"]; label: string }[] = [
  { id: "personal", label: "אימון אישי (1-על-1)" },
];

export const PACKAGES: PackageTier[] = [
  { id: "p-12", track: "personal", title: "12 אימונים", sessions: 12, total: 1920, perSession: 160, featured: true },
  { id: "p-8", track: "personal", title: "8 אימונים", sessions: 8, total: 1360, perSession: 170 },
  { id: "p-4", track: "personal", title: "4 אימונים", sessions: 4, total: 720, perSession: 180 },
  { id: "p-1", track: "personal", title: "אימון בודד / ניסיון", sessions: 1, total: 200 },
];
