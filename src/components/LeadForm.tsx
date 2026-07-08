import { useState } from "react";
import { t } from "../lib/i18n";
import { submitLead } from "../lib/store";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";
import { CityPicker } from "./CityPicker";

/** Low-friction "leave your details" modal for the landing — creates a lead
 *  without an account so Omer can follow up (docs/refactor-spec.md §2). */
export function LeadForm({ onClose }: { onClose: () => void }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!first.trim() || !last.trim() || !phone.trim()) {
      toast(t.lead.needNamePhone, "err");
      return;
    }
    setBusy(true);
    try {
      await submitLead({ name: `${first.trim()} ${last.trim()}`, phone, city });
      setDone(true);
    } catch {
      toast(t.lead.err, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={t.lead.title}
      onClose={onClose}
      footer={
        done ? (
          <button className="btn btn-lime grow" onClick={onClose}>{t.close}</button>
        ) : (
          <button className="btn btn-lime grow" onClick={submit} disabled={busy}>
            {busy ? "…" : t.lead.submit}
          </button>
        )
      }
    >
      {done ? (
        <div className="pay-card">
          <span className="pay-h">{t.lead.thanksTitle}</span>
          <small className="pay-hint">{t.lead.thanks}</small>
        </div>
      ) : (
        <>
          <p className="muted" style={{ margin: "0 0 12px" }}>{t.lead.subtitle}</p>
          <div className="row gap-3 wrap">
            <div className="field grow" style={{ minWidth: 120 }}>
              <label>{t.health.firstNameLabel}</label>
              <input className="input" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
            </div>
            <div className="field grow" style={{ minWidth: 120 }}>
              <label>{t.health.lastNameLabel}</label>
              <input className="input" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
            </div>
          </div>
          <div className="field"><label>{t.lead.phone}</label>
            <input className="input" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></div>
          <div className="field"><label>{t.health.cityLabel}</label>
            <CityPicker value={city} onChange={setCity} /></div>
        </>
      )}
    </Sheet>
  );
}
