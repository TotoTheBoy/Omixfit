// ---------------------------------------------------------------------------
// Date helpers - Israeli convention: week starts Sunday.
// All dates are handled as local YYYY-MM-DD strings to avoid timezone drift.
// ---------------------------------------------------------------------------

export const HEB_DAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
export const HEB_DAYS_LONG = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
];
export const HEB_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Sunday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - copy.getDay()); // getDay(): 0 = Sunday
  return copy;
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return toKey(a) === toKey(b);
}

export function isToday(key: string): boolean {
  return key === toKey(new Date());
}

/** "18:30" from minutes-from-midnight. */
export function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function endMin(startMin: number, durationMin: number): number {
  return startMin + durationMin;
}

/** "ראשון · 28 ביוני" */
export function fmtDayHeading(d: Date): string {
  return `${HEB_DAYS_LONG[d.getDay()]} · ${d.getDate()} ב${HEB_MONTHS[d.getMonth()]}`;
}

/** "28-4 ביולי" style range label for a week. */
export function fmtWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  if (weekStart.getMonth() === end.getMonth()) {
    return `${weekStart.getDate()}-${end.getDate()} ב${HEB_MONTHS[end.getMonth()]}`;
  }
  return `${weekStart.getDate()} ב${HEB_MONTHS[weekStart.getMonth()]} - ${end.getDate()} ב${HEB_MONTHS[end.getMonth()]}`;
}

export function nowMinutesInto(dateKey: string, startMin: number): number {
  // Minutes from now until the session start (negative if already started).
  const start = fromKey(dateKey);
  start.setMinutes(startMin);
  return Math.round((start.getTime() - Date.now()) / 60000);
}

/** Friday evening → Saturday: facility runs reduced/closed (plan.md §5.1). */
export function isShabbat(d: Date): boolean {
  return d.getDay() === 6; // Saturday
}

/** "לפני 3 שעות" style relative time, Hebrew. */
export function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "כעת";
  if (min < 60) return `לפני ${min} דק׳`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `לפני ${hr} שע׳`;
  const days = Math.round(hr / 24);
  if (days < 7) return `לפני ${days} ימים`;
  const d = new Date(ts);
  return `${d.getDate()} ב${HEB_MONTHS[d.getMonth()]}`;
}
