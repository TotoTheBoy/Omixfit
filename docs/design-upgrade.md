# Omixfit — Design Elevation Plan (2026-07)

Goal: make it *feel* like the best premium studio app in the market — one cohesive
editorial-luxury language (warm cream · matte charcoal · champagne gold · muted
sage), alive with tasteful motion, effortless and polished on every surface.
Non-negotiables unchanged: Hebrew-first RTL, WCAG 2.1 AA, no risky rewrites — the
`engine → store → firestore` architecture stays.

## Findings (audit of theme.css + app.css)
1. **Off-brand neon lime-green leftovers.** The primary CTA `.btn-lime` hovers to
   `#e2ff63` (neon green) with a neon-green glow (`--sh-lime`), and five accent
   glows use `rgba(214,255,61,…)`. All should be champagne gold. Most visible flaw.
2. **Motion underused.** pop-in / slide-up / fade-in / toast-in keyframes exist but
   are barely applied; content appears flat/instant.
3. **Bare loading states.** The splash is a static mark; data loads show plain text.
4. **Interaction feedback is minimal** — buttons/cards lack a hover lift.

## Phases (each: build + npm test green, committed)
1. **Brand consistency** — kill every neon-lime value; unify on champagne gold
   (CTA hover + glow, all accent glows). Refresh the stale theme header comment.
2. **Interaction polish** — subtle hover lift on primary/ink buttons + interactive
   cards; gold-tinted input focus glow.
3. **Motion layer** — a reduced-motion-safe entrance utility (`.rise`, staggered)
   applied to page content, cards and lists so screens come alive.
4. **Loading polish** — a reusable `.skeleton` shimmer + a gentle breathing splash.

Status: 1 ✅ · 2 ✅ · 3 ✅ · 4 ✅ (see commits).

## Depth pass (follow-up)
- **Empty states** upgraded across all 6 screens (Schedule / My Orders / Manage /
  Members / Coaching / Overview): a soft cream gradient card, a circular gold icon
  badge, and a gentle pop-in — from "placeholder" to intentional.
- **Toasts** now use a distinct icon per kind — ✓ success, ⓘ info, ⚠ error
  (info was previously sharing the error triangle).
- **Skeleton loaders** wired into the public events page (shimmer cards while the
  fetch resolves) using the `.skeleton` utility.
- **Staggered entrance cascade** — cards (schedule / stats / overview / catalog /
  packages / lesson plans) now ripple in one beat after another (capped at .25s),
  instead of popping in all at once. Reduced-motion safe.
- **Richer session-detail hero** — a large translucent category-emoji watermark +
  a corner light sheen, so each class's sheet has its own visual identity.
