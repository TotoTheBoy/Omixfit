// ---------------------------------------------------------------------------
// Health-declaration document + summary for the e-mail Omer receives when a
// registrant submits. Mirrors src/lib/health.ts (functions can't import the TS).
// The PDF uses an embedded Hebrew font and bidi-reorders each (short) line so
// Hebrew renders correctly right-to-left.
// ---------------------------------------------------------------------------
const path = require("path");
const PDFDocument = require("pdfkit");

// Full Rubik (Hebrew + Latin). pdfkit/fontkit does bidi reordering itself, so we
// pass logical order and just align right — no manual reversal.
const FONT = path.join(__dirname, "assets", "Rubik-Regular.ttf");

// key → short Hebrew label (must match src/lib/health.ts HEALTH_LABELS order).
const HEALTH_ITEMS = [
  ["heartDisease", "מחלת לב"],
  ["chestPainRest", "כאב בחזה במנוחה"],
  ["chestPainDaily", "כאב בחזה בשגרה"],
  ["chestPainExercise", "כאב בחזה במאמץ"],
  ["dizziness", "סחרחורת / אובדן שיווי משקל"],
  ["lostConsciousness", "אובדן הכרה"],
  ["asthmaMeds", "אסטמה — טיפול תרופתי"],
  ["asthmaBreath", "אסטמה — קוצר נשימה"],
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
      headline: "✓ תקין לחלוטין — אין דגלים רפואיים",
      body: "המתאמן/ת ענה/תה \"לא\" על כל שאלות השאלון הרפואי. אין צורך בתעודה רפואית לפי ההצהרה.",
    };
  }
  const cert = form.hasMedicalCert
    ? "צורפה תעודה רפואית (מצורפת למייל)."
    : "טרם צורפה תעודה רפואית — יש לוודא שתומצא לפני תחילת האימונים.";
  return {
    flagged,
    headline: `⚠️ לתשומת לבך — סומן \"כן\" ל-${flagged.length} סעיפים`,
    body: `סומן \"כן\" ל: ${flagged.join(" · ")}.\nלפי תקנות מכוני כושר נדרשת תעודה רפואית מרופא לפני תחילת האימונים. ${cert}`,
  };
}

/** Build the health-declaration PDF as a Buffer. */
function buildHealthPdf(user, form) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("he", FONT);
    doc.font("he");

    const W = doc.page.width - 96; // content width (right-aligned)
    const right = (text, opts = {}) => doc.text(String(text == null ? "" : text), 48, doc.y, { width: W, align: "right", ...opts });
    const gold = "#a9842f";

    doc.fontSize(19).fillColor(gold);
    right("הצהרת בריאות — Omix");
    doc.moveDown(0.2).fontSize(10).fillColor("#666");
    right("טופס הצהרת בריאות למבקש/ת להתאמן (תקנות מכוני כושר)");
    doc.moveDown(0.6).fillColor("#111");

    const line = (label, value) => {
      doc.fontSize(11);
      right(`${label}: ${value || "—"}`);
      doc.moveDown(0.2);
    };
    doc.fontSize(13).fillColor(gold);
    right("פרטים אישיים");
    doc.moveDown(0.3).fillColor("#111");
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "";
    line("שם", name);
    line("תעודת זהות", user.idNumber);
    line("תאריך לידה", user.dob);
    if (user.age != null) line("גיל", String(user.age));
    line("מין", { female: "אישה", male: "גבר", other: "אחר" }[user.gender] || "");
    line("טלפון", user.phone);
    line("אימייל", user.email);
    line("כתובת", user.address);

    doc.moveDown(0.4).fontSize(13).fillColor(gold);
    right("שאלון רפואי");
    doc.moveDown(0.3);
    for (const [k, label] of HEALTH_ITEMS) {
      const yes = form && form[k] === true;
      doc.fontSize(11).fillColor(yes ? "#b0402f" : "#111");
      right(`${yes ? "כן" : "לא"}  —  ${label}`);
      doc.moveDown(0.15);
    }

    const sum = buildHealthSummary(form || {});
    doc.moveDown(0.4).fontSize(13).fillColor(gold);
    right("סיכום");
    doc.moveDown(0.3).fontSize(11).fillColor(sum.flagged.length ? "#b0402f" : "#2f6b3b");
    right(sum.headline);
    doc.moveDown(0.15).fillColor("#111").fontSize(10);
    for (const ln of sum.body.split("\n")) right(ln);

    if (form && form.notes) {
      doc.moveDown(0.4).fontSize(11).fillColor(gold);
      right("הערות");
      doc.moveDown(0.2).fillColor("#111").fontSize(10);
      right(form.notes);
    }

    doc.moveDown(0.6).fontSize(10).fillColor("#111");
    right(`חתימה: ${form && form.signedName ? form.signedName : name}`);
    const when = new Date(form && form.submittedAt ? form.submittedAt : Date.now()).toLocaleDateString("he-IL");
    right(`תאריך הגשה: ${when}`);

    doc.end();
  });
}

module.exports = { buildHealthPdf, buildHealthSummary, HEALTH_ITEMS };
