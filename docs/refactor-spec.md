# Omixfit — Premium UI/UX Refactoring Spec (2026-07)

Canonical spec for the luxury-editorial refresh. Companion to
[`business.md`](business.md) (the business) — this file is **how it should look
and feel**. Hebrew-first, RTL, mobile-first, **WCAG 2.1 AA**. Strip generic
"SaaS"/childish/cluttered elements and technical jargon. Keep the clean
architecture boundary `engine.ts → store.ts → firestore.ts`.

## Brand palette (the editorial system)
| Token | Hex | Use |
|---|---|---|
| Cream / beige | `#FDFBF7` / `#F5F2EB` | backgrounds |
| Matte charcoal | `#1A1A1A` | primary text / dark surfaces |
| Muted olive / sage | `#3B4436` / `#4A5343` | accents |
| Champagne gold | `#C5A059` | highlights |

Plenty of whitespace, thin 1px low-contrast dividers, uniform minimalist icons.

---

## Domain 1 — Design system & shared layouts
**1. Top nav / header:** remove the live-ticking clock; remove all neon
blue/purple active-state borders; standardize nav links with premium fonts +
letter-spacing; active = solid charcoal or gold capsule with cream text; uniform
minimalist icon set (identical line weights/bounding boxes); redesign the user
pill — replace the purple initials badge with cream/olive bg + charcoal text;
strict RTL symmetry.

**2. Marketing landing overhaul:** editorial palette, whitespace, 1px dividers.
Hero = high-end hook on Strength + Running + Sports Therapy. Service pillars grid
(1-on-1 premium coaching, group classes split Adults/Kids, pre/postnatal, monthly
coaching tier). Omer storyteller section (marathoner, 2nd-yr Sports Therapy @ Ono,
"trainees are her world and her air"). Events block → public `/#events`. Lead
capture form (First Name, Last Name, Phone, validated City).

## Domain 2 — Trainee experience & portal
**3. Account settings / notifications cleanup:** strip technical phrases (iOS
16.4+, "וואטסאפ הוא הערוץ המוביל…"); header "ערוצי קבלת עדכונים"; relabel "התראות
בנייד (Push)" and "הודעות לוואטסאפ"; reminder chips → solid charcoal/olive when
active, 1px desaturated border when not; move "התנתקות"/"החלפת משתמש" to the very
bottom as low-emphasis links.

**4. Relocate character/emoji picker:** remove the standalone avatar-emoji grid
screen; move it inside the personal settings, reachable only by tapping one's own
profile icon → nested sub-profile modal.

**5. Trainee membership summary card:** cohesive "digital membership card". Remove
phone + empty "בתוקף עד" from the card. Identity on the right: initials avatar +
parsed full name. Conditional: subscription → "מנוי בתוקף עד: DD/MM/YYYY";
punch-card → gold "נותרו X אימונים בכרטיסייה". Deep-charcoal card bg; "עריכת
פרטים" anchored cleanly outside/near the card.

**6. Editorial class schedule:** category filter pills — no colored dots/bg,
elegant typography; active = charcoal/sage solid chip. Cards on clean cream, 1px
separators, no thick colored accent borders. Big high-contrast charcoal session
time. Replace capacity progress bars with typography: "X מקומות פנויים" (sage) /
"מקום אחרון!"/"X מקומות אחרונים!" (gold).

**7. Packages section (NEW):** config array of pricing tiers (extensible).
1-on-1 tier: 12×=1,920₪ ("160 ₪ לאימון"), 8×=1,360₪ ("170 ₪ לאימון"), 4×=720₪
("180 ₪ לאימון"), single/trial=200₪. Purchase → minimalist modal with exactly
**Bit** and **PayBox** (styled vectors) routing to Omer's personal links.

**8. OMIX loyalty milestone tracker (NEW):** tiers by historical attended count:
Pace (0+), Endurance (25+ → sage card border + waitlist priority), Elite (75+ →
gold text badge), Marathoner (150+ → charcoal card + brushed gold). Early-booking
hook in `engine.ts`: rolling-window gate; Marathoner may book 1h before general
release. Trainee view: weekly-streak dot/flame markers ("רצף שבועי") + hairline
gold progress slider to next tier ("עוד X אימונים למעמד OMIX Elite").

## Domain 3 — Admin & onboarding
**9. New-lead onboarding pipeline (admin):** when viewing a *pending* user, show a
dedicated pipeline view (no active-client stats/toggles). Header: First Name, Last
Name, Age, validated City, Phone. Vertical stepper (ציר זמן): (1) email verified —
warn "הלקוח טרם ביצע את האימות במייל" + resend button; (2) profile completion
(name/age/city); (3) health declaration — signature status; any medical flag →
high-visibility red/orange flag exposing the comment text; (4) studio terms. The
"אישור והפעלת מנוי" button stays disabled until steps 1, 3, 4 pass. **Manual
approval mandatory for ALL users incl. trial.** Trial without a package in 7 days →
disconnect → back to pending.

## Domain 4 — Backend, forms & integrations
**10. Email verification engine:** route transactional mail via Cloud Functions +
Gmail SMTP on `office@omixfit.com` (avoid raw firebaseapp.com → spam). Beautiful
localized Hebrew templates, OMIX palette, centered logo, high-contrast "אימות מייל"
button.

**11. City directory (1,200+ settlements):** bundle a pre-compiled local static
JSON of all official Israeli settlements (from data.gov.il); searchable combobox;
**no "אחר"**; strict client + server validation that the value is in the dictionary.

**12. First/last name split:** split "שם מלא" → "שם פרטי" (right) + "שם משפחה"
(left); Firestore user schema gets separate `firstName` / `lastName`.

**13. Digital signature module:** after confirming parsed first+last name, render
their full name in a calligraphy script font as a signature canvas; explicit
"אשר חתימה זו" button finalizes before submission locks.

---

## Status
See the checklist appended to this section as items ship. Items map 1:1 to the
Domain numbers above.
- [x] 1 nav/header · [ ] 2 landing · [x] 3 notifications · [x] 4 avatar-relocate
- [x] 5 membership card · [x] 6 schedule · [x] 7 packages · [x] 8 loyalty
- [ ] 9 lead pipeline · [ ] 10 email templates · [ ] 11 city directory
- [ ] 12 name split · [ ] 13 signature
