import { useMemo, useState } from "react";
import { t } from "../lib/i18n";
import type { BillingCycle, Subscription } from "../lib/types";
import { useStore, saveSubscriptions, newSubId } from "../lib/store";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";
import { IcClose, IcPlus } from "./icons";

const SYM: Record<string, string> = { EUR: "€", USD: "$", ILS: "₪" };
const CURRENCIES = ["ILS", "USD", "EUR"];
const CYCLES: BillingCycle[] = ["monthly", "yearly", "once", "free"];
const STATUSES = ["active", "trial", "cancelled"] as const;

const money = (a: number, c: string) =>
  a === 0 ? t.billing.free : `${SYM[c] ?? ""}${a.toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;

// The subscriptions we set up together — offered as a one-tap starter set.
const DEFAULTS: Subscription[] = [
  { id: "sub-gws", name: "Google Workspace", vendor: "Google", purpose: "אימייל עסקי (office@omixfit.com), יומן ו-Meet", amount: 8.1, currency: "EUR", cycle: "monthly", status: "trial", note: "מסלול Starter · משתמש 1 · החל בתקופת ניסיון 14 יום", url: "https://admin.google.com" },
  { id: "sub-domain", name: "דומיין omixfit.com", vendor: "Wix", purpose: "כתובת האתר והאימייל", amount: 0, currency: "ILS", cycle: "yearly", status: "active", note: "חיוב שנתי - עדכני את הסכום והתאריך מתוך Wix", url: "https://manage.wix.com/account/domains" },
  { id: "sub-vercel", name: "אחסון האתר", vendor: "Vercel", purpose: "אירוח דף הנחיתה והאפליקציה", amount: 0, currency: "USD", cycle: "free", status: "active", note: "מסלול Hobby - חינם", url: "https://vercel.com/dashboard" },
  { id: "sub-firebase", name: "שרת ומסד נתונים", vendor: "Firebase (Google)", purpose: "התחברות, מסד נתונים וסנכרון בזמן אמת", amount: 0, currency: "USD", cycle: "free", status: "active", note: "מסלול Spark - חינם", url: "https://console.firebase.google.com" },
];

export function Billing({ onClose }: { onClose: () => void }) {
  const subs = useStore((s) => s.subscriptions);
  const [edit, setEdit] = useState<Subscription | "new" | null>(null);

  const monthly = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of subs) {
      if (s.status === "cancelled") continue;
      const v = s.cycle === "monthly" ? s.amount : s.cycle === "yearly" ? s.amount / 12 : 0;
      if (v > 0) m[s.currency] = (m[s.currency] ?? 0) + v;
    }
    return m;
  }, [subs]);
  const activeCount = subs.filter((s) => s.status !== "cancelled").length;
  const monthlyLabel = Object.entries(monthly).map(([c, v]) => money(v, c)).join(" + ") || t.billing.free;

  function persist(next: Subscription[]) {
    saveSubscriptions(next);
  }
  function onSave(s: Subscription) {
    const exists = subs.some((x) => x.id === s.id);
    persist(exists ? subs.map((x) => (x.id === s.id ? s : x)) : [...subs, s]);
    setEdit(null);
    toast(t.finance ? "נשמר" : "נשמר", "ok");
  }
  function onDelete(id: string) {
    persist(subs.filter((x) => x.id !== id));
    setEdit(null);
  }

  return (
    <div className="billing-screen" role="dialog" aria-label={t.billing.title}>
      <header className="billing-top">
        <div>
          <strong>{t.billing.title}</strong>
          <span className="billing-sub">{t.billing.subtitle}</span>
        </div>
        <button className="iconbtn" onClick={onClose} aria-label={t.billing.close}><IcClose /></button>
      </header>

      <div className="billing-body">
        <div className="billing-kpis">
          <div className="billing-kpi big">
            <span className="bk-val">{monthlyLabel}</span>
            <span className="bk-label">{t.billing.monthlyEst}</span>
          </div>
          <div className="billing-kpi">
            <span className="bk-val">{activeCount}</span>
            <span className="bk-label">{t.billing.activeCount(activeCount)}</span>
          </div>
        </div>

        {subs.length === 0 ? (
          <div className="billing-empty">
            <p>{t.billing.empty}</p>
            <button className="btn btn-lime" onClick={() => persist(DEFAULTS)}>{t.billing.loadDefaults}</button>
          </div>
        ) : (
          <>
            <button className="btn btn-ink billing-add" onClick={() => setEdit("new")}>
              <IcPlus width={16} height={16} /> {t.billing.add}
            </button>
            <div className="sub-list">
              {subs.map((s) => (
                <button key={s.id} className={`sub-row ${s.status === "cancelled" ? "off" : ""}`} onClick={() => setEdit(s)}>
                  <span className="sub-main">
                    <span className="sub-name">
                      {s.name}
                      <span className={`tag sub-${s.status}`}>{t.billing.statuses[s.status]}</span>
                    </span>
                    <small>{s.vendor} · {s.purpose}</small>
                    {s.note && <small className="sub-note">{s.note}</small>}
                  </span>
                  <span className="sub-cost">
                    <b>{money(s.amount, s.currency)}</b>
                    <small>{t.billing.cycles[s.cycle]}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {edit && (
        <SubEditor
          sub={edit === "new" ? null : edit}
          onSave={onSave}
          onDelete={onDelete}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

function SubEditor({
  sub, onSave, onDelete, onClose,
}: {
  sub: Subscription | null;
  onSave: (s: Subscription) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(sub?.name ?? "");
  const [vendor, setVendor] = useState(sub?.vendor ?? "");
  const [purpose, setPurpose] = useState(sub?.purpose ?? "");
  const [amount, setAmount] = useState(sub?.amount ?? 0);
  const [currency, setCurrency] = useState(sub?.currency ?? "ILS");
  const [cycle, setCycle] = useState<BillingCycle>(sub?.cycle ?? "monthly");
  const [status, setStatus] = useState<Subscription["status"]>(sub?.status ?? "active");
  const [note, setNote] = useState(sub?.note ?? "");
  const [url, setUrl] = useState(sub?.url ?? "");

  function save() {
    if (!name.trim()) return toast(t.billing.name, "err");
    onSave({
      id: sub?.id ?? newSubId(),
      name: name.trim(), vendor: vendor.trim(), purpose: purpose.trim(),
      amount: cycle === "free" ? 0 : Number(amount) || 0,
      currency, cycle, status,
      note: note.trim() || undefined, url: url.trim() || undefined,
    });
  }

  return (
    <Sheet title={sub ? t.billing.edit : t.billing.add} onClose={onClose}
      footer={
        <>
          {sub && <button className="btn btn-danger btn-sm" onClick={() => onDelete(sub.id)}>{t.billing.remove}</button>}
          <button className="btn btn-lime grow" onClick={save}>{t.billing.save}</button>
        </>
      }>
      <div className="field"><label htmlFor="sb-name">{t.billing.name}</label>
        <input id="sb-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="row gap-3 wrap">
        <div className="field grow"><label htmlFor="sb-vendor">{t.billing.vendor}</label>
          <input id="sb-vendor" className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
        <div className="field grow"><label htmlFor="sb-status">{t.billing.status}</label>
          <select id="sb-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as Subscription["status"])}>
            {STATUSES.map((s) => <option key={s} value={s}>{t.billing.statuses[s]}</option>)}
          </select></div>
      </div>
      <div className="field"><label htmlFor="sb-purpose">{t.billing.purpose}</label>
        <input id="sb-purpose" className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></div>
      <div className="row gap-3 wrap">
        <div className="field grow"><label htmlFor="sb-cycle">{t.billing.cycle}</label>
          <select id="sb-cycle" className="select" value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}>
            {CYCLES.map((c) => <option key={c} value={c}>{t.billing.cycles[c]}</option>)}
          </select></div>
        {cycle !== "free" && (
          <>
            <div className="field grow"><label htmlFor="sb-amount">{t.billing.amount}</label>
              <input id="sb-amount" className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
            <div className="field grow"><label htmlFor="sb-cur">{t.billing.currency}</label>
              <select id="sb-cur" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{SYM[c]} {c}</option>)}
              </select></div>
          </>
        )}
      </div>
      <div className="field"><label htmlFor="sb-note">{t.billing.note}</label>
        <input id="sb-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="field"><label htmlFor="sb-url">{t.billing.url}</label>
        <input id="sb-url" className="input" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></div>
    </Sheet>
  );
}
