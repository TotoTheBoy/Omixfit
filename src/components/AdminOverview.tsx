import { CATEGORY_META, t } from "../lib/i18n";
import { adminOverview, classTypeOf, dashboardStats, upsertReminder, useStore } from "../lib/store";
import { fmtTime } from "../lib/date";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / DAY));
const telHref = (phone: string) => `tel:${(phone || "").replace(/[-\s]/g, "")}`;

/** Owner dashboard: business-at-a-glance KPIs, today's classes, a 7-day
 *  attendance trend, and the "needs attention" action list. */
export function AdminOverview() {
  const data = useStore((s) => s);
  const me = data.users.find((u) => u.id === data.currentUserId);
  const s = dashboardStats(data);
  const ov = adminOverview(data);
  const openReminders = data.taskReminders.filter((r) => !r.done);
  const attention =
    openReminders.length + ov.pending.length + ov.inactive.length + ov.stagnant.length + ov.lowOccupancy.length;

  const revTrend =
    s.revenuePrevMonth > 0 ? Math.round(((s.revenueMonth - s.revenuePrevMonth) / s.revenuePrevMonth) * 100) : null;
  const maxTrend = Math.max(1, ...s.attendanceTrend.map((d) => d.value));

  return (
    <div className="dash">
      <div className="dash-greet">
        <h2 className="h1">{t.dash.hello(me?.firstName || me?.name?.split(" ")[0] || "")}</h2>
      </div>

      {/* KPI cards — the brand colour story: gold · charcoal · olive · cream */}
      <div className="kpi-grid">
        <div className="kpi kpi-gold">
          <span className="kpi-k">{t.dash.revenueMonth}</span>
          <span className="kpi-v">₪{s.revenueMonth.toLocaleString("he-IL")}</span>
          {revTrend !== null && <span className="kpi-trend">{t.dash.vsPrev(revTrend)}</span>}
        </div>
        <div className="kpi kpi-charcoal">
          <span className="kpi-k">{t.dash.activeMembers}</span>
          <span className="kpi-v">{s.activeMembers}</span>
          {s.newMembersMonth > 0 && <span className="kpi-trend">{t.dash.newThisMonth(s.newMembersMonth)}</span>}
        </div>
        <div className="kpi kpi-olive">
          <span className="kpi-k">{t.dash.visitsWeek}</span>
          <span className="kpi-v">{s.visitsWeek}</span>
        </div>
        <div className="kpi kpi-cream">
          <span className="kpi-k">{t.dash.fillRate}</span>
          <span className="kpi-v">{s.fillRate}%</span>
        </div>
      </div>

      {/* today's classes */}
      <section className="dash-sec">
        <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h3 className="h2">{t.dash.today}</h3>
          <span className="chip" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>{s.classesToday.length}</span>
        </div>
        {s.classesToday.length === 0 ? (
          <p className="muted">{t.dash.noClassesToday}</p>
        ) : (
          <div className="dash-today">
            {s.classesToday.map(({ session, booked }) => {
              const type = classTypeOf(session, data);
              const full = booked >= session.capacity;
              return (
                <div key={session.id} className="today-row">
                  <span className="tr-time">{fmtTime(session.startMin)}</span>
                  <span className="tr-name">{CATEGORY_META[type.category].emoji} {type.name}</span>
                  <span className={`tr-fill ${full ? "full" : ""}`}>{booked}/{session.capacity}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 7-day attendance trend */}
      <section className="dash-sec">
        <h3 className="h2" style={{ marginBottom: 12 }}>{t.dash.attendanceTrend}</h3>
        <div className="spark" role="img" aria-label={t.dash.attendanceTrend}>
          {s.attendanceTrend.map((d) => (
            <div key={d.key} className="spark-col">
              <span className="spark-v">{d.value}</span>
              <div className="spark-bar-wrap">
                <div className="spark-bar" style={{ height: `${Math.round((d.value / maxTrend) * 100)}%` }} />
              </div>
              <span className="spark-lbl">{d.key.slice(8)}/{d.key.slice(5, 7)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* needs attention */}
      {attention > 0 && (
        <section className="dash-sec">
          <h3 className="h2" style={{ marginBottom: 12 }}>{t.dash.needsAttention}</h3>
          <div className="overview">
            {openReminders.length > 0 && (
              <div className="ov-card ov-pending">
                <div className="ov-head">
                  <h3>{t.overview.reminders}</h3>
                  <span className="ov-count">{openReminders.length}</span>
                </div>
                <ul className="ov-list">
                  {openReminders.map((r) => (
                    <li key={r.id}>
                      <span className="nm">{r.text}</span>
                      <button className="link-btn" onClick={() => upsertReminder({ ...r, done: true })}>{t.planner.done}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <OverviewCard title={t.overview.pending} count={ov.pending.length} tone="pending">
              {ov.pending.map((u) => (
                <li key={u.id}>
                  <a className="ov-call" href={telHref(u.phone)}>
                    <span className="nm">{u.name}</span>
                    <span className="meta" dir="ltr">📞 {u.phone}</span>
                  </a>
                </li>
              ))}
            </OverviewCard>

            <OverviewCard title={t.overview.inactive} count={ov.inactive.length} tone="warn">
              {ov.inactive.map(({ user, lastAttendedMs }) => (
                <li key={user.id}>
                  <a className="ov-call" href={telHref(user.phone)}>
                    <span className="nm">{user.name}</span>
                    <span className="meta">
                      {lastAttendedMs !== null ? t.overview.lastAttended(daysAgo(lastAttendedMs)) : t.overview.neverAttended}
                    </span>
                  </a>
                </li>
              ))}
            </OverviewCard>

            <OverviewCard title={t.overview.stagnant} count={ov.stagnant.length} tone="warn">
              {ov.stagnant.map(({ user, expiredMs }) => (
                <li key={user.id}>
                  <a className="ov-call" href={telHref(user.phone)}>
                    <span className="nm">{user.name}</span>
                    <span className="meta">{t.overview.expiredAgo(daysAgo(expiredMs))}</span>
                  </a>
                </li>
              ))}
            </OverviewCard>

            <OverviewCard title={t.overview.lowOccupancy} count={ov.lowOccupancy.length} tone="warn">
              {ov.lowOccupancy.map(({ type, sessions }) => (
                <li key={type.id}>
                  <span className="nm">{CATEGORY_META[type.category].emoji} {type.name}</span>
                  <span className="meta">{t.overview.zeroBookings(sessions)}</span>
                </li>
              ))}
            </OverviewCard>
          </div>
        </section>
      )}
    </div>
  );
}

function OverviewCard({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: "pending" | "warn";
  children: React.ReactNode;
}) {
  if (count === 0) return null; // show only buckets that need attention
  return (
    <div className={`ov-card ov-${tone}`}>
      <div className="ov-head">
        <h3>{title}</h3>
        <span className="ov-count">{count}</span>
      </div>
      <ul className="ov-list">{children}</ul>
    </div>
  );
}
