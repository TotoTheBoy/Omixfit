import type { Service } from "./types";

// ---------------------------------------------------------------------------
// Omixfit's real price list (the three business categories from Omer's price
// sheets): GROUP · ONLINE · PERSONAL, each as 4 / 8 / 12-session punch-cards,
// valid half a year. Personal is priced at the premium end of the Israeli
// market (certified + B.Sc sport-therapy) with the volume rate at ₪330/session.
//
// Used two ways: the demo seed, and the admin "load recommended price list"
// one-tap in Finance → so Omer can populate the live catalog from her own
// (App-Check-valid) browser without hand-typing ten services.
// ---------------------------------------------------------------------------
export const RECOMMENDED_CATALOG: Service[] = [
  // ---- group classes (כרטיסיות קבוצות) ----
  { id: "cat-grp-4", name: "כרטיסיית קבוצות · 4 אימונים", kind: "group", billing: "package", price: 340, units: 4, active: true },
  { id: "cat-grp-8", name: "כרטיסיית קבוצות · 8 אימונים", kind: "group", billing: "package", price: 600, units: 8, active: true },
  { id: "cat-grp-12", name: "כרטיסיית קבוצות · 12 אימונים", kind: "group", billing: "package", price: 780, units: 12, active: true },
  // ---- online / zoom (כרטיסיות אונליין) ----
  { id: "cat-onl-4", name: "כרטיסיית אונליין · 4 אימונים", kind: "zoom", billing: "package", price: 1040, units: 4, online: true, active: true },
  { id: "cat-onl-8", name: "כרטיסיית אונליין · 8 אימונים", kind: "zoom", billing: "package", price: 2000, units: 8, online: true, active: true },
  { id: "cat-onl-12", name: "כרטיסיית אונליין · 12 אימונים", kind: "zoom", billing: "package", price: 2880, units: 12, online: true, active: true },
  // ---- personal 1-on-1 (אימונים אישיים) — raised, premium ----
  { id: "cat-per-1", name: "אימון אישי בודד", kind: "personal", billing: "session", price: 370, active: true },
  { id: "cat-per-4", name: "כרטיסיית אישי · 4 אימונים", kind: "personal", billing: "package", price: 1520, units: 4, active: true },
  { id: "cat-per-8", name: "כרטיסיית אישי · 8 אימונים", kind: "personal", billing: "package", price: 2800, units: 8, active: true },
  { id: "cat-per-12", name: "כרטיסיית אישי · 12 אימונים", kind: "personal", billing: "package", price: 3960, units: 12, active: true },
];
