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

function oauth() {
  return new google.auth.OAuth2(process.env.GCAL_CLIENT_ID, process.env.GCAL_CLIENT_SECRET, REDIRECT);
}

// Owner opens this URL → Google consent screen.
exports.calConnect = fnV1.https.onRequest((req, res) => {
  const url = oauth().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
  });
  res.redirect(url);
});

// Google redirects back here with a code → store the refresh token.
exports.calCallback = fnV1.https.onRequest(async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("missing code");
  try {
    const { tokens } = await oauth().getToken(code);
    if (tokens.refresh_token) {
      await db.doc(CAL_DOC).set({ refreshToken: tokens.refresh_token, connectedAt: Date.now() }, { merge: true });
      await db.doc("meta/calendarStatus").set({ connected: true, connectedAt: Date.now() }, { merge: true });
    }
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send("<html dir='rtl'><body style='font-family:sans-serif;text-align:center;padding-top:60px;background:#f6efe0;color:#241c12'><h2>היומן חובר בהצלחה ✅</h2><p>אפשר לסגור את החלון ולחזור ל-Omix.</p></body></html>");
  } catch (e) {
    logger.error("calCallback", e);
    res.status(500).send("auth failed");
  }
});

async function calendar() {
  const snap = await db.doc(CAL_DOC).get();
  const rt = snap.exists && snap.data().refreshToken;
  if (!rt) return null;
  const o = oauth();
  o.setCredentials({ refresh_token: rt });
  return google.calendar({ version: "v3", auth: o });
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

// Callable from the app (after any session change, or a manual "sync now").
// Mirrors every upcoming session into the connected Google Calendar.
exports.syncCalendar = fnV1.https.onCall(async (data, context) => {
  if (!context.auth) throw new fnV1.https.HttpsError("unauthenticated", "sign in");
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
  res.json({ sent });
});
