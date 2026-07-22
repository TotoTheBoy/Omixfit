import { useMemo, useState } from "react";
import { t } from "../lib/i18n";
import type { Payment, Service, ServiceKind, BillingModel } from "../lib/types";
import {
  useStore,
  recordPayment,
  upsertService,
  deleteService,
  newServiceId,
} from "../lib/store";
import { clientBalances, clientValueScores, revenueSummary } from "../lib/engine";
import { RECOMMENDED_CATALOG } from "../lib/catalog";
import { Avatar } from "./common";
import { Reports } from "./Reports";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";

const KINDS: ServiceKind[] = ["personal", "group", "zoom", "therapy", "injury"];
const BILLINGS: BillingModel[] = ["package", "subscription", "session"];

export function Finance() {
  const [tab, setTab] = useState<"overview" | "balances" | "services" | "reports">("overview");
  const [payOpen, setPayOpen] = useState(false);
  const [editSvc, setEditSvc] = useState<Service | null | "new">(null);

  return (
    <div>
      <div className="seg" role="tablist" style={{ marginBottom: 16 }}>
        <button role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}>
          {t.finance.overview}
        </button>
        <button role="tab" aria-selected={tab === "balances"} className={tab === "balances" ? "on" : ""} onClick={() => setTab("balances")}>
          {t.finance.balancesTab}
        </button>
        <button role="tab" aria-selected={tab === "services"} className={tab === "services" ? "on" : ""} onClick={() => setTab("services")}>
          {t.finance.servicesTab}
        </button>
        <button role="tab" aria-selected={tab === "reports"} className={tab === "reports" ? "on" : ""} onClick={() => setTab("reports")}>
          {t.finance.reportsTab}
        </button>
      </div>

      {tab === "overview" && <Overview onRecord={() => setPayOpen(true)} />}
      {tab === "balances" && <Balances onRecord={() => setPayOpen(true)} />}
      {tab === "services" && <Services onEdit={(s) => setEditSvc(s)} onNew={() => setEditSvc("new")} />}
      {tab === "reports" && <Reports />}

      {payOpen && <RecordPaymentSheet onClose={() => setPayOpen(false)} />}
      {editSvc && (
        <ServiceEditor service={editSvc === "new" ? null : editSvc} onClose={() => setEditSvc(null)} />
      )}
    </div>
  );
}

function Overview({ onRecord }: { onRecord: () => void }) {
  const data = useStore((s) => s);
  const sum = useMemo(() => revenueSummary(data), [data]);
  const scores = useMemo(() => clientValueScores(data).slice(0, 8), [data]);
  const recent = useMemo(
    () => [...data.payments].sort((a, b) => b.date - a.date).slice(0, 8),
    [data.payments],
  );
  const maxKind = Math.max(1, ...sum.byKind.values());
  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? "-";

  return (
    <div className="fin">
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>{t.finance.title}</h2>
          <p className="sub">{t.finance.paymentsCount(sum.count)}</p>
        </div>
        <button className="btn btn-lime" onClick={onRecord}>+ {t.finance.recordPayment}</button>
      </div>

      <div className="fin-kpis">
        <Kpi label={t.finance.totalIncome} value={t.finance.nis(sum.total)} big />
        <Kpi label={t.finance.monthIncome} value={t.finance.nis(sum.month)} />
      </div>

      <h3 className="h2 fin-h">{t.finance.byService}</h3>
      <div className="fin-bars">
        {KINDS.filter((k) => (sum.byKind.get(k) ?? 0) > 0).length === 0 ? (
          <p className="muted">{t.finance.noPayments}</p>
        ) : (
          KINDS.map((k) => {
            const v = sum.byKind.get(k) ?? 0;
            if (v <= 0) return null;
            return (
              <div className="fin-bar-row" key={k}>
                <span className="fin-bar-label">{t.finance.kinds[k]}</span>
                <div className="fin-bar-track">
                  <div className="fin-bar-fill" style={{ width: `${(v / maxKind) * 100}%` }} />
                </div>
                <span className="fin-bar-val">{t.finance.nis(v)}</span>
              </div>
            );
          })
        )}
      </div>

      <h3 className="h2 fin-h">{t.finance.topClients}</h3>
      <div className="fin-leaders">
        {scores.length === 0 || scores.every((s) => s.score === 0) ? (
          <p className="muted">{t.finance.noPayments}</p>
        ) : (
          scores.map((s, i) => (
            <div className="fin-leader" key={s.user.id}>
              <span className="fin-rank">{i + 1}</span>
              <Avatar user={s.user} size={34} />
              <span className="fin-leader-name">
                {s.user.name}
                <small>{t.finance.nis(s.revenue)} · {s.attended} {t.finance.attendedLabel}</small>
              </span>
              <span className="fin-score">{s.score}</span>
            </div>
          ))
        )}
      </div>

      <h3 className="h2 fin-h">{t.finance.recentPayments}</h3>
      {recent.length === 0 ? (
        <p className="muted">{t.finance.noPayments}</p>
      ) : (
        <div className="fin-pays">
          {recent.map((p) => (
            <div className="fin-pay" key={p.id}>
              <span className={`tag kind-${p.kind}`}>{t.finance.kinds[p.kind]}</span>
              <span className="fin-pay-main">
                {userName(p.userId)}
                <small>{p.serviceName} · {new Date(p.date).toLocaleDateString("he-IL")}</small>
              </span>
              <b className="fin-pay-amt">{t.finance.nis(p.amount)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Balances({ onRecord }: { onRecord: () => void }) {
  const data = useStore((s) => s);
  const balances = useMemo(() => clientBalances(data), [data]);
  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>{t.finance.balancesTitle}</h2>
          <p className="sub">{t.finance.balancesSub}</p>
        </div>
        <button className="btn btn-lime" onClick={onRecord}>+ {t.finance.recordPayment}</button>
      </div>
      {balances.length === 0 ? (
        <p className="muted">{t.finance.noBalances}</p>
      ) : (
        <div className="bal-list">
          {balances.map((b) => {
            const pct = b.purchased ? Math.max(0, Math.min(100, (b.remaining / b.purchased) * 100)) : 0;
            const left = Math.max(0, b.remaining);
            const tone = b.remaining <= 0 ? "red" : b.remaining <= 2 ? "orange" : "green";
            return (
              <div className="bal-row" key={b.user.id}>
                <Avatar user={b.user} size={40} />
                <div className="bal-body">
                  <div className="bal-name">
                    {b.user.name}
                    <span className={`bal-count tone-${tone}`}>{t.finance.remainingN(left)}</span>
                  </div>
                  <div className="bal-track">
                    <div className={`bal-fill tone-${tone}`} style={{ width: `${pct}%` }} />
                  </div>
                  <small className="bal-sub">{t.finance.ofPurchased(b.used, b.purchased)}</small>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`fin-kpi ${big ? "big" : ""}`}>
      <span className="fin-kpi-val">{value}</span>
      <span className="fin-kpi-label">{label}</span>
    </div>
  );
}

function Services({ onEdit, onNew }: { onEdit: (s: Service) => void; onNew: () => void }) {
  const services = useStore((s) => s.services);
  const sorted = [...services].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "he"));
  const [loading, setLoading] = useState(false);

  // One-tap: write Omixfit's real price list (group / online / personal). Ids are
  // fixed (cat-*), so it's additive/idempotent — it never touches other services.
  async function loadCatalog() {
    setLoading(true);
    try {
      for (const s of RECOMMENDED_CATALOG) await upsertService(s);
      toast(t.finance.catalogLoaded, "ok");
    } catch {
      toast(t.finance.catalogFailed, "err");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <h2 className="h2" style={{ margin: 0 }}>{t.finance.servicesTab}</h2>
        <button className="btn btn-lime" onClick={onNew}>+ {t.finance.newService}</button>
      </div>
      {sorted.length === 0 ? (
        <div className="svc-empty">
          <p className="muted">{t.finance.noServices}</p>
          <button className="btn btn-lime" onClick={loadCatalog} disabled={loading}>
            {loading ? t.finance.catalogLoading : t.finance.loadCatalog}
          </button>
          <small className="muted">{t.finance.loadCatalogHint}</small>
        </div>
      ) : (
        <div className="svc-list">
          {sorted.map((s) => (
            <button key={s.id} className={`svc-row ${s.active ? "" : "off"}`} onClick={() => onEdit(s)}>
              <span className={`tag kind-${s.kind}`}>{t.finance.kinds[s.kind]}</span>
              <span className="svc-main">
                {s.name}
                <small>{t.finance.billing[s.billing]}{s.units ? ` · ${s.units}` : ""}{s.online ? " · אונליין" : ""}</small>
              </span>
              <b className="svc-price">{t.finance.nis(s.price)}</b>
            </button>
          ))}
          <button className="btn btn-ghost btn-sm svc-reload" onClick={loadCatalog} disabled={loading}>
            {loading ? t.finance.catalogLoading : t.finance.reloadCatalog}
          </button>
        </div>
      )}
    </div>
  );
}

function RecordPaymentSheet({ onClose }: { onClose: () => void }) {
  const data = useStore((s) => s);
  const members = data.users.filter((u) => u.role === "member");
  const services = data.services.filter((s) => s.active);
  const [userId, setUserId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function pickService(id: string) {
    setServiceId(id);
    const s = data.services.find((x) => x.id === id);
    if (s) setAmount(s.price);
  }

  async function save() {
    if (!userId || !serviceId) return toast(t.finance.needClientService, "err");
    const svc = data.services.find((x) => x.id === serviceId)!;
    setBusy(true);
    const p: Omit<Payment, "id" | "actorId"> = {
      userId,
      serviceId,
      serviceName: svc.name,
      kind: svc.kind,
      amount: Number(amount) || 0,
      units: svc.billing === "package" ? svc.units : undefined,
      date: Date.now(),
      note: note.trim() || undefined,
    };
    try {
      await recordPayment(p);
      toast(t.finance.paymentSaved, "ok");
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t.finance.recordPayment} onClose={onClose}
      footer={<button className="btn btn-lime grow" onClick={save} disabled={busy}>{t.finance.save}</button>}>
      <div className="field">
        <label htmlFor="pay-client">{t.finance.client}</label>
        <select id="pay-client" className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">{t.finance.selectClient}</option>
          {members.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pay-svc">{t.finance.service}</label>
        <select id="pay-svc" className="select" value={serviceId} onChange={(e) => pickService(e.target.value)}>
          <option value="">{t.finance.selectService}</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {t.finance.nis(s.price)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pay-amt">{t.finance.amount} (₪)</label>
        <input id="pay-amt" className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="pay-note">{t.finance.note}</label>
        <input id="pay-note" className="input" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Sheet>
  );
}

function ServiceEditor({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const editing = !!service;
  const [name, setName] = useState(service?.name ?? "");
  const [kind, setKind] = useState<ServiceKind>(service?.kind ?? "personal");
  const [billing, setBilling] = useState<BillingModel>(service?.billing ?? "session");
  const [price, setPrice] = useState(service?.price ?? 0);
  const [units, setUnits] = useState(service?.units ?? 10);
  const [online, setOnline] = useState(service?.online ?? false);
  const [active, setActive] = useState(service?.active ?? true);

  async function save() {
    if (!name.trim()) return toast(t.finance.serviceName, "err");
    const s: Service = {
      id: service?.id ?? newServiceId(),
      name: name.trim(),
      kind,
      billing,
      price: Number(price) || 0,
      units: billing === "package" ? Number(units) || undefined : undefined,
      online: kind === "zoom" ? online : undefined,
      active,
    };
    await upsertService(s);
    toast(t.finance.serviceSaved, "ok");
    onClose();
  }
  async function remove() {
    if (!service) return;
    await deleteService(service.id);
    toast(t.finance.serviceDeleted, "info");
    onClose();
  }

  return (
    <Sheet title={editing ? t.finance.editService : t.finance.newService} onClose={onClose}
      footer={
        <>
          {editing && <button className="btn btn-danger btn-sm" onClick={remove}>{t.finance.deleteService}</button>}
          <button className="btn btn-lime grow" onClick={save}>{t.finance.save}</button>
        </>
      }>
      <div className="field">
        <label htmlFor="svc-name">{t.finance.serviceName}</label>
        <input id="svc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="svc-kind">{t.finance.kind}</label>
        <select id="svc-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as ServiceKind)}>
          {KINDS.map((k) => <option key={k} value={k}>{t.finance.kinds[k]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="svc-billing">{t.finance.billingModel}</label>
        <select id="svc-billing" className="select" value={billing} onChange={(e) => setBilling(e.target.value as BillingModel)}>
          {BILLINGS.map((bm) => <option key={bm} value={bm}>{t.finance.billing[bm]}</option>)}
        </select>
      </div>
      <div className="row gap-3 wrap">
        <div className="field grow">
          <label htmlFor="svc-price">{t.finance.price} (₪)</label>
          <input id="svc-price" className="input" type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </div>
        {billing === "package" && (
          <div className="field grow">
            <label htmlFor="svc-units">{t.finance.units}</label>
            <input id="svc-units" className="input" type="number" min={1} value={units} onChange={(e) => setUnits(Number(e.target.value))} />
          </div>
        )}
      </div>
      {kind === "zoom" && (
        <label className="pref-row" style={{ borderBottom: "none" }}>
          <span className="pr-main"><b>{t.finance.onlineLabel}</b></span>
          <input type="checkbox" className="switch-cb" checked={online} onChange={(e) => setOnline(e.target.checked)} aria-label={t.finance.onlineLabel} />
        </label>
      )}
      <label className="pref-row" style={{ borderTop: "1px solid var(--line)" }}>
        <span className="pr-main"><b>{t.finance.activeLabel}</b></span>
        <input type="checkbox" className="switch-cb" checked={active} onChange={(e) => setActive(e.target.checked)} aria-label={t.finance.activeLabel} />
      </label>
    </Sheet>
  );
}
