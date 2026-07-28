// ---------------------------------------------------------------------------
// OMIX Cloud Functions (Blaze) - Google Calendar 2-way sync.
//
// Plain gen-1 HTTPS functions only (no Firestore triggers / eventarc), so the
// deploy needs no special IAM and isn't tied to the Firestore region.
//
//   calConnect  - owner opens this → Google OAuth consent.
//   calCallback - Google redirects back → store the refresh token (locked doc).
//   syncCalendar- callable the app invokes after session changes; mirrors all
//                 upcoming sessions into Omer's Google Calendar.
// ---------------------------------------------------------------------------

const fnV1 = require("firebase-functions/v1");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { google } = require("googleapis");

initializeApp();
const db = getFirestore();
const CAL_DOC = "meta/calendar";
const CAL_ID = "primary";
const REDIRECT = "https://us-central1-omixfit-be3ff.cloudfunctions.net/calCallback";
const crypto = require("crypto");

function oauth() {
  return new google.auth.OAuth2(process.env.GCAL_CLIENT_ID, process.env.GCAL_CLIENT_SECRET, REDIRECT);
}

// Sign the OAuth `state` so a per-user connect can't be forged: only our server
// (holding GCAL_CLIENT_SECRET) can mint a state naming a given uid. 15-min TTL.
function signState(uid) {
  const body = `${uid}.${Date.now() + 15 * 60 * 1000}`;
  const sig = crypto.createHmac("sha256", process.env.GCAL_CLIENT_SECRET).update(body).digest("hex");
  return `${body}.${sig}`;
}
function verifyState(state) {
  if (!state || typeof state !== "string") return null;
  const [uid, exp, sig] = state.split(".");
  if (!uid || !exp || !sig) return null;
  const expected = crypto.createHmac("sha256", process.env.GCAL_CLIENT_SECRET).update(`${uid}.${exp}`).digest("hex");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b) || Date.now() > Number(exp)) return null;
  return uid;
}

// Owner opens this URL → Google consent for the STUDIO calendar (no state).
exports.calConnect = fnV1.https.onRequest((req, res) => {
  const url = oauth().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
  });
  res.redirect(url);
});

// A signed-in member calls this → returns a consent URL for THEIR OWN calendar.
// The signed state carries their uid so the callback stores the token per-user.
exports.calConnectUrl = fnV1.https.onCall((data, context) => {
  if (!context.auth) throw new fnV1.https.HttpsError("unauthenticated", "sign in");
  const url = oauth().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state: signState(context.auth.uid),
  });
  return { url };
});

// Google redirects back here with a code → store the refresh token.
exports.calCallback = fnV1.https.onRequest(async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("missing code");
  // A present-but-invalid state means a forged personal connect → reject.
  const stateUid = req.query.state ? verifyState(req.query.state) : null;
  if (req.query.state && !stateUid) return res.status(400).send("bad state");
  try {
    const { tokens } = await oauth().getToken(code);
    if (tokens.refresh_token) {
      if (stateUid) {
        // per-user personal calendar (token locked to Cloud Functions in rules).
        await db.doc(`calTokens/${stateUid}`).set({ refreshToken: tokens.refresh_token, connectedAt: Date.now() }, { merge: true });
        await db.doc(`users/${stateUid}`).set({ calConnected: true }, { merge: true });
      } else {
        // studio (admin) calendar.
        await db.doc(CAL_DOC).set({ refreshToken: tokens.refresh_token, connectedAt: Date.now() }, { merge: true });
        await db.doc("meta/calendarStatus").set({ connected: true, connectedAt: Date.now() }, { merge: true });
      }
    }
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send("<html dir='rtl'><body style='font-family:sans-serif;text-align:center;padding-top:60px;background:#f6efe0;color:#241c12'><h2>היומן חובר בהצלחה ✅</h2><p>אפשר לסגור את החלון ולחזור ל-Omix.</p></body></html>");
  } catch (e) {
    logger.error("calCallback", e);
    res.status(500).send("auth failed");
  }
});

function calFromToken(rt) {
  if (!rt) return null;
  const o = oauth();
  o.setCredentials({ refresh_token: rt });
  return google.calendar({ version: "v3", auth: o });
}
async function calendar() {
  const snap = await db.doc(CAL_DOC).get();
  return calFromToken(snap.exists && snap.data().refreshToken);
}

function buildEvent(s, title, id) {
  const [y, m, d] = s.date.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0);
  start.setMinutes(s.startMin || 0);
  const end = new Date(start.getTime() + (s.durationMin || 60) * 60000);
  const video = s.online ? `https://meet.jit.si/omix-${id}` : "";
  return {
    summary: (s.online ? "🎥 " : "") + (title || "אימון"),
    location: s.online ? video : s.room || "",
    description: s.online ? `שיעור אונליין - הצטרפות לווידאו:\n${video}` : "",
    start: { dateTime: start.toISOString(), timeZone: "Asia/Jerusalem" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Jerusalem" },
  };
}

// Personal sync: mirror ONLY the sessions this member booked into THEIR own
// calendar (per-user token). Per-user event ids live on the booking doc.
async function syncPersonal(uid) {
  const tk = await db.doc(`calTokens/${uid}`).get();
  const cal = calFromToken(tk.exists && tk.data().refreshToken);
  if (!cal) return { connected: false, synced: 0 };
  const todayKey = new Date().toISOString().slice(0, 10);
  const bsnap = await db.collection("bookings").where("userId", "==", uid).get();
  const titles = {};
  let synced = 0;
  for (const bd of bsnap.docs) {
    const b = bd.data();
    const sd = await db.doc("sessions/" + b.sessionId).get();
    const s = sd.exists ? sd.data() : null;
    const active = s && b.state === "confirmed" && !s.cancelled && s.date && s.date >= todayKey;
    try {
      if (!active) {
        if (b.gcalEventId) {
          await cal.events.delete({ calendarId: CAL_ID, eventId: b.gcalEventId }).catch(() => {});
          await bd.ref.update({ gcalEventId: FieldValue.delete() });
        }
        continue;
      }
      if (!titles[s.classTypeId]) {
        const t = await db.doc("classTypes/" + s.classTypeId).get();
        titles[s.classTypeId] = t.exists ? t.data().name : "אימון";
      }
      const ev = buildEvent(s, titles[s.classTypeId], b.sessionId);
      if (b.gcalEventId) {
        await cal.events.update({ calendarId: CAL_ID, eventId: b.gcalEventId, requestBody: ev });
      } else {
        const created = await cal.events.insert({ calendarId: CAL_ID, requestBody: ev });
        await bd.ref.update({ gcalEventId: created.data.id });
      }
      synced++;
    } catch (e) {
      logger.error("personal sync " + bd.id, e);
    }
  }

  // Instructors also mirror the classes they TEACH into their own calendar.
  // There is no booking to hang the per-user event id on, so taught event ids
  // live in the calTokens doc - keeps the sync idempotent and self-pruning.
  const taught = (tk.exists && tk.data().taught) || {};
  let taughtChanged = false;
  const ssnap = await db.collection("sessions").where("instructorId", "==", uid).get();
  for (const sd of ssnap.docs) {
    const s = sd.data();
    const active = !s.cancelled && s.date && s.date >= todayKey;
    const evId = taught[sd.id];
    try {
      if (!active) {
        if (evId) {
          await cal.events.delete({ calendarId: CAL_ID, eventId: evId }).catch(() => {});
          delete taught[sd.id];
          taughtChanged = true;
        }
        continue;
      }
      if (!titles[s.classTypeId]) {
        const t = await db.doc("classTypes/" + s.classTypeId).get();
        titles[s.classTypeId] = t.exists ? t.data().name : "אימון";
      }
      const ev = buildEvent(s, "הדרכה · " + titles[s.classTypeId], sd.id);
      if (evId) {
        await cal.events.update({ calendarId: CAL_ID, eventId: evId, requestBody: ev });
      } else {
        const created = await cal.events.insert({ calendarId: CAL_ID, requestBody: ev });
        taught[sd.id] = created.data.id;
        taughtChanged = true;
      }
      synced++;
    } catch (e) {
      logger.error("taught sync " + sd.id, e);
    }
  }
  if (taughtChanged) await db.doc(`calTokens/${uid}`).set({ taught }, { merge: true });

  return { connected: true, synced };
}

// Callable from the app. mode:"personal" → the caller's own booked classes into
// their calendar; otherwise (admin) mirror every upcoming session to the studio.
exports.syncCalendar = fnV1.https.onCall(async (data, context) => {
  if (!context.auth) throw new fnV1.https.HttpsError("unauthenticated", "sign in");
  if (data && data.mode === "personal") return syncPersonal(context.auth.uid);
  const cal = await calendar();
  if (!cal) return { connected: false, synced: 0 };
  const todayKey = new Date().toISOString().slice(0, 10);
  const snap = await db.collection("sessions").get();
  const titles = {};
  let synced = 0;
  for (const doc of snap.docs) {
    const s = doc.data();
    if (!s.date || s.date < todayKey) continue; // only upcoming
    try {
      if (s.cancelled) {
        if (s.gcalEventId) {
          await cal.events.delete({ calendarId: CAL_ID, eventId: s.gcalEventId }).catch(() => {});
          await doc.ref.update({ gcalEventId: FieldValue.delete() });
        }
        continue;
      }
      if (!titles[s.classTypeId]) {
        const t = await db.doc("classTypes/" + s.classTypeId).get();
        titles[s.classTypeId] = t.exists ? t.data().name : "אימון";
      }
      const ev = buildEvent(s, titles[s.classTypeId], doc.id);
      if (s.gcalEventId) {
        await cal.events.update({ calendarId: CAL_ID, eventId: s.gcalEventId, requestBody: ev });
      } else {
        const created = await cal.events.insert({ calendarId: CAL_ID, requestBody: ev });
        await doc.ref.update({ gcalEventId: created.data.id });
      }
      synced++;
    } catch (e) {
      logger.error("sync session " + doc.id, e);
    }
  }
  return { connected: true, synced };
});

// ---------------------------------------------------------------------------
// Email reminders - an external hourly cron pings this; it emails the booked
// clients of any session starting within the next 24h (once each, via Gmail SMTP
// from office@omixfit.com). Protected by a secret key.
// ---------------------------------------------------------------------------
const nodemailer = require("nodemailer");

const REPLY_TO = "help@omixfit.com";
const APP_URL = "https://omixfit.com/";

function mailer() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

// One branded RTL wrapper for every automated e-mail. Always from office@ (the
// single authenticated sender = best deliverability); replies routed to help@.
async function sendMail(to, subject, innerHtml) {
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#241c12;background:#f6efe0;padding:24px;border-radius:14px;max-width:480px">${innerHtml}<hr style="border:none;border-top:1px solid #e6dcc4;margin:18px 0"><p style="font-size:12px;color:#6b5d47">שאלה או בעיה? כתבו לנו ל-<a href="mailto:${REPLY_TO}">${REPLY_TO}</a></p></div>`;
  await mailer().sendMail({
    from: `Omix · עומר <${process.env.GMAIL_USER}>`,
    replyTo: REPLY_TO,
    to, subject, html,
  });
}

// A session's display bits (title, HH:MM, date, optional video link).
async function sessionInfo(sessionId) {
  const sd = await db.doc("sessions/" + sessionId).get();
  if (!sd.exists) return null;
  const s = sd.data();
  const ct = await db.doc("classTypes/" + s.classTypeId).get();
  const title = ct.exists ? ct.data().name : "אימון";
  const time = `${String(Math.floor((s.startMin || 0) / 60)).padStart(2, "0")}:${String((s.startMin || 0) % 60).padStart(2, "0")}`;
  const video = s.online ? `https://meet.jit.si/omix-${sessionId}` : "";
  return { s, title, time, date: s.date || "", video };
}

exports.sendReminders = fnV1.https.onRequest(async (req, res) => {
  if (req.query.key !== process.env.REMINDER_KEY) return res.status(403).send("forbidden");
  const now = Date.now();
  const horizon = now + 24 * 3600 * 1000;
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  if (req.query.verify) {
    try { await transport.verify(); return res.json({ smtp: "ok" }); }
    catch (e) { return res.status(500).json({ smtp: "fail", err: String(e).slice(0, 140) }); }
  }
  const sessions = await db.collection("sessions").get();
  const titles = {};
  let sent = 0;
  for (const sd of sessions.docs) {
    const s = sd.data();
    if (s.cancelled || !s.date) continue;
    const [y, m, d] = s.date.split("-").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0);
    start.setMinutes(s.startMin || 0);
    const st = start.getTime();
    if (st < now || st > horizon) continue; // only the next 24h
    if (!titles[s.classTypeId]) {
      const t = await db.doc("classTypes/" + s.classTypeId).get();
      titles[s.classTypeId] = t.exists ? t.data().name : "אימון";
    }
    const time = `${String(Math.floor((s.startMin || 0) / 60)).padStart(2, "0")}:${String((s.startMin || 0) % 60).padStart(2, "0")}`;
    const bk = await db.collection("bookings")
      .where("sessionId", "==", sd.id).where("state", "==", "confirmed").get();
    for (const bd of bk.docs) {
      const b = bd.data();
      if (b.reminded) continue;
      const u = await db.doc("users/" + b.userId).get();
      const email = u.exists && u.data().email;
      if (email) {
        const name = (u.data().name || "").split(" ")[0];
        const video = s.online ? `<p>🎥 שיעור אונליין: <a href="https://meet.jit.si/omix-${sd.id}">להצטרפות לווידאו</a></p>` : "";
        await transport.sendMail({
          from: `Omix · עומר <${process.env.GMAIL_USER}>`,
          replyTo: REPLY_TO,
          to: email,
          subject: `תזכורת: ${titles[s.classTypeId]} ב-${time}`,
          html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#241c12;background:#f6efe0;padding:24px;border-radius:14px;max-width:480px">
            <h2 style="color:#a9842f">תזכורת לאימון 💪</h2>
            <p>היי ${name},</p>
            <p>מזכירים שיש לך <b>${titles[s.classTypeId]}</b><br>בתאריך <b>${s.date}</b> בשעה <b>${time}</b>.</p>
            ${video}
            <p>נתראה!<br><b>עומר · Omix</b></p>
          </div>`,
        }).catch((e) => logger.error("mail", e));
        sent++;
      }
      await bd.ref.update({ reminded: true }).catch(() => {});
    }
  }
  const trialsDisconnected = await sweepTrials().catch((e) => { logger.error("sweepTrials", e); return 0; });
  const sessionsFinalized = await finalizeAttendance().catch((e) => { logger.error("finalizeAttendance", e); return 0; });
  const membersNudged = await sweepRetention().catch((e) => { logger.error("sweepRetention", e); return 0; });
  const orphansCleaned = await sweepOrphanAuth().catch((e) => { logger.error("sweepOrphanAuth", e); return 0; });
  const subAlerts = await sweepSubstituteLimit().catch((e) => { logger.error("sweepSubstituteLimit", e); return 0; });
  void orphansCleaned;
  res.json({ sent, trialsDisconnected, sessionsFinalized, membersNudged, subAlerts });
});

// Substitute-instructor 30-day cover: e-mail the owners once when a non-owner
// instructor crosses 25 distinct training days in the current policy year. A
// per-instructor flag (substituteAlertYear) prevents daily re-sends.
const SUBSTITUTE_WARN_AT = 25;
const SUBSTITUTE_DAY_LIMIT = 30;
const POLICY_EXPIRY = "2026-08-31";
function policyYearStartKey() {
  const [y, m, d] = POLICY_EXPIRY.split("-").map(Number);
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
async function sweepSubstituteLimit() {
  const startKey = policyYearStartKey();
  const [us, ss] = await Promise.all([
    db.collection("users").where("role", "in", ["instructor", "manager"]).get(),
    db.collection("sessions").get(),
  ]);
  const datesByInstructor = {};
  ss.docs.forEach((d) => {
    const s = d.data();
    if (s.cancelled || !s.instructorId || !s.date || s.date < startKey) return;
    (datesByInstructor[s.instructorId] = datesByInstructor[s.instructorId] || new Set()).add(s.date);
  });
  let alerts = 0;
  for (const ud of us.docs) {
    const u = ud.data();
    const days = (datesByInstructor[ud.id] || new Set()).size;
    if (days < SUBSTITUTE_WARN_AT) continue;
    if (u.substituteAlertYear === startKey) continue; // already alerted this year
    for (const to of OWNER_EMAILS) {
      await sendMail(to, `⚠️ מדריך מחליף מתקרב למגבלת הביטוח (${days}/${SUBSTITUTE_DAY_LIMIT})`,
        `<h2 style="color:#a9842f">מגבלת מדריך מחליף</h2>
         <p>המדריך/ה <b>${u.name || ud.id}</b> העביר/ה <b>${days}</b> ימי אימון בשנת הפוליסה הנוכחית (מגבלה: ${SUBSTITUTE_DAY_LIMIT} ימים).</p>
         <p>מומלץ לעדכן את פוליסת הביטוח או להיערך בהתאם לפני חריגה.</p>
         <p><b>עומר · Omix</b></p>`).catch((e) => logger.error("sub alert mail", e));
    }
    await ud.ref.update({ substituteAlertYear: startKey }).catch(() => {});
    alerts++;
  }
  return alerts;
}

// Trial → pass rule: a member approved > 7 days ago who never bought a pass is
// disconnected (back to pending, membership off) and e-mailed to buy a pass.
// Runs off the same hourly reminder ping - no extra cron needed.
const TRIAL_MS = 7 * 24 * 3600 * 1000;
async function sweepTrials() {
  const cutoff = Date.now() - TRIAL_MS;
  const snap = await db.collection("users").where("approvalStatus", "==", "approved").get();
  let disconnected = 0;
  for (const ud of snap.docs) {
    const u = ud.data();
    if (u.role !== "member" || u.hasPass) continue;
    if (!u.approvedAt || u.approvedAt > cutoff) continue; // still inside the trial
    await ud.ref.update({ approvalStatus: "pending", membershipActive: false, trialExpired: true });
    disconnected++;
    if (u.email) {
      await sendMail(u.email, "תקופת הניסיון הסתיימה - Omix",
        `<h2 style="color:#a9842f">להמשך אימונים צריך כרטיסייה</h2>
         <p>היי ${(u.name || "").split(" ")[0]},</p>
         <p>תקופת הניסיון בת 7 הימים הסתיימה. כדי להמשיך להתאמן עם עומר יש לרכוש כרטיסייה, ואז החשבון ייפתח מחדש.</p>
         ${ctaButton("רכישת כרטיסייה")}
         <p><b>עומר · Omix</b></p>`).catch((e) => logger.error("trial mail", e));
    }
  }
  return disconnected;
}

// Automated retention: a member who trained before but has gone quiet (no
// attendance in RETENTION_LAPSE_DAYS and nothing booked ahead) gets ONE warm
// "we miss you" nudge, then a long cooldown (lastRetentionAt) so we never spam.
// Skipped: e-mail opt-outs, members who never actually attended (still
// onboarding, not lapsed), and anyone with an upcoming class. Runs once a day
// off the hourly reminder ping (Israel ~10:00) to stay cheap and well-timed.
// Auth accounts whose Firestore member record no longer exists (a removed user)
// are deleted so the e-mail frees up and no orphan can authenticate. A 30-minute
// grace protects brand-new sign-ups whose doc is still being written. Runs every
// reminder ping (hourly) so a removed account is cleared quickly.
const OWNER_EMAILS = [
  "office@omixfit.com",
  "omer@omixfit.com",
  "omerido20@gmail.com",
  "guy.lifshitz98@gmail.com",
  "help@omixfit.com",
];
async function sweepOrphanAuth() {
  const { getAuth } = require("firebase-admin/auth");
  const auth = getAuth();
  const cutoff = Date.now() - 30 * 60 * 1000;
  let cleaned = 0;
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    pageToken = res.pageToken;
    for (const u of res.users) {
      if (OWNER_EMAILS.includes((u.email || "").toLowerCase())) continue;
      const created = new Date(u.metadata.creationTime).getTime();
      if (created > cutoff) continue; // grace for fresh sign-ups
      const snap = await db.doc("users/" + u.uid).get();
      if (!snap.exists) {
        await auth.deleteUser(u.uid).catch(() => {});
        cleaned++;
      }
    }
  } while (pageToken);
  return cleaned;
}

const RETENTION_LAPSE_DAYS = 21;
const RETENTION_COOLDOWN_MS = 30 * 24 * 3600 * 1000;
function jerusalemHour(now) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false }).format(now),
  );
}
async function sweepRetention() {
  const now = new Date();
  if (jerusalemHour(now) !== 10) return 0; // once a day, mid-morning
  const nowMs = now.getTime();
  const todayKey = now.toISOString().slice(0, 10);
  const lapseKey = new Date(nowMs - RETENTION_LAPSE_DAYS * 864e5).toISOString().slice(0, 10);
  const snap = await db.collection("users").where("approvalStatus", "==", "approved").get();
  let nudged = 0;
  for (const ud of snap.docs) {
    const u = ud.data();
    if (u.role !== "member" || !u.email) continue;
    if (u.prefs && u.prefs.email === false) continue; // respect e-mail opt-out
    if (u.lastRetentionAt && nowMs - u.lastRetentionAt < RETENTION_COOLDOWN_MS) continue;
    const bsnap = await db.collection("bookings").where("userId", "==", ud.id).get();
    if (bsnap.empty) continue;
    let lastAttendedKey = "";
    let hasUpcoming = false;
    for (const bd of bsnap.docs) {
      const b = bd.data();
      const sd = await db.doc("sessions/" + b.sessionId).get();
      if (!sd.exists) continue;
      const s = sd.data();
      const date = s.date || "";
      if (b.state === "attended" && date > lastAttendedKey) lastAttendedKey = date;
      if (b.state === "confirmed" && !s.cancelled && date >= todayKey) hasUpcoming = true;
    }
    if (!lastAttendedKey) continue;            // never actually trained → onboarding, not retention
    if (hasUpcoming) continue;                  // already coming back
    if (lastAttendedKey >= lapseKey) continue;  // trained recently → not lapsed
    const name = (u.name || "").split(" ")[0];
    await sendMail(u.email, "מתגעגעים אליך ב-Omix 💛",
      `<h2 style="color:#a9842f">מתגעגעים אליך!</h2>
       <p>היי ${name},</p>
       <p>עבר קצת זמן מאז האימון האחרון שלך - ואנחנו כאן ומחכים לך. גם אימון אחד השבוע עושה את כל ההבדל, והגוף שלך יודה לך על החזרה לתנועה.</p>
       <p>שריינ/י מקום עכשיו, ונתראה על המזרן 🌿</p>
       ${ctaButton("קביעת אימון")}
       <p>באהבה,<br><b>עומר · Omix</b></p>`).catch((e) => logger.error("retention mail", e));
    await ud.ref.update({ lastRetentionAt: nowMs }).catch(() => {});
    nudged++;
  }
  return nudged;
}

// #14 Passive "default-present" attendance. Runs off the same hourly ping. For
// each not-yet-finalized session that has already ended, mark its still-confirmed
// bookings "attended" and consume one punch-card credit each (idempotent via
// booking.creditDeducted). Anyone the coach flagged No-Show beforehand is already
// out of the "confirmed" set, so they're skipped. Sessions that ended long ago
// are marked finalized WITHOUT processing, so enabling this doesn't retroactively
// bill a backlog of past classes.
const FINALIZE_WINDOW_MS = 12 * 3600 * 1000;
async function finalizeAttendance() {
  const now = Date.now();
  const sessions = await db.collection("sessions").get();
  let finalized = 0;
  for (const sd of sessions.docs) {
    const s = sd.data();
    if (s.cancelled || s.attendanceFinalized || !s.date) continue;
    const [y, m, d] = s.date.split("-").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0);
    start.setMinutes(s.startMin || 0);
    const end = start.getTime() + (s.durationMin || 60) * 60000;
    if (end > now) continue; // not ended yet
    if (now - end > FINALIZE_WINDOW_MS) {
      await sd.ref.update({ attendanceFinalized: true }).catch(() => {}); // skip backlog
      continue;
    }
    const bk = await db.collection("bookings")
      .where("sessionId", "==", sd.id).where("state", "==", "confirmed").get();
    for (const bd of bk.docs) {
      const b = bd.data();
      const patch = { state: "attended" };
      if (!b.creditDeducted) {
        const ud = await db.doc("users/" + b.userId).get();
        const left = ud.exists ? ud.data().passSessionsLeft : undefined;
        if (typeof left === "number" && left > 0) {
          await ud.ref.update({ passSessionsLeft: left - 1 }).catch(() => {});
          patch.creditDeducted = true;
        }
      }
      await bd.ref.update(patch).catch(() => {});
    }
    await sd.ref.update({ attendanceFinalized: true }).catch(() => {});
    finalized++;
  }
  return finalized;
}

// ---------------------------------------------------------------------------
// Transactional member e-mails, all via sendMail() (from office@, reply-to help@).
//   notifyApproval        - staff only: "you're approved, log in".
//   memberMail            - member action: booking confirmation / waitlist
//                           promotion. Guarded so it can't spam arbitrary users.
//   notifySessionCancelled- staff only: e-mail everyone booked on a cancelled
//                           session.
// ---------------------------------------------------------------------------
async function callerRole(context) {
  if (!context.auth) throw new fnV1.https.HttpsError("unauthenticated", "sign in");
  const caller = await db.doc("users/" + context.auth.uid).get();
  return caller.exists ? caller.data().role : null;
}

// Grant/revoke the `staff` custom claim that the security rules use to authorize
// management writes (sessions, services, payments, other users). Owners/admins
// assign roles in the app; this keeps the claim in sync so a promoted
// instructor/manager can actually write - and a demoted one can't. The 5 owner
// e-mails are staff by rule regardless, so this is really for non-owner staff.
exports.setStaffClaim = fnV1.https.onCall(async (data, context) => {
  const role = await callerRole(context);
  if (!["admin", "manager"].includes(role)) {
    throw new fnV1.https.HttpsError("permission-denied", "admin/manager only");
  }
  const uid = data && data.uid;
  const staff = !!(data && data.staff);
  if (!uid) throw new fnV1.https.HttpsError("invalid-argument", "uid required");
  const { getAuth } = require("firebase-admin/auth");
  // {staff:null} removes the claim entirely. Claims propagate on the target's
  // next token refresh (the client force-refreshes on load).
  await getAuth().setCustomUserClaims(uid, staff ? { staff: true } : { staff: null });
  return { ok: true, staff };
});

// Insurance lock: stamp the health-declaration date + medical-clearance gate from
// the ACTUAL saved declaration (server-side), so a member can't self-set these
// fields to bypass the medical block or the 12-month re-validation.
exports.finalizeHealthDeclaration = fnV1.https.onCall(async (data, context) => {
  if (!context.auth) throw new fnV1.https.HttpsError("unauthenticated", "sign in");
  const uid = context.auth.uid;
  const priv = await db.doc("users/" + uid + "/private/health").get();
  const form = priv.exists ? priv.data().healthForm : null;
  if (!form) return { ok: false };
  const { HEALTH_ITEMS } = require("./healthDoc");
  const flagged = HEALTH_ITEMS.some(([k]) => form[k] === true);
  await db.doc("users/" + uid).set(
    { healthDeclaredAt: Date.now(), medicalStatus: flagged ? "pending" : "cleared" },
    { merge: true },
  );
  return { ok: true, flagged };
});

// Record click-wrap consent evidence. The IP + timestamp are stamped SERVER-side
// (a browser can't reliably read its own public IP) so we have a solid record of
// what the user agreed to, when, from where, and against which document version.
exports.recordConsent = fnV1.https.onCall(async (data, context) => {
  if (!context.auth) throw new fnV1.https.HttpsError("unauthenticated", "sign in");
  const req = context.rawRequest || {};
  const fwd = (req.headers && (req.headers["x-forwarded-for"] || req.headers["fastly-client-ip"])) || "";
  const ip = String(fwd || req.ip || (req.connection && req.connection.remoteAddress) || "")
    .split(",")[0]
    .trim() || null;
  const consent = {
    version: (data && data.version) || null,
    terms: !!(data && data.terms),
    privacy: !!(data && data.privacy),
    waiver: !!(data && data.waiver),
    marketing: !!(data && data.marketing),
    ip,
    at: Date.now(),
    userAgent: (req.headers && req.headers["user-agent"]) || null,
  };
  await db.doc("users/" + context.auth.uid).set(
    { consent, marketingConsent: consent.marketing },
    { merge: true },
  );
  // Minor registration: store the guardian's court-grade verification record
  // (name + ID + server timestamp + IP) - the legal proof of parental consent.
  const g = data && data.guardian;
  if (g && g.idNumber) {
    await db.collection("parent_verifications").add({
      uid: context.auth.uid,
      minorName: (data && data.minorName) || null,
      parent_name: g.name || null,
      parent_id: g.idNumber || null,
      parent_phone: g.phone || null,
      parent_relationship: g.relationship || null,
      parent_approved_timestamp: Date.now(),
      parent_ip_address: ip,
      version: consent.version,
    });
  }
  return { ok: true };
});

// One-time migration: move sensitive fields (health form + PII) from each user's
// MAIN doc into users/{uid}/private/health, then delete them from the main doc,
// so members can no longer read other members' health data. Protected by RESET_KEY.
exports.migrateHealthPrivate = fnV1.https.onRequest(async (req, res) => {
  if (!process.env.RESET_KEY || req.query.key !== process.env.RESET_KEY) {
    return res.status(403).send("forbidden");
  }
  const PRIVATE = ["healthForm", "idNumber", "address", "dob", "age", "signedName", "hasMedicalCert", "medicalCertName"];
  const snap = await db.collection("users").get();
  let moved = 0;
  let empty = 0;
  for (const d of snap.docs) {
    const u = d.data();
    const priv = {};
    const del = {};
    for (const k of PRIVATE) {
      if (u[k] !== undefined) {
        priv[k] = u[k];
        del[k] = FieldValue.delete();
      }
    }
    if (Object.keys(priv).length === 0) {
      empty++;
      continue;
    }
    await db.doc("users/" + d.id + "/private/health").set(priv, { merge: true });
    await d.ref.update(del);
    moved++;
  }
  return res.json({ moved, empty });
});

// One-time backfill for the health-declaration insurance lock: stamp
// healthDeclaredAt (from the private declaration's submittedAt, else approvedAt)
// and medicalStatus="cleared" on already-approved members, so existing members
// aren't suddenly forced to re-declare. Protected by RESET_KEY.
exports.migrateHealthDeclared = fnV1.https.onRequest(async (req, res) => {
  if (!process.env.RESET_KEY || req.query.key !== process.env.RESET_KEY) {
    return res.status(403).send("forbidden");
  }
  const snap = await db.collection("users").get();
  let updated = 0;
  let skipped = 0;
  for (const d of snap.docs) {
    const u = d.data();
    if (u.role !== "member" || u.approvalStatus !== "approved" || u.healthDeclaredAt) {
      skipped++;
      continue;
    }
    let declaredAt = u.approvedAt || Date.now();
    try {
      const priv = await db.doc("users/" + d.id + "/private/health").get();
      if (priv.exists && priv.data().healthForm && priv.data().healthForm.submittedAt) {
        declaredAt = priv.data().healthForm.submittedAt;
      }
    } catch (e) { /* keep the fallback */ }
    await d.ref.update({ healthDeclaredAt: declaredAt, medicalStatus: "cleared" });
    updated++;
  }
  return res.json({ updated, skipped });
});

// One-time backfill: set the staff claim for every user whose role is staff
// (or an owner e-mail), clear it for everyone else. Protected by RESET_KEY.
exports.backfillStaffClaims = fnV1.https.onRequest(async (req, res) => {
  if (!process.env.RESET_KEY || req.query.key !== process.env.RESET_KEY) {
    return res.status(403).send("forbidden");
  }
  const { getAuth } = require("firebase-admin/auth");
  const auth = getAuth();
  const snap = await db.collection("users").get();
  let staffSet = 0;
  let cleared = 0;
  let skipped = 0;
  for (const d of snap.docs) {
    const u = d.data();
    const staff =
      ["admin", "manager", "instructor"].includes(u.role) ||
      OWNER_EMAILS.includes(String(u.email || "").toLowerCase());
    try {
      await auth.setCustomUserClaims(d.id, staff ? { staff: true } : { staff: null });
      if (staff) staffSet++;
      else cleared++;
    } catch (e) {
      skipped++; // no auth account for this uid
    }
  }
  return res.json({ staffSet, cleared, skipped });
});

const ctaButton = (label) =>
  `<p style="margin:22px 0"><a href="${APP_URL}" style="background:#c89b3c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">${label}</a></p>`;

// Staff permanently deletes a member: removes their bookings, calendar tokens,
// event signups and the user doc, then the Firebase Auth account so the e-mail
// frees up for a fresh registration. Admins are never deletable. Also handy for
// testing (register → delete → register again).
exports.deleteMember = fnV1.https.onCall(async (data, context) => {
  const role = await callerRole(context);
  if (!["admin", "manager"].includes(role)) {
    throw new fnV1.https.HttpsError("permission-denied", "admin/manager only");
  }
  const uid = data && data.uid;
  if (!uid) throw new fnV1.https.HttpsError("invalid-argument", "uid required");
  const target = await db.doc("users/" + uid).get();
  if (target.exists && target.data().role === "admin") {
    throw new fnV1.https.HttpsError("permission-denied", "admins can't be deleted");
  }
  // Delete owned docs (bookings, event signups) + per-user calendar token.
  for (const c of ["bookings", "eventSignups"]) {
    const snap = await db.collection(c).where("userId", "==", uid).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await db.doc("calTokens/" + uid).delete().catch(() => {});
  const email = target.exists ? (target.data().email || "") : "";
  await db.doc("users/" + uid).delete().catch(() => {});
  // Remove the auth account so the e-mail frees up for a fresh registration.
  // Delete by uid AND (belt-and-suspenders) by email — so even if the doc id and
  // the auth uid ever diverge, the address is always released.
  const { getAuth } = require("firebase-admin/auth");
  const auth = getAuth();
  let authDeleted = false;
  // Kill any live session immediately (existing tokens stop working), then delete.
  await auth.revokeRefreshTokens(uid).catch(() => {});
  await auth.deleteUser(uid).then(() => { authDeleted = true; }).catch((e) => logger.warn("auth delete by uid", uid, e && e.code));
  if (email) {
    try {
      const rec = await auth.getUserByEmail(email);
      if (rec) { await auth.deleteUser(rec.uid); authDeleted = true; }
    } catch (e) {
      if (e && e.code === "auth/user-not-found") authDeleted = true; // already gone
      else logger.error("auth delete by email", e);
    }
  }
  return { deleted: true, authDeleted };
});

// On-demand reset to a clean, live system: remove EVERY non-admin account
// (Firestore doc + auth) and wipe test transactions/schedule, keeping only the
// business admins. Protected by the reminder key. GET ...?key=...
exports.resetUsers = fnV1.https.onRequest(async (req, res) => {
  // Destructive (wipes all non-admin users + data) - gated by its OWN secret,
  // separate from REMINDER_KEY (which rides along in the reminder cron URL), and
  // requires an explicit confirm token so a leaked key alone can't nuke the DB.
  const RESET_KEY = process.env.RESET_KEY;
  if (!RESET_KEY || req.query.key !== RESET_KEY) return res.status(403).send("forbidden");
  if (req.query.confirm !== "RESET") return res.status(400).send("missing confirm=RESET");
  const { getAuth } = require("firebase-admin/auth");
  const auth = getAuth();
  const isAdmin = (email) => OWNER_EMAILS.includes(String(email || "").toLowerCase());
  let removedDocs = 0;
  let removedAuth = 0;
  let keptAdmins = 0;

  // 1) Firestore member docs: keep admins (force admin role), delete the rest + auth.
  const users = await db.collection("users").get();
  for (const d of users.docs) {
    const u = d.data();
    if (isAdmin(u.email)) {
      keptAdmins++;
      await d.ref.set({ role: "admin", approvalStatus: "approved", membershipActive: true }, { merge: true }).catch(() => {});
      continue;
    }
    await d.ref.delete().catch(() => {});
    removedDocs++;
    await auth.deleteUser(d.id).catch(() => {});
  }

  // 2) Any remaining auth account that isn't an admin (orphans) - delete it.
  let pageToken;
  do {
    const list = await auth.listUsers(1000, pageToken);
    pageToken = list.pageToken;
    for (const u of list.users) {
      if (isAdmin(u.email)) continue;
      await auth.deleteUser(u.uid).catch(() => {});
      removedAuth++;
    }
  } while (pageToken);

  // 3) Wipe test transactions + schedule for a clean live start (keep the
  //    catalog: services, classTypes, locations, facility, subscriptions).
  for (const c of ["bookings", "eventSignups", "payments", "calTokens", "leads", "sessions", "taskReminders", "audit"]) {
    const snap = await db.collection(c).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((x) => batch.delete(x.ref));
      await batch.commit();
    }
  }

  // 4) Reset the member-number counter.
  await db.doc("meta/counters").set({ memberSeq: 0 }, { merge: true }).catch(() => {});

  return res.json({ ok: true, removedDocs, removedAuth, keptAdmins });
});

// Diagnostic: inspect an account's real server state (auth + Firestore docs).
exports.notifyApproval = fnV1.https.onCall(async (data, context) => {
  const role = await callerRole(context);
  if (!["admin", "manager", "instructor"].includes(role)) {
    throw new fnV1.https.HttpsError("permission-denied", "staff only");
  }
  const uid = data && data.uid;
  if (!uid) throw new fnV1.https.HttpsError("invalid-argument", "uid required");
  const u = await db.doc("users/" + uid).get();
  const email = u.exists && u.data().email;
  if (!email) return { sent: false };
  const name = (u.data().name || "").split(" ")[0];
  await sendMail(email, "החשבון שלך אושר - אפשר להתחבר ל-Omix 🎉",
    `<h2 style="color:#a9842f">החשבון שלך אושר! 🎉</h2>
     <p>היי ${name},</p>
     <p>הצוות אישר את החשבון שלך ב-Omix. אפשר להתחבר עכשיו ולהתחיל להזמין אימונים.</p>
     ${ctaButton("כניסה ל-Omix")}
     <p>נתראה באימון!<br><b>עומר · Omix</b></p>`);
  return { sent: true };
});

// Staff resend of a branded verification e-mail for a pending registrant
// (generates a real Firebase verification link, wrapped in the OMIX template).
exports.sendVerificationLink = fnV1.https.onCall(async (data, context) => {
  const role = await callerRole(context);
  if (!["admin", "manager", "instructor"].includes(role)) {
    throw new fnV1.https.HttpsError("permission-denied", "staff only");
  }
  const uid = data && data.uid;
  if (!uid) throw new fnV1.https.HttpsError("invalid-argument", "uid required");
  const u = await db.doc("users/" + uid).get();
  const email = u.exists && u.data().email;
  if (!email) return { sent: false };
  const { getAuth } = require("firebase-admin/auth");
  const link = await getAuth().generateEmailVerificationLink(email, {
    url: APP_URL,
    handleCodeInApp: false,
  });
  const name = (u.data().name || "").split(" ")[0];
  await sendMail(email, "אימות המייל שלך ל-Omix 📧",
    `<h2 style="color:#a9842f">רק צעד אחד אחרון 📧</h2>
     <p>היי ${name},</p>
     <p>כדי להשלים את ההרשמה ל-Omix יש לאמת את כתובת המייל. לאחר האימות תוחזר/י אוטומטית לאפליקציה:</p>
     <p style="margin:22px 0"><a href="${link}" style="background:#c5a059;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">אימות מייל והמשך</a></p>
     <p style="font-size:13px;color:#6b5d47">אם קיבלת כמה מיילים - השתמש/י בקישור מהמייל האחרון בלבד.</p>
     <p>נתראה באימון!<br><b>עומר · Omix</b></p>`);
  return { sent: true };
});

// Self-service branded verification e-mail: the registrant sends it for their
// OWN address (from office@, so it lands in the inbox - not Firebase's default
// noreply which hits spam). The link carries a continueUrl back to the app, so
// clicking it returns them straight to finish registration.
exports.sendMyVerificationEmail = fnV1.https.onCall(async (data, context) => {
  if (!context.auth) throw new fnV1.https.HttpsError("unauthenticated", "sign in");
  const email = context.auth.token.email;
  if (!email) return { sent: false };
  const { getAuth } = require("firebase-admin/auth");
  const link = await getAuth().generateEmailVerificationLink(email, {
    url: APP_URL,
    handleCodeInApp: false,
  });
  const name = String(context.auth.token.name || email.split("@")[0] || "").split(" ")[0];
  // A fresh timestamp in the subject makes every (re)send a DISTINCT message, so
  // Gmail can't collapse identical repeats into one thread (which looked "empty").
  const now = new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
  await sendMail(email, `אימות המייל שלך ל-Omix · ${now} 📧`,
    `<h2 style="color:#a9842f">רק צעד אחד אחרון 📧</h2>
     <p>היי ${name},</p>
     <p>כדי להשלים את ההרשמה ל-Omix יש לאמת את כתובת המייל. לאחר האימות תוחזר/י אוטומטית להשלמת הרישום:</p>
     <p style="margin:22px 0"><a href="${link}" style="background:#c5a059;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">אימות מייל והמשך</a></p>
     <div style="background:#fff;border:1px solid #e6dcc4;border-radius:10px;padding:10px 14px;font-size:13px;color:#6b5d47">
       ✅ זהו הקישור העדכני (נשלח בשעה ${now}). אם קיבלת כמה מיילים - זה התקף, והקודמים כבר לא בתוקף.
     </div>
     <p style="font-size:13px;color:#6b5d47;margin-top:12px">לא נרשמת ל-Omix? אפשר להתעלם מהמייל.</p>
     <p>נתראה באימון!<br><b>עומר · Omix</b></p>`);
  return { sent: true };
});

// A registrant submitted their health declaration → e-mail Omer (office@ + omer@)
// the PDF + a smart, rule-based summary in the body (and the doctor's certificate
// if attached). From office@ so it lands in the inbox, not spam.
const HEALTH_RECIPIENTS = ["office@omixfit.com", "omer@omixfit.com"];
exports.notifyHealthSubmission = fnV1.https.onCall(async (data, context) => {
  if (!context.auth) throw new fnV1.https.HttpsError("unauthenticated", "sign in");
  const userId = data && data.userId;
  if (!userId) return { sent: false };
  // Only the registrant themselves (or staff) may trigger their health e-mail -
  // otherwise any signed-in member could spam Omer with fabricated submissions.
  const role = await callerRole(context);
  const isStaff = ["admin", "manager", "instructor"].includes(role);
  if (context.auth.uid !== userId && !isStaff) {
    throw new fnV1.https.HttpsError("permission-denied", "not your submission");
  }
  const snap = await db.doc("users/" + userId).get();
  if (!snap.exists) return { sent: false };
  // Health form + PII now live in the protected private subcollection; merge it
  // over the main doc (falling back to legacy fields during migration).
  const privSnap = await db.doc("users/" + userId + "/private/health").get();
  const user = Object.assign({}, snap.data(), privSnap.exists ? privSnap.data() : {});
  const form = user.healthForm;
  if (!form) return { sent: false };
  const { buildHealthSummary } = require("./healthDoc");
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "מתאמן/ת";
  const sum = buildHealthSummary(form);
  const attachments = [];
  // File name = full name + the trainee's member number, so it's easy to locate
  // the document later (e.g. "הצהרת בריאות - טוטו ילד - 12.pdf").
  const memberTag = user.memberNo != null && user.memberNo !== "" ? ` - ${user.memberNo}` : "";
  // The declaration PDF is rendered in the browser (perfect Hebrew) and sent here
  // as a data URL - we just attach it.
  if (data.pdfDataUrl && typeof data.pdfDataUrl === "string" && data.pdfDataUrl.includes(",")) {
    attachments.push({
      filename: `הצהרת בריאות - ${name}${memberTag}.pdf`,
      content: Buffer.from(data.pdfDataUrl.split(",")[1], "base64"),
      contentType: "application/pdf",
    });
  }
  if (data.certDataUrl && typeof data.certDataUrl === "string" && data.certDataUrl.includes(",")) {
    const [meta, b64] = data.certDataUrl.split(",");
    const m = /data:([^;]+)/.exec(meta);
    attachments.push({
      filename: data.certName || "תעודה-רפואית",
      content: Buffer.from(b64, "base64"),
      contentType: (m && m[1]) || undefined,
    });
  }
  const color = sum.flagged.length ? "#b0402f" : "#2f6b3b";
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#241c12;background:#f6efe0;padding:24px;border-radius:14px;max-width:560px">
    <h2 style="color:#a9842f;margin:0 0 6px">מתאמן/ת חדש/ה הגיש/ה בקשה 📝</h2>
    <p style="margin:0 0 14px">התקבלה הצהרת בריאות חדשה. יש לאשר את המתאמן/ת דרך המערכת.</p>
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:3px 0;color:#6b5d47">שם</td><td style="padding:3px 0"><b>${name}</b></td></tr>
      <tr><td style="padding:3px 0;color:#6b5d47">טלפון</td><td style="padding:3px 0" dir="ltr">${user.phone || "-"}</td></tr>
      <tr><td style="padding:3px 0;color:#6b5d47">אימייל</td><td style="padding:3px 0" dir="ltr">${user.email || "-"}</td></tr>
      <tr><td style="padding:3px 0;color:#6b5d47">ת&quot;ז</td><td style="padding:3px 0" dir="ltr">${user.idNumber || "-"}</td></tr>
    </table>
    <div style="margin:16px 0;padding:13px 15px;border-radius:10px;background:#fff;border-inline-start:4px solid ${color}">
      <p style="margin:0 0 4px;font-weight:bold;color:${color}">${sum.headline}</p>
      <p style="margin:0;white-space:pre-line;font-size:13px">${sum.body}</p>
    </div>
    ${ctaButton("אישור המתאמן/ת במערכת")}
    <p style="margin:14px 0 0;font-size:13px">ההצהרה המלאה מצורפת כקובץ PDF.</p>
    <p style="margin:6px 0 0"><b>Omix</b></p>
  </div>`;
  await mailer().sendMail({
    from: `Omix · עומר <${process.env.GMAIL_USER}>`,
    replyTo: REPLY_TO,
    to: HEALTH_RECIPIENTS.join(", "),
    subject: `בקשת הרשמה חדשה - ${name}${sum.flagged.length ? " ⚠️" : ""}`,
    html,
    attachments,
  });
  return { sent: true };
});

exports.memberMail = fnV1.https.onCall(async (data, context) => {
  if (!context.auth) throw new fnV1.https.HttpsError("unauthenticated", "sign in");
  const { kind, uid, sessionId } = data || {};
  if (!kind || !uid || !sessionId) throw new fnV1.https.HttpsError("invalid-argument", "kind, uid, sessionId required");
  // anti-abuse: only fires if the target really holds a confirmed booking here.
  const bk = await db.collection("bookings")
    .where("sessionId", "==", sessionId).where("userId", "==", uid)
    .where("state", "==", "confirmed").limit(1).get();
  if (bk.empty) return { sent: false };
  const u = await db.doc("users/" + uid).get();
  const email = u.exists && u.data().email;
  if (!email) return { sent: false };
  const info = await sessionInfo(sessionId);
  if (!info) return { sent: false };
  const name = (u.data().name || "").split(" ")[0];
  const when = `<b>${info.title}</b><br>בתאריך <b>${info.date}</b> בשעה <b>${info.time}</b>`;
  const video = info.video ? `<p>🎥 שיעור אונליין: <a href="${info.video}">להצטרפות לווידאו</a></p>` : "";
  if (kind === "promotion") {
    await sendMail(email, `התפנה מקום! שובצת ל-${info.title} 🎉`,
      `<h2 style="color:#a9842f">התפנה לך מקום! 🎉</h2>
       <p>היי ${name},</p><p>מקום התפנה והשיבוץ שלך אושר:</p><p>${when}</p>${video}
       ${ctaButton("צפייה בהזמנות שלי")}<p>נתראה!<br><b>עומר · Omix</b></p>`);
  } else {
    await sendMail(email, `אישור הרשמה: ${info.title} ב-${info.time}`,
      `<h2 style="color:#a9842f">נרשמת בהצלחה 💪</h2>
       <p>היי ${name},</p><p>שמרנו לך מקום:</p><p>${when}</p>${video}
       ${ctaButton("צפייה בהזמנות שלי")}<p>נתראה באימון!<br><b>עומר · Omix</b></p>`);
  }
  return { sent: true };
});

exports.notifySessionCancelled = fnV1.https.onCall(async (data, context) => {
  const role = await callerRole(context);
  if (!["admin", "manager", "instructor"].includes(role)) {
    throw new fnV1.https.HttpsError("permission-denied", "staff only");
  }
  const sessionId = data && data.sessionId;
  if (!sessionId) throw new fnV1.https.HttpsError("invalid-argument", "sessionId required");
  const info = await sessionInfo(sessionId);
  if (!info || !info.s.cancelled) return { sent: 0 };
  const bk = await db.collection("bookings").where("sessionId", "==", sessionId).get();
  let sent = 0;
  for (const bd of bk.docs) {
    const b = bd.data();
    if (b.state !== "confirmed" && b.state !== "waitlisted") continue;
    const u = await db.doc("users/" + b.userId).get();
    const email = u.exists && u.data().email;
    if (!email) continue;
    const name = (u.data().name || "").split(" ")[0];
    await sendMail(email, `בוטל: ${info.title} ב-${info.date}`,
      `<h2 style="color:#c0392b">שיעור בוטל</h2>
       <p>היי ${name},</p>
       <p>לצערנו <b>${info.title}</b> בתאריך <b>${info.date}</b> בשעה <b>${info.time}</b> בוטל.</p>
       <p>אפשר לבחור שיעור אחר במערכת. מתנצלים על אי-הנוחות.</p>
       ${ctaButton("בחירת שיעור אחר")}<p><b>עומר · Omix</b></p>`).catch((e) => logger.error("cancel mail", e));
    sent++;
  }
  return { sent };
});

// Broadcast a newly published event/retreat to active members (#12a). Email now;
// WhatsApp is left as a documented hook for when a Business API provider exists.
// Staff-only, and respects a member's e-mail opt-out (prefs.email === false).
exports.broadcastEvent = fnV1.https.onCall(async (data, context) => {
  const role = await callerRole(context);
  if (!["admin", "manager", "instructor"].includes(role)) {
    throw new fnV1.https.HttpsError("permission-denied", "staff only");
  }
  const eventId = data && data.eventId;
  if (!eventId) throw new fnV1.https.HttpsError("invalid-argument", "eventId required");
  const ed = await db.doc("events/" + eventId).get();
  if (!ed.exists || !ed.data().published) return { sent: 0 };
  const ev = ed.data();
  const eventUrl = `${APP_URL}#/events/${eventId}`;
  const whenLine = `${ev.date || ""}${ev.time ? " · " + ev.time : ""}`;
  const snap = await db.collection("users").where("membershipActive", "==", true).get();
  let sent = 0;
  for (const ud of snap.docs) {
    const u = ud.data();
    if (u.role !== "member" || !u.email) continue;
    if (u.prefs && u.prefs.email === false) continue; // respect opt-out
    const name = (u.name || "").split(" ")[0];
    await sendMail(u.email, `אירוע חדש ב-Omix: ${ev.title} 🎉`,
      `<h2 style="color:#a9842f">אירוע חדש נפתח להרשמה! 🎉</h2>
       <p>היי ${name},</p>
       <p>נפתח אירוע חדש: <b>${ev.title}</b>${whenLine ? `<br>מתי: <b>${whenLine}</b>` : ""}${ev.location ? `<br>היכן: <b>${ev.location}</b>` : ""}</p>
       <p>המקומות מוגבלים - כדאי להזדרז ולשריין מקום.</p>
       <p style="margin:22px 0"><a href="${eventUrl}" style="background:#c5a059;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">להרשמה לאירוע</a></p>
       <p>נתראה!<br><b>עומר · Omix</b></p>`).catch((e) => logger.error("broadcastEvent mail", e));
    sent++;
  }
  // TODO(WhatsApp): once a WhatsApp Business API provider (Twilio / Meta Cloud
  // API) is configured, dispatch the same broadcast to opted-in subscribers here.
  await ed.ref.update({ broadcastAt: Date.now() }).catch(() => {});
  return { sent };
});

// #10 Notify everyone booked on a session that its day/time changed. Call this
// AFTER the session doc is updated, so the e-mail reflects the new schedule.
exports.notifyScheduleChange = fnV1.https.onCall(async (data, context) => {
  const role = await callerRole(context);
  if (!["admin", "manager", "instructor"].includes(role)) {
    throw new fnV1.https.HttpsError("permission-denied", "staff only");
  }
  const sessionId = data && data.sessionId;
  if (!sessionId) throw new fnV1.https.HttpsError("invalid-argument", "sessionId required");
  const info = await sessionInfo(sessionId);
  if (!info) return { sent: 0 };
  const bk = await db.collection("bookings").where("sessionId", "==", sessionId).get();
  let sent = 0;
  for (const bd of bk.docs) {
    const b = bd.data();
    if (b.state !== "confirmed" && b.state !== "waitlisted") continue;
    const u = await db.doc("users/" + b.userId).get();
    const email = u.exists && u.data().email;
    if (!email) continue;
    const name = (u.data().name || "").split(" ")[0];
    await sendMail(email, `עדכון מועד: ${info.title}`,
      `<h2 style="color:#a9842f">עודכן מועד השיעור 🗓️</h2>
       <p>היי ${name},</p>
       <p>מועד <b>${info.title}</b> עודכן.<br>המועד החדש: <b>${info.date}</b> בשעה <b>${info.time}</b>.</p>
       ${ctaButton("צפייה בהזמנות שלי")}
       <p>נתראה!<br><b>עומר · Omix</b></p>`).catch((e) => logger.error("schedule change mail", e));
    sent++;
  }
  return { sent };
});

// Forgot-password: send a BRANDED reset e-mail from office@ (Gmail SMTP) instead
// of Firebase's raw noreply@…firebaseapp.com sender, which lands in spam. Public
// (called from the login screen, pre-auth). Unknown addresses are silently
// ignored so the endpoint can't be used to probe which e-mails are registered.
exports.sendPasswordReset = fnV1.https.onCall(async (data) => {
  const email = data && typeof data.email === "string" ? data.email.trim() : "";
  if (!email) throw new fnV1.https.HttpsError("invalid-argument", "email required");
  const { getAuth } = require("firebase-admin/auth");
  let link;
  try {
    link = await getAuth().generatePasswordResetLink(email);
  } catch (e) {
    return { sent: false }; // no such account → stay silent (no enumeration)
  }
  let name = "";
  try {
    const snap = await db.collection("users").where("email", "==", email.toLowerCase()).limit(1).get();
    if (!snap.empty) name = (snap.docs[0].data().name || "").split(" ")[0];
  } catch (e) { /* greeting is best-effort */ }
  await sendMail(email, "איפוס סיסמה ל-Omix 🔑",
    `<h2 style="color:#a9842f">איפוס סיסמה</h2>
     <p>היי${name ? " " + name : ""},</p>
     <p>קיבלנו בקשה לאיפוס הסיסמה שלך ב-Omix. לחץ/י על הכפתור כדי לבחור סיסמה חדשה:</p>
     <p style="margin:22px 0"><a href="${link}" style="background:#c5a059;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">איפוס הסיסמה</a></p>
     <p>אם לא ביקשת לאפס סיסמה, אפשר להתעלם מהודעה זו בבטחה.</p>
     <p>נתראה!<br><b>עומר · Omix</b></p>`);
  return { sent: true };
});
