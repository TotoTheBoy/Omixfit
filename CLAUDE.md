# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Omixfit — a Hebrew-first, **RTL** PWA for booking fitness classes, built from the
product spec in [`docs/plan.md`](docs/plan.md). Two experiences in one app: a
**trainee** side (browse the week, book/cancel, waitlist) and a **trainer/manager**
side (publish schedule, rosters, reports, member management). Stack: Vite + React 18
+ TypeScript with a **hand-crafted CSS design system**. The backend is **Firebase**:
**Authentication** (email + password) for identity and **Cloud Firestore** for all
domain data — bookings, schedule, classes, users, audit — streamed live so the app
syncs in real time across devices. The Firebase SDK is the one heavy runtime dep
(code-split, off the critical bundle). State no longer lives in `localStorage`
(Firestore's persistent cache handles offline/cold loads).

## Commands

```bash
npm run dev        # Vite dev server on :5173
npm run build      # tsc --noEmit (type-check) + vite production build
npm run preview    # serve the built dist/ on :4173
npm test           # booking-engine smoke suite (esbuild-bundles test/smoke.ts, runs test/runner.mjs)
npm run icons      # regenerate PWA icons (scripts/gen-icons.mjs)
npm run fonts      # regenerate the self-hosted Rubik woff2 subsets
```

**Browser-driven test/QA scripts** (`a11y`, `e2e`, `focus`, `responsive`, `stress`,
`empty`, `lighthouse`, `offline`, `shots`, `showcase`): each drives **system Chrome**
via `puppeteer-core` (no bundled Chromium). Two hard requirements, or they fail
immediately:
1. **`npm run preview` must already be running** (they hit `http://localhost:4173`).
2. **Chrome must exist at the hardcoded macOS path** `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (defined as `CHROME` in each `scripts/*.mjs`). These scripts are macOS-only as written.

Typical verification loop: `npm run build` → `npm run preview &` → `npm run a11y`,
`npm run e2e`, etc.

`npm test` is a **single custom suite**, not a test framework — there is no per-test
filtering. Add or change checks by editing `test/smoke.ts` (it asserts the
booking-engine invariants against the **pure engine**, `src/lib/engine.ts`). Keep it
green; it's the fastest regression gate.

## Architecture (the parts that span files)

**Three-layer data flow: engine → store mirror → Firestore.**

- **`src/lib/engine.ts`** — the **pure** booking engine (no React, no Firebase):
  predicates (`bookability`, `actionFor`, `confirmedCount`, …) and reference
  transforms (`applyBook`/`applyCancel`/`applyJoinWaitlist`, `fillFromWaitlist`) over
  an `AppData` snapshot. This is the canonical algorithm and what `test/smoke.ts`
  asserts. Node-safe — imports only types + date.
- **`src/lib/store.ts`** — an in-memory **mirror** + `useSyncExternalStore`
  (`useStore(selector)`). It holds no firebase import: Firestore listeners call
  `hydrate()` to stream data in, components read selectors synchronously, and the
  exported mutations (`book`, `cancelBooking`, …) are thin **async** wrappers that
  dynamic-import the backend (so it's code-split AND the node smoke test never pulls
  firebase). Mutations are Promises now — `await` them where a return value is used.
- **`src/lib/firestore.ts`** — the only module importing the firestore SDK
  (code-split). Streams every collection via `onSnapshot` → `hydrate` (live
  cross-device sync), seeds the DB once if empty, and runs the mutations.

- **Atomic capacity is now a real Firestore transaction** (plan.md §4.4): `book()`
  reads the session doc's denormalized `confirmed` counter inside `runTransaction`
  and rejects if `>= capacity`, incrementing the counter in the same commit — safe
  across clients (a query can't run inside a transaction, hence the counter). The
  UI still counts the live `bookings` mirror for display.
- **Waitlist auto-promotion** (`promoteWaitlist`) runs on cancellation and capacity
  increase, FIFO by `createdAt`, each promotion re-checked in a transaction.
- **Seeding:** `seedIfEmpty()` writes `buildSeed()` into Firestore on first run,
  guarded by a `meta/seed` marker. `buildSeed()` (`src/lib/seed.ts`) is still the
  source of demo data. There is no more `localStorage`/version gate.

**Domain model — `src/lib/types.ts`** (plan.md §3). The critical distinction: a
**ClassType** is a reusable template (no date); a **ClassSession** is one dated
occurrence referencing a type. Bookings attach to sessions. Don't conflate the two.
`Booking.state` is a full enum (`confirmed`/`waitlisted`/`cancelled`/`attended`/`no_show`)
and `locationId` is on every session — both are v2 hooks already in place.

**All user-facing copy goes through `src/lib/i18n.ts`** — the `t` object (and
`CATEGORY_META`). Never hardcode strings in components; the product is Hebrew/RTL and
copy is meant to be a config change, not a rewrite.

**RTL is non-negotiable.** Use CSS **logical** properties (`margin-inline`,
`inset-inline-start`, `padding-block`, etc.) — never physical `left`/`right`. Week
starts **Sunday** and dates format in Hebrew via `src/lib/date.ts`.

**Auth is Firebase email + password.** `src/lib/firebase.ts` is the *only* module
that imports the firebase-auth SDK; it's **code-split** (dynamic `import()` in
`App.tsx`, `Login.tsx` on submit, `UserSwitcher.tsx` on sign-out) so it stays off the
critical render path. The SDK-free `src/lib/firebaseConfig.ts` holds the
`VITE_FIREBASE_*` config + `firebaseConfigured` flag (see `.env.example`). The store
stays firebase-free so the node smoke test keeps bundling. `App.tsx` subscribes to
`watchAuth`; on a resolved identity it calls `onAuthIdentity(uid, email, displayName)`
→ `firestore.resolveAuthUser`, which maps the identity to a Firestore `User` **by
email** (case-insensitive), auto-creating an inactive `member` for an unknown email
(a manager activates the membership later) and starting the live listeners. While the
session resolves / cloud data streams in, `App.tsx` shows a splash. **Logged out**,
`App` holds an `authView: "landing" | "login"` toggle: it first renders
`src/screens/Landing.tsx` (a marketing page for new visitors) whose CTAs (`onEnter`)
open `src/screens/Login.tsx` (the email/password form; `onBack` returns to the
landing). `currentUserId` (in the store) is **nullable** and is reconciled from
Firebase, not the source of truth. Sign-out goes through `signOutUser()` (firebase),
and the auth listener clears `currentUserId`. Booking is still gated on
`user.membershipActive`. Components resolve the current user with
`data.users.find(u => u.id === data.currentUserId)!` and pass `me.id` into store
helpers — keep that pattern rather than threading the nullable id around. Seeded
users carry demo emails (`<id-without-u->@omixfit.app`, e.g. `noa@omixfit.app` is the
manager); sign up with one to log in as that role. **Setup:** enable the
Email/Password provider in the Firebase console and copy `.env.example` →
`.env.local`. The browser QA scripts (`a11y`/`e2e`/…) need a valid config and log in
through the email/password form.

**Accessibility is a legal requirement** (IS 5568 / WCAG 2.1 AA) and the bar is **0
serious/critical axe violations** across screens *and* modal states. Two things to
respect: the muted token `--text-3` is tuned to *exactly* meet 4.5:1 on white — don't
dim it further with `opacity`; and avatar initials auto-pick dark/white ink for
contrast (`readableInk` in `src/components/common.tsx`). `npm run a11y` audits 9
surfaces; `npm run focus` checks the modal focus trap.

**Modals** use `src/components/Sheet.tsx`, which traps Tab, focuses in on open, and
restores focus to the trigger on close (WCAG 2.4.3). Build new dialogs on it.

**Toasts** are a module-level bus in `src/components/Toast.tsx` — call `toast(msg, kind)`
from anywhere, including store callbacks, without prop-drilling.

**Build-version stamping.** `vite.config.ts` injects `__APP_VERSION__`, `__BUILD_SHA__`
(git short SHA), and `__BUILD_TIME__` via `define`; they're declared in
`src/vite-env.d.ts` and read through `src/lib/version.ts`, surfaced in the UI by the
`VersionTag` component. This is how the deployed site reports which commit is live.

**Base-path awareness.** `base` comes from `VITE_BASE` (default `/`, which is what
Firebase Hosting serves from; set it to `/<subpath>/` only if hosting under a subpath).
Anything that references built assets, the service worker, manifest,
or icons must resolve relative to `import.meta.env.BASE_URL` (see `src/main.tsx`'s SW
registration), so the app works at both `/` and a subpath.

## Conventions

- Commits land **directly on `master`**. Deploy is **Firebase Hosting + Firestore
  rules**, run manually: `npm run deploy` (`= npm run build && firebase deploy --only
  hosting,firestore:rules`; config in `firebase.json` / `.firebaserc`, project
  `omixfit-be3ff`). The build embeds the Firebase web config from `.env.local` — no
  deploy secrets (the web config isn't sensitive). There is **no** CI deploy workflow.
- **Firestore security (`firestore.rules`)** is Spark-plan pragmatic: every read/write
  requires sign-in, but roles are **not** enforced server-side (un-forgeable roles need
  Blaze + custom claims). Roles are gated in the UI. Tighten the rules per-collection
  when moving to Blaze.
- `docs/plan.md` is the source of truth for product behavior; its open questions Q1–Q8
  are already decided and baked in (see the README's "Architecture" note). The README
  also keeps a per-iteration changelog.

## Working rules for agents

- **Finish the job, then ship it.** When a task is complete, run the relevant gates
  (`npm run build`, `npm test`, and any browser script that covers what changed — see
  the preview/Chrome requirements above), then **commit and push to `master`**.
  Completed work is expected to be pushed, not left sitting in the working tree.
- **Never commit `.claude/ralph-loop.local.md` by itself.** It's a transient Ralph-loop
  counter that changes every loop turn; leave it unstaged. Stage explicit paths rather
  than `git add -A` so it doesn't sneak in.
- **Keep `CLAUDE.md` and `AGENTS.md` identical.** They hold the same guidance for
  different tools — when you change one, make the same change in the other in the same
  commit.
