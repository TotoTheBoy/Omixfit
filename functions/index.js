// ---------------------------------------------------------------------------
// OMIX Cloud Functions (Blaze) — Google Calendar 2-way sync.
//
// Plain gen-1 HTTPS functions only (no Firestore triggers / eventarc), so the
// deploy needs no special IAM and isn't tied to the Firestore region.
//
//   calConnect  — owner opens this → Google OAuth consent.
//   calCallback — Google redirects back → store the refresh token (locked doc).
//   syncCalendar— callable the app invokes after session changes; mirrors all
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
// Email reminders — an external hourly cron pings this; it emails the booked
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
  res.json({ sent, trialsDisconnected, sessionsFinalized });
});

// Trial → pass rule: a member approved > 7 days ago who never bought a pass is
// disconnected (back to pending, membership off) and e-mailed to buy a pass.
// Runs off the same hourly reminder ping — no extra cron needed.
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
//   notifyApproval        — staff only: "you're approved, log in".
//   memberMail            — member action: booking confirmation / waitlist
//                           promotion. Guarded so it can't spam arbitrary users.
//   notifySessionCancelled— staff only: e-mail everyone booked on a cancelled
//                           session.
// ---------------------------------------------------------------------------
async function callerRole(context) {
  if (!context.auth) throw new fnV1.https.HttpsError("unauthenticated", "sign in");
  const caller = await db.doc("users/" + context.auth.uid).get();
  return caller.exists ? caller.data().role : null;
}

const ctaButton = (label) =>
  `<p style="margin:22px 0"><a href="${APP_URL}" style="background:#c89b3c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">${label}</a></p>`;

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
  const link = await getAuth().generateEmailVerificationLink(email);
  const name = (u.data().name || "").split(" ")[0];
  await sendMail(email, "אימות המייל שלך ל-Omix 📧",
    `<h2 style="color:#a9842f">רק צעד אחד אחרון 📧</h2>
     <p>היי ${name},</p>
     <p>כדי להשלים את ההרשמה ל-Omix יש לאמת את כתובת המייל שלך:</p>
     <p style="margin:22px 0"><a href="${link}" style="background:#c5a059;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">אימות מייל</a></p>
     <p>נתראה באימון!<br><b>עומר · Omix</b></p>`);
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
       <p>המקומות מוגבלים — כדאי להזדרז ולשריין מקום.</p>
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
