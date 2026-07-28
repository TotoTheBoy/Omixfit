// Version stamp for the binding legal documents. Every recorded click-wrap
// consent is tied to this version, so a later change to the wording is provable
// and doesn't retroactively "cover" an older signature. Bump this whenever the
// Terms / Privacy / Waiver text materially changes.
export const LEGAL_VERSION = "2026-07";

// Insurance policy (הכשרה) expiry. Drives a staff reminder to renew, since the
// policy is the backbone of the whole liability structure. Update on renewal.
export const POLICY_EXPIRY = "2026-08-31";
export const POLICY_LIMIT = 500000; // ₪ per case
export const POLICY_DEDUCTIBLE = 55000; // ₪ self-participation

/** Days until the policy expires (negative if already expired). */
export function policyDaysLeft(now: number = Date.now()): number {
  const [y, m, d] = POLICY_EXPIRY.split("-").map(Number);
  const exp = new Date(y, m - 1, d, 23, 59, 59).getTime();
  return Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
}
