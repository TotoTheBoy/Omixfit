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
