import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { fetchPublishedEvents, submitEventSignup } from "../lib/store";
import type { SpecialEvent } from "../lib/types";
import { OmixMark } from "../components/Brand";
import { Toaster, toast } from "../components/Toast";

/** Public (no-login) retreat / special-event registration page — reached at
 *  #events. Anyone (incl. non-members) can browse published events and sign up. */
// Pull an individual-event id out of the hash: "#/events/<id>" → "<id>",
// "#events" / "#/events" → "" (the full list).
const eventIdFromHash = () => location.hash.replace(/^#\/?events\/?/, "");

export function PublicEvents() {
  const [events, setEvents] = useState<SpecialEvent[] | null>(null);
  const [targetId, setTargetId] = useState(eventIdFromHash);
  useEffect(() => {
    fetchPublishedEvents().then(setEvents).catch(() => setEvents([]));
  }, []);
  // Deep links change only the hash sub-path (publicRoute stays "events"), so
  // listen here to react when the shared/copied link targets a single event.
  useEffect(() => {
    const onHash = () => setTargetId(eventIdFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // A copied deep link opens that one event ("individual event page"); an unknown
  // id gracefully falls back to the full list.
  const focused = targetId && events ? events.find((e) => e.id === targetId) : null;
  const list = focused ? [focused] : events ?? [];

  return (
    <div className="onboard" style={{ alignItems: "flex-start", overflowY: "auto", paddingBlock: 32 }}>
      <div className="onboard-card" style={{ maxWidth: 560, width: "100%" }}>
        <span className="brand-emblem"><OmixMark size={48} /></span>
        <h1 style={{ marginBottom: 4 }}>{focused ? focused.title : t.events.publicTitle}</h1>
        <p className="login-sub" style={{ marginBottom: 18 }}>{t.events.publicSubtitle}</p>

        {events === null ? (
          <p className="muted">{t.events.loading}</p>
        ) : list.length === 0 ? (
          <p className="muted">{t.events.noneOpen}</p>
        ) : (
          <>
            {focused && (
              <a
                className="link-btn"
                href="#events"
                onClick={() => { location.hash = "events"; }}
                style={{ marginBottom: 12, display: "inline-block" }}
              >
                ← {t.events.seeAll}
              </a>
            )}
            {list.map((ev) => <EventCard key={ev.id} ev={ev} />)}
          </>
        )}

        <a className="link-btn" href="#/" onClick={() => { location.hash = ""; }} style={{ marginTop: 18 }}>
          {t.events.backToApp}
        </a>
      </div>
      <Toaster />
    </div>
  );
}

function EventCard({ ev }: { ev: SpecialEvent }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast(t.events.needNamePhone, "err");
      return;
    }
    setBusy(true);
    try {
      await submitEventSignup(ev.id, { name, phone, email });
      setDone(true);
    } catch {
      toast(t.events.signupErr, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 18, marginBottom: 16, textAlign: "start" }}>
      <h2 className="h2" style={{ marginBottom: 4 }}>{ev.title}</h2>
      <div className="muted" style={{ fontSize: ".85rem" }}>
        {ev.date}{ev.time ? ` · ${ev.time}` : ""}{ev.location ? ` · ${ev.location}` : ""}
      </div>
      {ev.description && <p style={{ marginTop: 8 }}>{ev.description}</p>}
      {ev.includes && <p style={{ marginTop: 6 }}><b>{t.events.includes}:</b> {ev.includes}</p>}
      <p style={{ marginTop: 6 }}><b>{t.events.price}:</b> ₪{ev.price}</p>

      {done ? (
        <div className="pay-card" style={{ marginTop: 10 }}>
          <span className="pay-h">{t.events.thanksTitle}</span>
          <small className="pay-hint">{t.events.thanks}</small>
        </div>
      ) : (
        <form onSubmit={submit} style={{ marginTop: 10 }}>
          <input className="input" placeholder={t.events.name} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder={t.events.phone} dir="ltr" style={{ marginTop: 8 }} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="input" placeholder={t.events.emailOpt} dir="ltr" style={{ marginTop: 8 }} value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-lime" style={{ marginTop: 10, width: "100%" }} disabled={busy}>
            {busy ? "…" : t.events.signup}
          </button>
        </form>
      )}
    </div>
  );
}
