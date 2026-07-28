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

// Substitute (non-owner) instructor vicarious-liability cover: up to 30 days per
// policy year; warn as it approaches. Policy year = the 12 months ending at expiry.
export const SUBSTITUTE_DAY_LIMIT = 30;
export const SUBSTITUTE_WARN_AT = 25;
export function policyYearStartKey(): string {
  const [y, m, d] = POLICY_EXPIRY.split("-").map(Number);
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
