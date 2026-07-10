import { useStore, updateUser } from "../lib/store";
import { coachingFlags } from "../lib/engine";
import { t } from "../lib/i18n";
import { Avatar } from "./common";
import { toast } from "./Toast";
import type { Coaching as C, User } from "../lib/types";

/** Israeli phone → wa.me international form (0xx… → 972xx…). */
function waLink(phone: string): string {
  const d = (phone || "").replace(/\D/g, "");
  const intl = d.startsWith("0") ? "972" + d.slice(1) : d;
  return `https://wa.me/${intl}`;
}

function Nudge({
  overdue, warn, ok, action, onDo,
}: { overdue: boolean; warn: string; ok: string; action: string; onDo: () => void }) {
  return (
    <span
      className="coaching-nudge"
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px",
        borderRadius: 10, fontWeight: 700, fontSize: ".8rem",
        background: overdue ? "#fff6e0" : "#e7fbf3",
        color: overdue ? "#8a5a00" : "#0a7d56",
      }}
    >
      {overdue ? `⏰ ${warn}` : `✓ ${ok}`}
      {overdue && (
        <button className="btn btn-sm" style={{ padding: "2px 10px", fontSize: ".75rem" }} onClick={onDo}>
          {action}
        </button>
      )}
    </span>
  );
}

/** Owner-only dashboard for the monthly 1-on-1 coaching clients (docs/business.md §5.3). */
export function Coaching() {
  const data = useStore((s) => s);
  const clients = data.users.filter((u) => u.coaching?.active);
  const month = new Date().toISOString().slice(0, 7);

  const patch = (u: User, p: Partial<C>) =>
    updateUser(u.id, { coaching: { ...(u.coaching ?? { active: true }), ...p } });

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 14px", fontSize: ".85rem" }}>{t.coaching.subtitle}</p>

      {clients.length === 0 ? (
        <div className="empty">
          <div className="ico">🎯</div>
          <h2>{t.coaching.empty}</h2>
          <p>{t.coaching.emptyHint}</p>
        </div>
      ) : (
        <div className="coaching-list">
          {clients.map((u) => {
            const f = coachingFlags(u);
            return (
              <div key={u.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
                <div className="row gap-3" style={{ alignItems: "center" }}>
                  <Avatar user={u} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{u.name}</b>
                    <div className="mr-sub" dir="ltr">{u.phone}</div>
                  </div>
                  <a className="btn btn-lime btn-sm" href={waLink(u.phone)} target="_blank" rel="noreferrer">
                    💬 {t.coaching.whatsapp}
                  </a>
                </div>

                {u.coaching?.goals && (
                  <p className="muted" style={{ margin: "10px 0 0" }}>
                    <b>{t.coaching.goals}:</b> {u.coaching.goals}
                  </p>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <Nudge
                    overdue={f.needsFirstMeeting} warn={t.coaching.needFirstMeeting} ok={t.coaching.okFirstMeeting}
                    action={t.coaching.doFirstMeeting}
                    onDo={() => { patch(u, { firstMeetingDone: true }); toast(t.coaching.markedMeeting, "ok"); }}
                  />
                  <Nudge
                    overdue={f.needsCall} warn={t.coaching.needCall} ok={t.coaching.okCall} action={t.coaching.logCall}
                    onDo={() => { patch(u, { lastCallAt: Date.now() }); toast(t.coaching.loggedCall, "ok"); }}
                  />
                  <Nudge
                    overdue={f.needsContact} warn={t.coaching.needContact} ok={t.coaching.okContact} action={t.coaching.logContact}
                    onDo={() => { patch(u, { lastContactAt: Date.now() }); toast(t.coaching.loggedContact, "ok"); }}
                  />
                  <Nudge
                    overdue={f.needsPayment} warn={t.coaching.needPayment} ok={t.coaching.okPayment} action={t.coaching.markPaid}
                    onDo={() => { patch(u, { lastPaidMonth: month }); toast(t.coaching.markedPaid, "ok"); }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
