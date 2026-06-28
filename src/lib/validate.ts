// ---------------------------------------------------------------------------
// Pure input validation (no React / Firebase) for the registration form.
// ---------------------------------------------------------------------------

export function normalizePhone(p: string): string {
  return p.replace(/[^\d+]/g, "");
}

/**
 * A valid Israeli mobile number. Accepts 05XXXXXXXX (10 digits), +9725XXXXXXXX
 * or 9725XXXXXXXX. Enforces the exact length, so 20 random digits are rejected.
 */
export function isValidILPhone(p: string): boolean {
  return /^(\+?972|0)5\d{8}$/.test(normalizePhone(p));
}

/** Normalize to the local 05X-XXXXXXX display form. */
export function formatILPhone(p: string): string {
  const n = normalizePhone(p).replace(/^\+?972/, "0");
  return /^0\d{9}$/.test(n) ? `${n.slice(0, 3)}-${n.slice(3)}` : p;
}

/** Israeli cities for the registration address dropdown. */
export const IL_CITIES = [
  "תל אביב-יפו", "ירושלים", "חיפה", "ראשון לציון", "פתח תקווה", "אשדוד",
  "נתניה", "באר שבע", "בני ברק", "חולון", "רמת גן", "אשקלון", "רחובות",
  "בת ים", "בית שמש", "כפר סבא", "הרצליה", "חדרה", "מודיעין-מכבים-רעות",
  "נצרת", "לוד", "רמלה", "רעננה", "ראש העין", "גבעתיים", "הוד השרון",
  "קריית גת", "נהריה", "אילת", "עפולה", "קריית אתא", "קריית מוצקין",
  "קריית ביאליק", "נס ציונה", "יבנה", "דימונה", "טבריה", "אור יהודה",
  "כפר יונה", "גן יבנה", "יהוד-מונוסון", "נשר", "קריית אונו", "מעלה אדומים",
  "אחר",
];
