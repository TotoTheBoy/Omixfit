import { CATEGORY_META, t } from "../lib/i18n";
import { adminOverview, useStore } from "../lib/store";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / DAY));

/** #1 Admin Overview — a summary of ONLY the items that need attention or manual
 *  action, each computed live against a fixed threshold. Empty buckets are hidden
 *  so the page stays free of noise. */
export function AdminOverview() {
  const data = useStore((s) => s);
  const ov = adminOverview(data);
  const total =
    ov.pending.length + ov.inactive.length + ov.stagnant.length + ov.lowOccupancy.length;

  if (total === 0) {
    return (
      <div className="empty">
        <div className="ico">✅</div>
        <h2>{t.overview.allClearTitle}</h2>
        <p>{t.overview.allClearHint}</p>
      </div>
    );
  }

  return (
    <div className="overview">
      <OverviewCard title={t.overview.pending} count={ov.pending.length} tone="pending">
        {ov.pending.map((u) => (
          <li key={u.id}>
            <span className="nm">{u.name}</span>
            <span className="meta" dir="ltr">{u.phone}</span>
          </li>
        ))}
      </OverviewCard>

      <OverviewCard title={t.overview.inactive} count={ov.inactive.length} tone="warn">
        {ov.inactive.map(({ user, lastAttendedMs }) => (
          <li key={user.id}>
            <span className="nm">{user.name}</span>
            <span className="meta">
              {lastAttendedMs !== null
                ? t.overview.lastAttended(daysAgo(lastAttendedMs))
                : t.overview.neverAttended}
            </span>
          </li>
        ))}
      </OverviewCard>

      <OverviewCard title={t.overview.stagnant} count={ov.stagnant.length} tone="warn">
        {ov.stagnant.map(({ user, expiredMs }) => (
          <li key={user.id}>
            <span className="nm">{user.name}</span>
            <span className="meta">{t.overview.expiredAgo(daysAgo(expiredMs))}</span>
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
