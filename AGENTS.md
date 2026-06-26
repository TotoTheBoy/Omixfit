# AGENTS.md

Guidance for AI coding agents working in this repository. Kept identical to
[`CLAUDE.md`](CLAUDE.md) — update both files in the same change.

## What this is

Omixfit — a Hebrew-first, **RTL** PWA for booking fitness classes, built from the
product spec in [`docs/plan.md`](docs/plan.md). Two experiences in one app: a
**trainee** side (browse the week, book/cancel, waitlist) and a **trainer/manager**
side (publish schedule, rosters, reports, member management). Stack: Vite + React 18
+ TypeScript with a **hand-crafted CSS design system** and **zero runtime UI
dependencies** (only `react`/`react-dom` ship). There is no backend — state lives in
`localStorage` behind a store API designed so a real backend can swap in later.

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
booking-engine invariants directly against the store/seed). Keep it green; it's the
fastest regression gate.

## Architecture (the parts that span files)

**Single external store — `src/lib/store.ts`.** All app state AND all mutations live
here, exposed via a `useSyncExternalStore` hook (`useStore(selector)`) and persisted
to `localStorage` under key `omixfit:v1`. Components never hold domain state; they
read selectors and call exported mutations (`book`, `cancelBooking`, `joinWaitlist`,
`upsertSession`, `updateUser`, `logout`, …).

- **Capacity is enforced atomically inside the mutations** (plan.md §4.4): `book()`
  re-counts confirmed bookings against the freshest state and rejects if full — never
  a stale read-then-write. Preserve this when touching booking logic.
- **Waitlist auto-promotion** (`fillFromWaitlist`) runs on cancellation and on
  capacity increase, FIFO by `createdAt`.
- **Schema versioning gotcha:** `load()` only accepts persisted data when
  `parsed.version === 5`, otherwise it reseeds. When you change the data shape, bump
  the number in **both** `src/lib/store.ts` (the `=== 5` check) and `src/lib/seed.ts`
  (`version: 5`), or returning users render against a stale schema.

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

**Auth is a demo stand-in.** There's no login backend: `currentUserId` (in the store)
is **nullable** — `null` means logged out, and `App.tsx` renders `src/screens/Login.tsx`
(a seeded-user picker) instead of the app shell when there's no current user. Real auth
would be phone + SMS OTP (plan.md §4.1). Booking is gated on `user.membershipActive`.
Because the app only renders the inner screens when logged in, components resolve the
current user with `data.users.find(u => u.id === data.currentUserId)!` and pass `me.id`
into store helpers — keep that pattern rather than threading the nullable id around.

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

**Base-path awareness.** `base` comes from `VITE_BASE` (default `/`; the Pages workflow
sets `/<repo>/`). Anything that references built assets, the service worker, manifest,
or icons must resolve relative to `import.meta.env.BASE_URL` (see `src/main.tsx`'s SW
registration), so the app works at both `/` and a subpath.

## Conventions

- Commits land **directly on `master`**; pushing to `master` triggers the GitHub Pages
  deploy (`.github/workflows/deploy.yml`, builds with `VITE_BASE=/<repo>/`).
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
