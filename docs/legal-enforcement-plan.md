# Legal-Enforcement Plan — backing the legal docs with code

Your lawyer's rule: the agreement is only as strong as the system that enforces it.
This plan turns the 7 "System Requirements" + the final legal wording into ordered
work. Each item notes current state → what's missing → how I'll build it.

Legend: ✅ already done · 🟡 partial · 🔴 not built.

---

## Phase 0 — Final legal text (low risk, first)
- Replace Terms / Privacy / Waiver in the app with the lawyer's FINAL wording
  (Terms §1–15, Privacy §1–10, Waiver §1–7), keeping the 1./1.1/1.1.1 numbering.
- Add a **document version** constant (e.g. `LEGAL_VERSION = "2026-07"`) so every
  recorded consent is tied to the exact text version (provable later).
- Rename the section to "מסמכים משפטיים מחייבים".

## Phase 1 — Click-wrap consent + marketing opt-in (Req 1 + 7) 🔴
- Three **separate, required, un-pre-ticked** checkboxes at the point of consent,
  each linking to its doc:
  1. תנאי השימוש והתקנון
  2. מדיניות הפרטיות + הסכמה להעברת מידע לשרתים בארה"ב
  3. הצהרת הבריאות וכתב הוויתור
- One **optional** 4th checkbox: קבלת תוכן שיווקי (SMS / וואטסאפ / דוא"ל).
- Submit is blocked until all three required boxes are ticked.
- **Evidence record:** on submit, a Cloud Function `recordConsent` stamps a
  **server timestamp + the user's IP + the doc version + which boxes** and writes
  it to the user (`consent: {...}`). (See Reservation R1 — IP must be server-side.)

## Phase 2 — Parent/guardian for minors (Req 5) 🔴
- DOB is already collected. Add an **age gate**: if DOB < 18, the flow switches to
  a guardian flow — the account holder/consenter is the **parent/guardian**, who
  supplies their own name, ID, phone and relationship, and ticks the checkboxes on
  the minor's behalf.
- Implementation (pragmatic — see R3): one trainee record for the minor, plus a
  `guardian: { name, idNumber, phone, relationship }` block; consent is recorded as
  the guardian's. No separate multi-profile account system.

## Phase 3 — Health: medical block + 12-month re-validation (Req 2 + 3) 🟡
Current: a "yes" answer lets the user *optionally* attach a certificate which is
**emailed** to the studio; approval is already manual; nothing is stored.
- **Medical block (Req 3):** any "yes" → status `pendingMedicalClearance`; booking
  is blocked; the user is **required** to upload a certificate; unblock only when a
  staff member presses **Approve** in the admin panel.
- **Certificate storage (see R2):** persist the uploaded file (Firebase Storage)
  instead of email-only, so there's a real medical audit trail on file.
- **12-month re-validation (Req 2):** store `healthDeclaredAt`; 12 months later,
  booking is blocked and a modal forces a fresh health re-declaration (which itself
  re-runs the medical-block check).

## Phase 4 — Hard-coded cancellation enforcement (Req 4) 🟡
Current: `cancelCutoffHours` exists (=3) but late cancels aren't hard-blocked or
auto-charged; free-cancel windows aren't per the new policy.
- Set the free-cancel cutoff to **12 hours** before any class (per Waiver §8.2.2).
- Inside the 12-hour window: the Cancel button either disables **or** shows a
  confirm — "ביטול כעת יחייב אותך באימון מלא. להמשיך?" — and on confirm the punch
  is **auto-deducted** (No-Show/late-cancel = used session). No silent free cancels.

## Phase 5 — Medical-data security rules (Req 6) ✅
Already shipped: health forms + ID numbers live in `users/{id}/private`, readable
only by the owner (self) and staff (`isStaff()` = owner e-mail OR `staff` claim).
Note (R7): I gate on `staff`, not strictly `admin` — instructors/managers can read
health for the roster medical-flag/safety use described in Privacy §4. If you want
it admin-only, that's a one-line change.

---

## Reservations / decisions to confirm BEFORE building

- **R1 — IP capture must be server-side.** A browser cannot reliably read its own
  public IP; I'll capture it in the `recordConsent` Cloud Function (which sees the
  request IP) together with a server timestamp. (Note: the IP itself is personal
  data — it's stored purely as consent evidence, consistent with the policy.)
- **R2 — Certificate storage needs Firebase Storage.** Today certs are only
  emailed, not stored. To *gate* on an uploaded cert and keep it on file, I need to
  enable Firebase Storage + its security rules. Alternative: keep email + a manual
  "cert received" toggle (less friction, weaker audit trail). **Decision needed.**
- **R3 — Parent-child model.** I recommend the pragmatic model (one minor-trainee
  record + guardian block + guardian is the legal consenter), not a full
  multi-profile "family account". **Decision needed.**
- **R4 — Cancellation window.** Confirm the effective free-cancel cutoff is **12
  hours before any class** (group + personal + online), and late/no-show = full
  charge + auto punch deduction. This replaces the old 2h-group / 24h-personal.
- **R5 — Refunds are NOT automated in code.** The 14-day consumer cancellation and
  the "no-refund, discretionary" policy are legal/manual processes handled by staff
  — the code only enforces class-cancellation windows and punch accounting, not
  money refunds. Confirming this is out of code scope.
- **R6 — Friction.** The medical hard-gate + 12-month re-validation add real
  friction (a flagged or lapsed user cannot book until acting). That's the point
  legally, but confirm you accept the UX cost.

## Suggested order of execution
Phase 0 (legal text) → Phase 4 (cancellation, small) → Phase 1 (consent, core) →
Phase 3 (health gate) → Phase 2 (guardian) → Phase 5 (verify). Each phase builds,
tests, and deploys independently.
