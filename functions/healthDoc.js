// ---------------------------------------------------------------------------
// Smart rule-based summary of a submitted health declaration, for the body of
// the e-mail Omer receives. (The PDF itself is rendered in the browser and sent
// as a data URL - see src/lib/healthPdf.ts.) Mirrors src/lib/health.ts.
// ---------------------------------------------------------------------------

// key → short Hebrew label (matches src/lib/health.ts HEALTH_LABELS).
const HEALTH_ITEMS = [
  ["heartDisease", "מחלת לב"],
  ["chestPainRest", "כאב בחזה במנוחה"],
  ["chestPainDaily", "כאב בחזה בשגרה"],
  ["chestPainExercise", "כאב בחזה במאמץ"],
  ["dizziness", "סחרחורת / אובדן שיווי משקל"],
  ["lostConsciousness", "אובדן הכרה"],
  ["asthmaMeds", "אסטמה - טיפול תרופתי"],
  ["asthmaBreath", "אסטמה - קוצר נשימה"],
  ["familyHeartDeath", "מוות ממחלת לב במשפחה"],
  ["familySuddenDeath", "מוות פתאומי מוקדם במשפחה"],
  ["medicalSupervision", "נדרשת השגחה רפואית"],
  ["chronicIllness", "מחלה כרונית מגבילה"],
  ["pregnant", "בהריון"],
];

/** Smart, rule-based summary of the questionnaire (goes in the e-mail body). */
function buildHealthSummary(form) {
  const flagged = HEALTH_ITEMS.filter(([k]) => form && form[k] === true).map(([, label]) => label);
  if (flagged.length === 0) {
    return {
      flagged: [],
      headline: "✓ תקין לחלוטין - אין דגלים רפואיים",
      body: "המתאמן/ת ענה/תה \"לא\" על כל שאלות השאלון הרפואי. אין צורך בתעודה רפואית לפי ההצהרה.",
    };
  }
  const cert = form.hasMedicalCert
    ? "צורפה תעודה רפואית (מצורפת למייל)."
    : "טרם צורפה תעודה רפואית - יש לוודא שתומצא לפני תחילת האימונים.";
  return {
    flagged,
    headline: `⚠️ לתשומת לבך - סומן "כן" ל-${flagged.length} סעיפים`,
    body: `סומן "כן" ל: ${flagged.join(" · ")}.\nלפי תקנות מכוני כושר נדרשת תעודה רפואית מרופא לפני תחילת האימונים. ${cert}`,
  };
}

module.exports = { buildHealthSummary, HEALTH_ITEMS };
