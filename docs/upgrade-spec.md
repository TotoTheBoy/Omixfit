# Omixfit — Platform Upgrade Spec (2026-07)

Finalized upgrade / refactor / bug-fix backlog. Companion to
[`business.md`](business.md) and [`refactor-spec.md`](refactor-spec.md). Same
non-negotiables: Hebrew-first **RTL**, mobile-first, **WCAG 2.1 AA**, editorial
palette (cream / charcoal / muted olive-sage / champagne gold), and the
architecture boundary `engine.ts → store.ts → firestore.ts`.

## Decisions (locked)
- **WhatsApp:** email automation ships now over the existing Cloud Functions
  mailer; WhatsApp dispatch is left as a clean hook to wire up once a Business
  API provider (Twilio / Meta Cloud API) + credentials + approved templates
  exist. No fake sending.
- **Attendance (#14):** persistent — the existing hourly Cloud Function finalizes
  attendance after a class ends (default "Attended" + deduct one punch-card
  credit); coach flags absentees as **No-Show** to reverse.
- **Sequencing:** Batch A (quick frontend wins) first.

## Schema additions required
- **Membership expiry** (`User.validUntil` or on the active package) for #1
  "purchase stagnation" — today there is only `hasPass` / punch balance, no expiry.
- **`lessonPlans` / `notes` collection** for #11 (workout planner + task reminders).

## Missions
1. **Admin Overview Dashboard** — new admin summary page; only action-required items:
   inactivity (no attendance 1 mo), purchase stagnation (30 d past expiry),
   low-occupancy (0 bookings 2 consecutive weeks), pending approvals.
2. **Relocate Packages/Memberships into "My Orders"** — move the punch-card /
   subscription store into the Orders hierarchy with a premium, purchase-inviting layout.
3. **Dashboard card color story** — all 4 trainee metric cards premium + unique, a
   continuous sequence: charcoal → muted olive → champagne gold → warm cream (bordered).
4. **PWA install guide** — 2-option selection → clean step-by-step modal; auto-prompt
   (one-click install) wherever `beforeinstallprompt` is supported.
5. **Gender-neutral copy** — dual-gender slash phrasing app-wide (מתאמן/ת, נרשם/ה …).
6. **Footer cleanup** — drop build hash/dots; clean "Version X.Y.Z | © 2026 OMIXFIT.
   All Rights Reserved." + compliance links.
7. **Legal /terms page** — static route seeded with EULA / ToS / Privacy / Liability +
   Medical Waiver templates (fitness + sports-therapy). *Templates — review with counsel.*
8. **Live admin telemetry** — real bookings / transactions / derived favorite style;
   no manual override (favorite is already derived — verify + surface in admin).
9. **Checkout subtext** — replace the "…עדכני את עומר" line with a warm, professional
   "balance updates automatically shortly" message.
10. **Drag-and-drop reschedule + smart notify** — DnD class blocks in the manage grid;
    on drop-save, prompt to email every booked trainee (reuse mailer).
11. **Workout Planner & Notes** — task reminders (dashboard / tied to class hours) +
    tagged lesson-plan archive (browse / filter / reuse).
12. **Events fixes** — (a) auto-broadcast on publish (email now, WhatsApp hook later);
    (b) fix Copy-Link so it opens the individual event; (c) sync new events into the
    public landing slider.
13. **Roster medical alerts** — high-visibility icon next to any trainee with a flagged
    `healthForm` condition in the admin class roster (data already exists).
14. **Default-present attendance** — see Decisions; cron finalize + no-show override.

## Status
- **Batch A (frontend quick wins) — ✅ COMPLETE:** ✅ 3 cards · ✅ 6 footer · ✅ 9 checkout · ✅ 5 gender-neutral · ✅ 12b copy-link (per-event deep links) · ✅ 12c landing slider (live)
- **Batch B (content & surfaces) — ✅ COMPLETE:** ✅ 7 legal docs (real `/legal/<slug>` URLs) · ✅ 2 packages store relocated into "My Orders" · ✅ 4 PWA install (2-option modal + 1-click) · ✅ 13 roster medical alerts · ✅ 8 live telemetry (favorite + transactions, read-only)
- **Batch C (admin intelligence) — ✅ COMPLETE:** ✅ 1 admin overview dashboard (inactivity/stagnation/low-occupancy/pending, live) · ✅ 11 workout planner (tagged lesson-plan archive + task reminders, new Firestore collections)
- **Batch D (automation / backend) — ✅ COMPLETE:** ✅ 10 drag-drop reschedule + notify participants · ✅ 12a event broadcast email (WhatsApp hook TODO) · ✅ 14 attendance auto-finalize (cron + No-Show refund)

## 🎉 All 14 missions shipped (+ Forgot Password). Code-complete on `master`.

### Deploys the user runs to make the backend work live
```bash
# Firestore rules (#11 lessonPlans + taskReminders collections)
firebase deploy --only firestore:rules
# Cloud Functions (#12a broadcastEvent, #10 notifyScheduleChange, #14 finalizeAttendance)
firebase deploy --only functions
# or everything (build + hosting + rules) as usual:
npm run deploy   # = build + firebase deploy --only hosting,firestore:rules  (add functions if desired)
```
New Cloud Functions: `broadcastEvent`, `notifyScheduleChange`, and `finalizeAttendance`
(the last runs inside the existing hourly `sendReminders` ping — no new cron needed).
WhatsApp broadcast remains a documented hook pending a Business API provider.

### Tenant UX polish (proactive)
- **Admin:** the class roster now shows the coach's injury/adaptation `trainerNotes`
  during class (beside the medical flag); the Overview's flagged clients are
  **tap-to-call** for the retention follow-up.
- **Trainee:** a low punch-card balance (≤ 2 left) shows a **renewal nudge** right
  above the relocated store in "My Orders".

### Extras (out-of-band requests)
- **Forgot Password** on the login page — Firebase `sendPasswordResetEmail` (the
  emailed reset link is the verification factor). Reset mode hides the password
  field; privacy-safe messaging (no account enumeration). Default Firebase reset
  email is used; can be branded in the console or via a Cloud Function later.

### Notes
- Legal docs live at real, shareable URLs (`/legal`, `/legal/eula`, …) via the SPA
  rewrite; footer compliance link points there. Templates carry a review-with-counsel
  disclaimer. The in-app `Legal` modal (Landing footer) shows the same 4 docs.
