# אומיקספיט · Omixfit

A sporty, Hebrew‑first **RTL PWA** for booking fitness classes — built from
[`docs/plan.md`](docs/plan.md). Trainees browse the week and book a spot in one
tap; trainers/managers publish and manage the schedule.

> **Stack:** Vite + React + TypeScript, hand‑crafted CSS design system, zero
> runtime UI dependencies. State persists to `localStorage` (a real backend
> swaps in behind the same store API).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run preview    # serve the production build on :4173
npm test           # runtime smoke test of the booking engine (18 checks)
npm run icons      # regenerate PWA icons
npm run shots      # visual QA — screenshot every screen via headless Chrome
npm run a11y       # automated WCAG 2.1 AA audit (axe-core) — 0 violations, 9 surfaces
npm run focus      # keyboard test: modal focus trap + restore (5 checks)
```

> **Visual QA:** `scripts/shots.mjs` drives system Chrome (via `puppeteer-core`,
> no bundled Chromium) against the preview server and writes `screenshots/*.png`
> for every screen at desktop + mobile widths. Run `npm run preview` first.

The app opens as **דנה פרץ (a member)**. Use the **user switcher** (top‑left)
to log in as נועה (manager) or an instructor and see the management side.

## What works today

**Trainee**
- Weekly calendar, RTL, **week starts Sunday**, Hebrew dates; navigate weeks.
- Day strip with per‑day class counts; Shabbat marked as reduced activity.
- Class cards: time, instructor, room, live **spots‑remaining** bar, category color.
- Category filters; tap a card → detail sheet with description + book/cancel.
- **Waitlist** (§4.3 / Q4): when full, join the waitlist and see your position;
  on a cancellation the first in line is **auto‑promoted** to confirmed.
- **My Bookings** (upcoming / past) with empty‑state onboarding.

**Trainer / Manager**
- Week grid (7 columns) with fill counts; KPI tiles (sessions, booked, fill‑rate).
- Create a session (type, date, time, duration, capacity, instructor, room).
- **Recurrence**: generate 1 / 4 / 8 weekly occurrences in one action.
- Edit / cancel / delete a session; cancelling notifies (toast stand‑in).
- **Roster** with names + phones and **attendance / no‑show** marking.
- **Class‑type catalog** (טמפלייטים) — create/edit/delete class types, with a
  delete‑guard while sessions still reference a type.
- **Reports dashboard** (plan.md §4.6) — utilization, attendance vs. no‑show
  rate, most‑popular classes, attendance‑by‑weekday (Shabbat shown closed),
  and a member attendance leaderboard.
- **Member management** (§4.6 / §4.1) — searchable member list; per‑member sheet
  with role assignment, membership activation toggle, stats, recent activity.
- **Audit log** (§4.6) — every manager action (create/edit/cancel/delete session
  or type, role/membership change) is recorded with actor + relative time, shown
  as a timeline in the Reports tab.

**Profile (everyone)**
- Membership card (plan, status, validity), personal stats (attended / upcoming
  / favorite style), editable name + phone, notification preferences
  (push / WhatsApp / email + reminder lead time).
- Booking success fires a confetti **celebration** micro‑interaction.

**Platform**
- Installable PWA (manifest, service worker offline shell, generated icons).
- iOS / Android install guidance banner.
- Atomic capacity enforcement, booking window, cancellation cutoff, anti‑hoarding
  limit, membership gating — all verified by `npm test` (12 checks).

## Architecture

```
src/
  lib/        types · date (Sunday-start, Hebrew) · i18n · seed · store (booking engine)
  components/ ClassCard · SessionDetail · SessionEditor · UserSwitcher · Sheet · Toast · icons
  screens/    Schedule (trainee) · MyBookings · Manage (trainer)
  styles/     theme.css (tokens + primitives) · app.css (layout + screens)
public/       manifest · sw.js · icons
```

Product decisions (Q1–Q8 from the plan) are baked in: instructor is a real role;
booker names are **staff‑only** (privacy); booking is gated on `membershipActive`;
`locationId` lives on every session; the `Booking` state enum already includes
`waitlisted`/`no_show` for v2.

## Iteration status (Ralph loop)

- [x] **i1** — Scaffold, design system, data layer + booking engine, both
      experiences, PWA. Smoke test (12 checks).
- [x] **i2** — Member profile + membership card, notification preferences,
      class‑type catalog manager, booking celebration. Smoke test now 17 checks.
- [x] **i3** — Headless‑Chrome visual QA harness (real screenshots); fixed
      persist‑on‑load; richer seed (18 members, resolved past attendance);
      manager Reports dashboard. Smoke test now 18 checks.
- [x] **i4** — Member management (search, role assignment, membership toggle);
      accessibility pass to **WCAG 2.1 AA, 0 axe violations** (contrast, skip
      link, focus rings, aria‑current/live, fixed a nested‑interactive card).
- [x] **i5** — Audit log (§4.6: who changed/cancelled what) with live logging on
      every manager mutation + seeded history; keyboard arrow‑nav across the
      calendar day strip. Smoke test now 20 checks.
- [x] **i6** — Waitlist (§4.3 / Q4): join when full, FIFO position, auto‑promote
      on cancellation or capacity increase, staff waitlist roster, My‑Bookings
      badge. Smoke test now 28 checks; axe still 0 violations.
- [x] **i7** — Live clock tick (§5.3): the schedule + My Bookings refresh
      time‑dependent state (booking window closing, sessions rolling into the
      past) without a user interaction.
- [x] **i8** — Error boundary (§5.6 graceful degradation): a runtime render
      error shows an on‑brand Hebrew fallback with reload + reset‑data recovery,
      instead of a blank page.
- [x] **i9** — Extended the axe audit to the **modal/sheet states** (9 surfaces,
      not 4); found & fixed 6 real violations: unlabeled form controls (session /
      profile / type editors), low‑contrast attendance toggles, and avatar
      initials — now auto‑pick dark/white for AA on any palette color.
- [x] **i10** — Verified the console is clean across all screens/modals, then
      fixed a real **modal focus** defect axe can't see: the `Sheet` now moves
      focus in on open, **traps Tab**, and restores focus to the trigger on
      close (WCAG 2.4.3). New `npm run focus` keyboard test (5 checks).

**MVP + v1 coverage of `docs/plan.md` is complete.** Deferred to a true v2 (per
the §6 decisions): a payments/billing engine, no‑show penalty strikes,
multi‑branch UI, and real‑time multi‑client spot‑counts via WebSocket/SSE (the
client now self‑refreshes on a timer; cross‑client push needs a backend) — all
have data‑model hooks already in place (`membershipActive`, `no_show`,
`locationId`).
