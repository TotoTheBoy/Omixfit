import { useState } from "react";
import { t } from "../lib/i18n";
import {
  useStore, upsertEvent, deleteEvent, newEventId,
  fetchEventSignups, markEventSignupPaid,
} from "../lib/store";
import type { EventSignup, SpecialEvent } from "../lib/types";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";
import { IcPlus } from "./icons";

const BASE = import.meta.env.BASE_URL; // "/" at root, "/<subpath>/" under a subpath
const PUBLIC_LINK = () => `${location.origin}${BASE}#events`;
// Deep link that opens ONE event on the public page (fixes #12b — the old link
// only ever opened the generic events list).
const eventLink = (id: string) => `${location.origin}${BASE}#/events/${id}`;

/** Owner UI (a Manage tab) to create/publish events and see who registered. */
export function EventsAdmin() {
  const data = useStore((s) => s);
  const events = [...data.events].sort((a, b) => b.createdAt - a.createdAt);
  const [editing, setEditing] = useState<SpecialEvent | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <p className="muted" style={{ fontSize: ".85rem", margin: "0 0 10px" }}>{t.events.manageHint}</p>
      <div className="row gap-2 wrap" style={{ marginBottom: 14 }}>
        <button className="btn btn-lime" onClick={() => setCreating(true)}>
          <IcPlus width={18} height={18} /> {t.events.newEvent}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => { navigator.clipboard?.writeText(PUBLIC_LINK()); toast(t.events.linkCopied, "ok"); }}
        >
          🔗 {t.events.copyLink}
        </button>
      </div>

      {events.length === 0 ? (
        <p className="muted">{t.events.emptyAdmin}</p>
      ) : (
        events.map((ev) => <EventRow key={ev.id} ev={ev} onEdit={() => setEditing(ev)} />)
      )}

      {(creating || editing) && (
        <EventEditor ev={editing} onClose={() => { setCreating(false); setEditing(null); }} />
      )}
    </div>
  );
}

function EventRow({ ev, onEdit }: { ev: SpecialEvent; onEdit: () => void }) {
  const [signups, setSignups] = useState<EventSignup[] | null>(null);
  async function toggleSignups() {
    if (signups) return setSignups(null);
    setSignups(await fetchEventSignups(ev.id).catch(() => []));
  }
  return (
    <div className="card" style={{ padding: 14, marginBottom: 10 }}>
      <div className="row gap-3" style={{ alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{ev.title}</b>{" "}
          <span className={`tag ${ev.published ? "role-manager" : "inactive"}`}>
            {ev.published ? t.events.published : "טיוטה"}
          </span>
          <div className="mr-sub">{ev.date}{ev.time ? ` · ${ev.time}` : ""} · ₪{ev.price}</div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          title={t.events.copyLink}
          aria-label={t.events.copyLink}
          onClick={() => { navigator.clipboard?.writeText(eventLink(ev.id)); toast(t.events.linkCopied, "ok"); }}
        >🔗</button>
        <button className="btn btn-ghost btn-sm" onClick={onEdit}>{t.events.edit}</button>
      </div>
      <button className="link-btn" style={{ marginTop: 8 }} onClick={toggleSignups}>
        {signups ? "▲" : "▼"} {t.events.signupsTitle(signups?.length ?? 0)}
      </button>
      {signups && (
        signups.length === 0 ? (
          <p className="muted" style={{ marginTop: 6 }}>{t.events.noSignups}</p>
        ) : (
          <ul className="member-details" style={{ marginTop: 6 }}>
            {signups.map((s) => (
              <li key={s.id}>
                <span>{s.name} · <span dir="ltr">{s.phone}</span></span>
                <button
                  className={`tag ${s.paid ? "role-manager" : "tag-new"}`}
                  onClick={async () => { await markEventSignupPaid(s.id, !s.paid); setSignups((await fetchEventSignups(ev.id))); }}
                >
                  {s.paid ? t.events.markedPaid : t.events.markPaid}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function EventEditor({ ev, onClose }: { ev: SpecialEvent | null; onClose: () => void }) {
  const [f, setF] = useState<SpecialEvent>(
    ev ?? {
      id: newEventId(), title: "", description: "", date: "", time: "", location: "",
      includes: "", price: 0, capacity: 20, published: false, createdAt: Date.now(),
    },
  );
  const set = (p: Partial<SpecialEvent>) => setF((x) => ({ ...x, ...p }));

  function save() {
    if (!f.title.trim() || !f.date) { toast(t.events.needNamePhone, "err"); return; }
    upsertEvent({ ...f, title: f.title.trim(), price: Number(f.price) || 0, capacity: Number(f.capacity) || 0 });
    toast(t.events.save, "ok");
    onClose();
  }

  return (
    <Sheet title={ev ? t.events.editEvent : t.events.newEvent} onClose={onClose}
      footer={<button className="btn btn-lime grow" onClick={save}>{t.events.save}</button>}
    >
      <div className="field"><label>{t.events.titleField}</label>
        <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} /></div>
      <div className="field"><label>{t.events.descField}</label>
        <textarea className="input" rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} /></div>
      <div className="row gap-2">
        <div className="field grow"><label>{t.events.dateField}</label>
          <input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></div>
        <div className="field grow"><label>{t.events.timeField}</label>
          <input className="input" value={f.time} placeholder="10:00" onChange={(e) => set({ time: e.target.value })} /></div>
      </div>
      <div className="field"><label>{t.events.locationField}</label>
        <input className="input" value={f.location} onChange={(e) => set({ location: e.target.value })} /></div>
      <div className="field"><label>{t.events.includesField}</label>
        <input className="input" value={f.includes} onChange={(e) => set({ includes: e.target.value })} /></div>
      <div className="row gap-2">
        <div className="field grow"><label>{t.events.priceField}</label>
          <input className="input" type="number" dir="ltr" value={f.price} onChange={(e) => set({ price: Number(e.target.value) })} /></div>
        <div className="field grow"><label>{t.events.capacityField}</label>
          <input className="input" type="number" dir="ltr" value={f.capacity} onChange={(e) => set({ capacity: Number(e.target.value) })} /></div>
      </div>
      <label className="pref-row" style={{ borderTop: "none", borderBottom: "none", cursor: "pointer" }}>
        <div className="pr-main"><b>{t.events.published}</b></div>
        <button type="button" className={`switch ${f.published ? "on" : ""}`} role="switch" aria-checked={f.published}
          aria-label={t.events.published} onClick={() => set({ published: !f.published })} />
      </label>
      {ev && (
        <button className="btn btn-danger btn-sm" style={{ marginTop: 12 }}
          onClick={() => { deleteEvent(ev.id); toast(t.events.delete, "info"); onClose(); }}>
          {t.events.delete}
        </button>
      )}
    </Sheet>
  );
}
