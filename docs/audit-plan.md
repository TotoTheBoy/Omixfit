# Omixfit — App-wide Robustness & Security Audit + Upgrade Plan

Triggered by the "approval-gate grandfathering" hole. This reviews the **same
classes of defect** across the whole app — code, security, data, UX, design —
and lists, per item: **Where**, **Risk (what breaks / what gives a "reject")**,
and **Fix (what to upgrade)**. Ordered by severity: **P0 critical → P3 polish.**

---

## STATUS (implementation)

- ✅ **P1.1/P1.2 crash-hardening** — shipped (null-safe lookups, empty-state guards).
- ✅ **P0.5 + P2.3 function cleanup** — shipped (debugUser removed, RESET_KEY isolated, notifyHealthSubmission owner/staff-gated).
- ✅ **P1.3 + P2.6 guards + validation** — shipped (approved allow-list, amount>0, email normalization, class-type dedupe).
- ✅ **P2.5 + P2.1 confirmations + await/toast** — shipped (reusable confirm() modal on all destructive actions; write failures surface).
- ✅ **P2.2 cascade** — shipped (event→signups; the rest already cascaded/blocked).
- ✅ **P0.1/P0.3/P0.4 rules + staff custom claim (WRITES)** — shipped + deployed. **Self-approval is now impossible**; management collections are staff-write only; owners are staff-by-identity (no lockout).
- ⏳ **P0.2 read-scoping (health-data READ privacy)** — NOT yet shipped. This is the one item that requires a client data-loading refactor and can't be verified headlessly; deploying it wrong would break member data loading on the live app. Pending a decision on approach + rollout.

---

Legend: 🔴 P0 exploitable/critical · 🟠 P1 crash or gate bypass · 🟡 P2 reliability/
data/UX · ⚪ P3 polish. "Reject" = the condition that makes the flow fail or be
unsafe.

---

## 🔴 P0 — Critical security (Firestore rules can be bypassed via the SDK)

The rules use `allow read/write: if signedIn()` almost everywhere. The UI gates
behavior, but **any authenticated user can bypass the UI and talk to Firestore
directly**. The rules file even documents this limitation. We're on Blaze, so we
can fix it with **custom claims** (a staff flag set by a Cloud Function).

### P0.1 — A member can self-approve (bypasses your manual approval entirely)
- **Where:** `firestore.rules` → `match /users/{uid} { allow update: if signedIn() && (notSettingAdmin() || isOwnerEmail()) && (notEditingAdmin() || isOwnerEmail()); }`
- **Risk:** The only thing blocked is the *admin* role. A signed-in member can `updateDoc(users/<theirUid>, { approvalStatus: "approved", membershipActive: true, role: "manager" })` from the console/SDK → instant full access + booking, **without you approving anyone**. This defeats the entire approval model you insisted on. They can also edit **other** non-admin users' docs.
- **Fix:**
  - Add a server-verified **staff custom claim** (`staff: true`) set by a Cloud Function (admin/manager/instructor), refreshed on role change.
  - Rules: a member may write **only their own** doc, and may **not** set/modify `role`, `approvalStatus`, `membershipActive`, `memberNo`, `trainerNotes`, `coaching`. Only `request.auth.token.staff == true` may change those or write other users' docs. Approval/role/membership become staff-only.
  - Enforce `request.resource.data.id == uid` and `resource == null || request.auth.uid == uid || staff` on updates.

### P0.2 — Every trainee's health declaration + PII is readable by any signed-in user
- **Where:** `firestore.rules` → `match /users/{uid} { allow read: if signedIn(); }`
- **Risk:** Any member (even pending) can `getDocs(collection("users"))` and dump **every** trainee's `healthForm` (medical conditions, pregnancy, etc.), `idNumber` (ת"ז), phone, address, email. This is a **privacy-law / PHI breach** (חוק הגנת הפרטיות) and contradicts the health-form's confidentiality promise.
- **Fix (with the staff claim):**
  - Members read **only their own** user doc; **staff** read all.
  - This requires the client to stop listening to the *whole* `users` collection for members. Refactor member data-loading to a **single-doc** listener on their own user, and load only the fields a member needs (instructor display names come from `sessions`/a minimal public projection, not the full user records). Staff keep the collection listener.

### P0.3 — Any signed-in user can write/delete any session, booking, payment, service, price
- **Where:** `firestore.rules` → `sessions`, `bookings`, `services`, `payments`, `classTypes`, `locations`, `lessonPlans`, `taskReminders`, `announcements` all `allow write: if signedIn()`.
- **Risk:** A member can **delete the entire schedule**, fabricate or delete **payments** (revenue integrity), change **prices**, cancel/create **bookings for other people**, post fake **announcements**, edit **lesson plans**. Total data-integrity and financial exposure.
- **Fix (with the staff claim):**
  - `sessions`, `classTypes`, `services`, `payments`, `locations`, `lessonPlans`, `taskReminders`, `announcements`: **read** as appropriate (some public), **write: staff only**.
  - `bookings`: a member may create/cancel **only their own** booking (`request.resource.data.userId == request.auth.uid`), staff may write any; keep the atomic capacity counter.
  - `payments`, `services`: staff-only read+write (revenue privacy) — the file already flags "on Blaze these tighten to staff-only."

### P0.4 — `isOwnerEmail()` in rules is stale (3 emails) vs client (5)
- **Where:** `firestore.rules` `isOwnerEmail()` lists only office@, omer@, omerido20@; client `OWNER_EMAILS` now has 5 (added guy.lifshitz98@, help@).
- **Risk:** guy@ / help@ are treated as admins by the client but the **rules** won't let them grant/hold admin → inconsistent behavior, potential lock-out of admin actions.
- **Fix:** Sync the rules list with the client (single source ideally via custom claim); include all 5.

### P0.5 — Destructive/diagnostic HTTP endpoints share one key
- **Where:** `functions/index.js` `resetUsers` + `debugUser` protected by `process.env.REMINDER_KEY` (also used by the hourly `sendReminders` cron).
- **Risk:** `resetUsers` **wipes all users/data**; `debugUser` **exposes account data**. They share the reminder key; if that key leaks (it's passed in cron URLs/logs), someone can nuke or scrape the system.
- **Fix:** (1) **Delete `debugUser`** now (it was a one-off diagnostic). (2) Give `resetUsers` its **own** strong secret (separate env var) or convert it to an **admin-only callable** with an explicit `confirm` payload, and remove it after go-live. (3) Rotate `REMINDER_KEY`.

---

## 🟠 P1 — Crashes on missing references (white-screen) & remaining permissive gates

### P1.1 — `array.find(id)!` on deleted references (the "readableInk/avatarColor" bug, generalized)
Non-null assertions assume a referenced entity always exists. After deletions
(members, instructors, sessions, class types, services) the reference dangles and
the `!` throws → **the whole screen white-screens**. This is exactly the risk
that already hit the Trainees list.
- **Where (all `.find(...)!`):**
  - `engine.ts:146` `classTypeOf` — session → deleted classType. Used on **every** class card/calendar/schedule row. **Highest blast radius.**
  - `SessionDetail.tsx:34` + `ClassCard.tsx:23` `users.find(session.instructorId)!` — **After the reset all non-admin instructors were deleted, so every session now has a dangling `instructorId` → opening/rendering a class crashes.** Live risk right now.
  - `engine.ts:168/197/226/279/289/343`, `Reports.tsx:44/48/62/77`, `Members.tsx:199`, `SessionDetail.tsx:47/51` — booking → deleted session/user, favourite category → deleted classType, etc.
- **Fix:** Make these **null-safe**: return a safe fallback (e.g., `classTypeOf` returns a placeholder `{ name: "שיעור", category: "other" }`), and **filter out** bookings/sessions whose refs are missing before mapping. Add a shared `getClassType(s, id) | undefined` and `getUser(s, id) | undefined` and use them everywhere instead of `find(...)!`.

### P1.2 — Direct `array[0]` access (empty-array crash)
- **Where:** `Profile.tsx:109`, `Schedule.tsx:101`, `Manage.tsx:97` `data.locations[0].name`; `SessionEditor.tsx:32` `data.classTypes[0].id` (used in `useState`), `:92` `data.locations[0].id`. (`Trainees.tsx:21` correctly uses `?.`.)
- **Risk:** If `locations`/`classTypes` are ever empty (fresh project, a reset that also clears them, a load race), these crash. `SessionEditor` crashes on **open** if there are no class types.
- **Fix:** Use `?.` + fallbacks; guard `SessionEditor` with an empty-state ("צור/י קודם סוג שיעור") when `classTypes.length === 0`.

### P1.3 — Permissive status guards (`!== "pending"` etc.)
- **Where:** `engine.ts:510` `.filter(u => u.membershipActive && u.approvalStatus !== "pending")` (retention list) — includes `undefined`/`rejected`. The general anti-pattern of `x !== "bad"` instead of `x === "good"`.
- **Risk:** Rejected/statusless accounts get counted/treated as legitimate members in analytics and any similar filter. Same class as the fixed gate.
- **Fix:** Prefer explicit allow-lists (`approvalStatus === "approved"`) across engine filters, roster, dashboards, retention.

---

## 🟡 P2 — Reliability, data integrity, function hardening, UX safety

### P2.1 — Silent write failures (fire-and-forget mutations)
- **Where:** ~45 store mutations are `(...) => backend().then(b => b.x(...))`; **most callers don't await or catch**. (The "+ שיעור חדש" false-success was one instance — already fixed.)
- **Risk:** A rejected/failed write (permission, offline, App Check) shows **success** in the UI while nothing persisted — the user thinks it worked. Silent data loss + confusion.
- **Fix:** Standardize: mutations return the promise; **await + toast on error** in the callers of the important ones (book/cancel, approve/reject, record payment, save service/session/plan, delete). Add a small `withToast(promise, okMsg, errMsg)` helper. Consider a global unhandled-rejection → error toast.

### P2.2 — No cascade cleanup → orphaned references
- **Where:** `deleteService`, `deleteSession`/`cancelSession`, `TypeEditor` delete (classType), lead/reminder/plan deletes. Only `deleteMember` cascades (bookings/eventSignups/calTokens).
- **Risk:** Deleting a **classType** leaves sessions pointing to nothing (→ P1.1 crashes). Deleting a **service** leaves payments referencing it. Deleting a **session** should remove its bookings + refund credits (does cancel do this?). Orphans accumulate and crash renders.
- **Fix:** On delete of classType/service/session, either **block if referenced** ("יש שיעורים המשתמשים בסוג זה") or **cascade** (delete/deactivate dependents, refund credits on session removal). Add referential-integrity checks.

### P2.3 — Under-protected callable: `notifyHealthSubmission`
- **Where:** `functions/index.js:728` — checks only `context.auth`, then reads `userId` from the payload and emails Omer the PDF/cert for **any** userId.
- **Risk:** A member can call it with an arbitrary `userId`/attachment → **spam Omer's inbox** with fake "new application" mails, or trigger emails for other users.
- **Fix:** Require `context.auth.uid === data.userId` **or** staff. Rate-limit.

### P2.4 — Auth/session lifecycle edge cases
- **Where:** deletion → token revocation timing; email-verification bypass; App-Check not initialized (client has no App Check even though the rules/Console may enforce it — headless was denied, real browsers pass — verify enforcement state); the Firestore **offline cache** can serve stale docs (root of the totoboy re-admit — mitigated by the uid-match fix).
- **Risk:** A just-deleted user's ID token stays valid up to ~1h unless the client refreshes; stale cache can momentarily show removed data.
- **Fix:** Keep the uid-match + strict-gate fixes; consider `clearIndexedDbPersistence` on hard-logout; document the App Check enforcement decision; the hourly orphan sweep already limits lingering auth.

### P2.5 — Destructive actions with no confirmation
- **Where:** one-tap deletes without a confirm step: `deleteLead` (Members:116), `deleteReminder` (Planner:94), `deleteService` (Finance:344), `cancelSession`/`deleteSession` (SessionEditor:108/115), announcement delete (AnnouncementsAdmin:98), subscription delete (Billing:154). (`deleteMember` has a confirm — good.)
- **Risk:** A mis-tap permanently deletes a class (+ participants' bookings), a price, a lead. No undo.
- **Fix:** Add a confirm step (two-tap or dialog) to all destructive actions, and success/undo toasts where feasible.

### P2.6 — Input validation gaps
- **Where:** health form / registration (ID has check-digit ✓, phone ✓, city ✓ — good); but payment `amount` (free number, negative?), session date/time (past dates allowed), duplicate class-type names, email normalization on write, memberNo race under heavy concurrency (transaction ✓).
- **Risk:** Negative/zero payments, classes created in the past, inconsistent data.
- **Fix:** Validate amounts > 0, warn on past-date sessions, trim/lowercase emails consistently, dedupe names.

---

## ⚪ P3 — UX / design consistency & polish

- **Loading states:** many async actions lack a pending/disabled state (a few buttons do). Standardize `busy` on every submit/delete.
- **Empty states:** present in most lists; verify every list (payments, plans, announcements, roster, bookings) has an honest empty state (mostly done).
- **Error surfacing:** tie to P2.1 — every failed action should toast, never fail silently.
- **Consistency:** button variants, spacing, the `--surface-2` chip vs `.count-chip` (fixed), dashes normalized (done), contrast (0 axe violations — keep it green after changes).
- **Accessibility:** keep the WCAG 2.1 AA bar (currently 0 violations) as changes land; re-run the harness axe sweep after each batch.
- **Design:** the render-harness lets us screenshot every screen headlessly — add a CI-style visual/overflow/a11y sweep to catch regressions.
- **Copy:** legal docs rewritten (done); keep the "verify with a lawyer" note; fill business registration details.

---

## Recommended execution order

1. **P0.1 + P0.3 + P0.4 (rules + staff custom claim):** the single most important upgrade — set a `staff` claim via a Cloud Function on role assignment, then rewrite the rules so members can only touch their own booking + own profile (never approvalStatus/role/membership), and staff-gate sessions/services/payments/other-users. This closes self-approval + destructive writes together.
2. **P0.2 (read scoping):** members read only their own user doc; refactor member data-loading to a single-doc listener; staff keep the collection. Protects the health data.
3. **P0.5:** delete `debugUser`, isolate the reset key, rotate `REMINDER_KEY`.
4. **P1.1 + P1.2:** null-safe `classTypeOf`/user/instructor lookups + array-access guards (immediate crash-prevention — the dangling-instructor crash is live post-reset).
5. **P2.1 + P2.5:** await/toast on important mutations; confirmations on destructive actions.
6. **P2.2:** referential-integrity/cascade on deletes.
7. **P1.3 + P2.3 + P2.6:** explicit status allow-lists, tighten `notifyHealthSubmission`, input validation.
8. **P3:** UX/design consistency sweeps, CI harness checks.

### Note on the Spark→Blaze rules limitation
The rules file assumes Spark (no server-verified roles). The project is on **Blaze**
(Cloud Functions run). That unblocks **custom claims**, which is the key that makes
P0.1–P0.3 properly enforceable. This is the backbone of the whole hardening effort.
