// ---------------------------------------------------------------------------
// The official Israeli gym pre-activity health questionnaire (הצהרת בריאות,
// תקנות מכוני כושר 2015 - the "tofes 101" form), recreated natively. Shared by
// the registration form, the medical-flag logic, and the emailed PDF/summary so
// there's a single source of truth for the questions.
// ---------------------------------------------------------------------------

export type HealthQKey =
  | "heartDisease"
  | "chestPainRest"
  | "chestPainDaily"
  | "chestPainExercise"
  | "dizziness"
  | "lostConsciousness"
  | "asthmaMeds"
  | "asthmaBreath"
  | "familyHeartDeath"
  | "familySuddenDeath"
  | "medicalSupervision"
  | "chronicIllness"
  | "pregnant";

export interface HealthQItem {
  key: HealthQKey;
  label: string;
  hint?: string;
}
export interface HealthQGroup {
  heading: string;
  items: HealthQItem[];
}

/** Part A - the questionnaire, grouped exactly as the regulatory form. A "yes"
 *  (true) on any item means the trainee must bring a doctor's certificate. */
export const HEALTH_GROUPS: HealthQGroup[] = [
  {
    heading: "האם הרופא שלך אמר לך שאת/ה סובל/ת ממחלת לב?",
    items: [{ key: "heartDisease", label: "סובל/ת ממחלת לב" }],
  },
  {
    heading: "האם את/ה חש/ה כאבים בחזה:",
    items: [
      { key: "chestPainRest", label: "בזמן מנוחה" },
      { key: "chestPainDaily", label: "במהלך פעילויות שגרה ביום־יום" },
      { key: "chestPainExercise", label: "בזמן ביצוע פעילות גופנית" },
    ],
  },
  {
    heading: "האם במהלך השנה החולפת:",
    items: [
      {
        key: "dizziness",
        label: "איבדת שיווי משקל עקב סחרחורת",
        hint: "סמן/י \"לא\" אם הסחרחורת נבעה מנשימת יתר (כולל בפעילות גופנית נמרצת)",
      },
      { key: "lostConsciousness", label: "איבדת את הכרתך" },
    ],
  },
  {
    heading: "האם אובחנת עם אסטמה, ובשלושת החודשים האחרונים:",
    items: [
      { key: "asthmaMeds", label: "נזקקת לטיפול תרופתי" },
      { key: "asthmaBreath", label: "סבלת מקוצר נשימה או צפצופים" },
    ],
  },
  {
    heading: "האם אחד מבני משפחתך מדרגת קרבה ראשונה נפטר:",
    items: [
      { key: "familyHeartDeath", label: "ממחלת לב" },
      {
        key: "familySuddenDeath",
        label: "ממוות פתאומי בגיל מוקדם",
        hint: "לפני גיל 55 אם מדובר בגבר, ולפני גיל 65 אם מדובר באישה",
      },
    ],
  },
  {
    heading: "האם הרופא שלך אמר לך ב-5 השנים האחרונות לבצע פעילות גופנית רק תחת השגחה רפואית?",
    items: [{ key: "medicalSupervision", label: "נדרשת השגחה רפואית" }],
  },
  {
    heading:
      "האם את/ה סובל/ת ממחלה כרונית שאינה נזכרת לעיל, שעשויה למנוע או להגביל אותך מביצוע פעילות גופנית?",
    items: [{ key: "chronicIllness", label: "מחלה כרונית מגבילה" }],
  },
  {
    heading: "האם את/ה בהריון?",
    items: [{ key: "pregnant", label: "בהריון" }],
  },
];

/** Flat list of every question key (for validation / flag logic). */
export const HEALTH_KEYS: HealthQKey[] = HEALTH_GROUPS.flatMap((g) => g.items.map((i) => i.key));

/** Short Hebrew label per key - used in the emailed summary of flagged answers. */
export const HEALTH_LABELS: Record<HealthQKey, string> = Object.fromEntries(
  HEALTH_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])),
) as Record<HealthQKey, string>;
