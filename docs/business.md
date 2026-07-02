# Omix — The Business (single source of truth)

This file is the canonical description of **Omer's business** and the product
decisions that flow from it. It's written for humans and for AI agents working
on this repo. If something here conflicts with an assumption in the code, this
file wins — update the code, not this file (unless the business itself changed).
Keep it current: when Guy/Omer tell us something new about the business, it goes
here first.

> Companion docs: [`plan.md`](plan.md) is the generic scheduling-app spec;
> this file is the real, specific business it serves.

---

## 1. Who

- **Omer** — the trainer and owner. Referred to as **she/her**. A fitness coach
  specialising in **strength and running**, guiding people to a healthy
  lifestyle. Deals with **strength, functional, aerobic, and mass training**.
  She is a **2nd-year Sports Therapy student** at Ono Academic College
  (graduating next year, bachelor's) and a **marathoner**. She pours herself
  into her trainees — they are, in her words, her whole world.
- **Guy** — Omer's husband; runs the tech/app side (the person we talk to).
- Omer **personally knows every client**. This is central: approval decisions
  don't need scoring/analytics — she already knows who's who. The app's job is
  to give her the essentials fast and get out of the way.

Business contact addresses (see also §8):
- **office@omixfit.com** — main business address; the single sender of all
  automated app email.
- **help@omixfit.com** — customer support / issues; reply-to on automated mail.
- **omer@omixfit.com** — Omer's management address (class updates etc.).
- `omer@omixfit.com` and `omerido20@gmail.com` are the **same person** (business
  + personal); both are full app owners/admins.

## 2. Scale

- **~50 active clients.** Recurring, relationship-based.
- **Almost no drop-ins** — except one-off special events (see §5.2).

## 3. What Omer sells (offerings)

1. **1-on-1 personal training** (Guy dislikes the label "1-on-1" — prefer
   "personal training").
2. **Group classes** — for **adults** and for **young children**.
3. **Pre/postnatal groups** — pregnant and/or postpartum women.
4. **Special events** (rare) — retreats, yoga workshops, ice baths, breathing
   workshops, "healing" days, etc. (see §5.2).
5. **Monthly coaching subscription** — close personal accompaniment (see §5.3).

Training types across the above: strength, functional, aerobic, mass.

## 4. Client lifecycle (the spine of the product)

```
sign up ─► verify email (MFA) ─► PENDING (Omer reviews) ─► approve
   │                                                          │
   └─ "just sign up" leads from the landing page              ▼
                                              NEW CLIENT (flag: needs attention)
                                                              │
                        trial class, no punch-card in 7 days  │
                                 ┌────────────────────────────┤
                                 ▼                            ▼
                    auto-disconnect → back to PENDING     buys punch-card → ACTIVE
                    (until they buy a pass)
```

Key rules:
- **Email verification is required** before reaching the app (already built) —
  fake addresses can't get in. Omer also wants to *see* on the approval card
  whether the person verified (email and/or phone "MFA").
- **Approval is manual** — Omer approves/declines. She just needs the essentials
  (§5.1). No tagging at approval; roles/types are handled later by existing
  rules.
- **"New client" flag** — any freshly-approved client is visually marked as
  **new** so Omer knows to give them extra attention.
- **Trial → pass rule (a.k.a. punch-card / כרטיסייה):** a client may do a **trial
  class**. If they do **not purchase a pass within 7 days**, the system
  **auto-disconnects** them and puts them **back on the pending/waiting list**
  until they buy a pass and re-enter.
- **"Just sign up" option** — a low-friction signup from the landing page so new
  leads always have a way in; Omer follows up.
- **Login tracking** — track when each existing client first logs into the new
  system (rollout visibility).

## 5. Feature specs

### 5.1 Approval / new-registrant review (SIMPLIFY — current screen shows too much)
When reviewing a pending registrant, Omer wants **only** what she needs to
decide, at a glance:
- **Name, phone, email, city ("where from")**
- **Medical issue reported?** (from the health declaration)
- **Notes** the person wrote (free text)
- **Verification status** — did they complete email / phone verification (MFA)?
- **Approve / Decline** buttons

Remove from the approval view: booking stats, activity/"at-risk" meters, the
role-change segmented control, the membership toggle, and recent activity — all
irrelevant to approving a brand-new person.

### 5.2 Retreats / special events (separate signup)
- **A separate registration page/flow**, distinct from class booking.
- **One-time pricing** (different from regular passes).
- **Open to the public** — people unrelated to regular training attend too.
- Lots of one-off logistics (food, drinks, music, mats, etc.), but these events
  are **rare**. Example: last event ≈ **20 people** for a yoga + breathing + ice
  bath workshop.
- No extra per-person data needed beyond the standard contact info + the one-time
  price.

### 5.3 Monthly coaching subscription (the premium tier)
What the client gets:
- **Daily** personalized workout plan + exercises, sent each **morning via
  WhatsApp**.
- A **first meeting** (online or physical) to get acquainted and set goals.
- A **weekly 1-hour call** + **daily** close support.
- Day-to-day contact happens over **WhatsApp** (not in-app messaging).

What Omer needs from the app — a **dedicated management interface in the admin
area** to run these coaching clients, that **reminds her** to:
- schedule the **weekly call** if she hasn't,
- **message / talk to** the client (daily touchpoints),
- **collect payment** if they haven't paid that month (then charge them).

So this is a **coaching-client dashboard with reminders/nudges**, not a chat
system.

### 5.4 Health & injury (Omer is a sports therapist)
- A client may report that **something hurts**; this **raises a flag** for Omer
  to focus on during class.
- Build **treatment templates by injury type** (what kind of care/adaptation an
  injury implies).
- Per-client **exercise adaptations**: Omer knows some trainees can't do a given
  exercise in a group class, and prepares a **dedicated alternative** for them.

### 5.5 Payments (BUILT — confirmed correct)
"Purchase a package" shows **two icons: Bit and PayBox**, each wired to a
**personal payment link to Omer's account**. The client picks their preferred
app and is taken straight there to pay. Admin sets the links (admin-only).

### 5.6 Calendar (BUILT)
- **Admin studio sync-all** — mirrors the whole schedule to Omer's calendar.
- **Per-customer personal sync** — each client can connect their own Google
  Calendar and sync **only the classes they booked**. (Needs Google OAuth
  verification for full public rollout; works for limited users meanwhile.)

## 6. Automated email (BUILT — see §8 for addresses)
All from **office@**, **reply-to help@**, branded RTL:
- Email verification (Firebase), account **approved**, **booking confirmation**,
  **waitlist promotion**, **class cancelled by studio**, **class reminder** (24h).
- help@ surfaced in-app as the support contact.

## 7. Deploy / infra (context)
- Single repo `~/Projects/Omixfit` → GitHub `TotoTheBoy/Omixfit` → **Firebase
  Hosting** `https://omixfit-be3ff.web.app` (custom domain `omixfit.com`).
- **No CI.** Deploy is manual: `npm run deploy` (hosting + rules) and, for
  Cloud Functions, `firebase deploy --only functions`. Firebase project
  `omixfit-be3ff` (Blaze).

## 8. Email address roles
| Address | Role | In app |
|---|---|---|
| office@omixfit.com | main business + **sole automated sender** | ✅ |
| help@omixfit.com | customer support/issues | ✅ reply-to + in-app contact |
| omer@omixfit.com | Omer's management (human) | owner/admin login |

## 9. Backlog & status
Built ✅ · Planned ⏳

- ✅ Payments modal (Bit/PayBox), calendar sync (studio + per-customer),
  email verification gate, transactional emails, omerido20 full admin.
- ✅ **Simplified approval/review screen** (§5.1) — name/phone/email/where-from,
  one medical flag, notes, verification status, approve/decline.
- ✅ **"New client" flag** (`approvedAt`, <21d tag + detail highlight) (§4).
- ✅ **Trial → 7-day-pass auto-disconnect** (`sweepTrials` off the hourly ping;
  "mark pass" clears it; legacy members never swept) (§4).
- ✅ **Login tracking** (`lastLoginAt`, shown on the member card) (§4).
- ✅ **Injury notes + adaptation templates** (per-client `trainerNotes`,
  quick-insert templates, list flag) (§5.4).
- ⏳ **Retreat / special-event signup** (separate, public, one-time price) (§5.2).
- ⏳ **Coaching-subscription admin dashboard** with reminders (§5.3).
- ⏳ **"Just sign up" low-friction landing lead capture** (§4).
