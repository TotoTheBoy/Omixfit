import { useMemo } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import { useStore } from "../lib/store";
import { fromKey, HEB_DAYS_SHORT } from "../lib/date";
import { AuditLog } from "./AuditLog";
import { Avatar } from "./common";

// Manager analytics (plan.md §4.6): utilization, popular classes, no-show rate.
// Computed over the last 30 days of (now-resolved) sessions.
export function Reports() {
  const data = useStore((s) => s);

  const r = useMemo(() => {
    const now = Date.now();
    const cutoff = now - 30 * 24 * 3600 * 1000;

    const pastSessions = data.sessions.filter((s) => {
      const d = fromKey(s.date);
      d.setMinutes(s.startMin);
      const ts = d.getTime();
      return ts >= cutoff && ts < now && !s.cancelled;
    });
    const pastIds = new Set(pastSessions.map((s) => s.id));
    const pastBookings = data.bookings.filter((b) => pastIds.has(b.sessionId));

    const attended = pastBookings.filter((b) => b.state === "attended").length;
    const noShow = pastBookings.filter((b) => b.state === "no_show").length;
    const resolved = attended + noShow;
    const noShowRate = resolved ? Math.round((noShow / resolved) * 100) : 0;
    const attendanceRate = resolved ? Math.round((attended / resolved) * 100) : 0;

    let cap = 0;
    for (const s of pastSessions) cap += s.capacity;
    const avgFill = cap ? Math.round((resolved / cap) * 100) : 0;

    const activeMembers = new Set(
      pastBookings.filter((b) => b.state === "attended").map((b) => b.userId),
    ).size;

    // popularity by class type (attended)
    const byType = new Map<string, number>();
    for (const b of pastBookings) {
      if (b.state !== "attended") continue;
      const s = data.sessions.find((x) => x.id === b.sessionId)!;
      byType.set(s.classTypeId, (byType.get(s.classTypeId) ?? 0) + 1);
    }
    const popular = [...byType.entries()]
      .map(([id, n]) => ({ type: data.classTypes.find((c) => c.id === id)!, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
    const popMax = Math.max(1, ...popular.map((p) => p.n));

    // attendance by weekday
    const byDay = Array(7).fill(0) as number[];
    const capByDay = Array(7).fill(0) as number[];
    for (const s of pastSessions) {
      const dow = fromKey(s.date).getDay();
      capByDay[dow] += s.capacity;
    }
    for (const b of pastBookings) {
      if (b.state !== "attended") continue;
      const s = data.sessions.find((x) => x.id === b.sessionId)!;
      byDay[fromKey(s.date).getDay()]++;
    }
    const dayFill = byDay.map((v, i) =>
      capByDay[i] ? Math.round((v / capByDay[i]) * 100) : 0,
    );
    const dayMax = Math.max(1, ...dayFill);

    // top members by attendance
    const byMember = new Map<string, number>();
    for (const b of pastBookings) {
      if (b.state !== "attended") continue;
      byMember.set(b.userId, (byMember.get(b.userId) ?? 0) + 1);
    }
    const topMembers = [...byMember.entries()]
      .map(([id, n]) => ({ user: data.users.find((u) => u.id === id)!, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
    const memMax = Math.max(1, ...topMembers.map((m) => m.n));

    return {
      attended,
      noShowRate,
      attendanceRate,
      avgFill,
      activeMembers,
      popular,
      popMax,
      dayFill,
      dayMax,
      topMembers,
      memMax,
    };
  }, [data]);

  return (
    <div>
      <div className="stats">
        <div className="stat dark">
          <div className="k">{t.totalAttendance}</div>
          <div className="v">{r.attended}</div>
        </div>
        <div className="stat">
          <div className="k">{t.avgFill}</div>
          <div className="v">{r.avgFill}%</div>
        </div>
        <div className="stat">
          <div className="k">{t.attendanceRate}</div>
          <div className="v" style={{ color: "var(--ok)" }}>{r.attendanceRate}%</div>
        </div>
        <div className="stat">
          <div className="k">{t.noShowRate}</div>
          <div className="v" style={{ color: r.noShowRate > 15 ? "var(--danger)" : "var(--text)" }}>
            {r.noShowRate}%
          </div>
        </div>
        <div className="stat">
          <div className="k">{t.activeMembers}</div>
          <div className="v">{r.activeMembers}</div>
        </div>
      </div>

      <div className="report-grid">
        {/* popular classes */}
        <div className="report-section">
          <h3>{t.popularClasses}</h3>
          <div className="bars">
            {r.popular.map(({ type, n }) => {
              const meta = CATEGORY_META[type.category];
              return (
                <div className="bar-row" key={type.id} style={{ ["--cat-hue" as string]: meta.hue }}>
                  <span className="bl">
                    <span>{meta.emoji}</span>
                    {type.name}
                  </span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(n / r.popMax) * 100}%` }} />
                  </span>
                  <span className="bv">{n}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* top members */}
        <div className="report-section">
          <h3>{t.topMembers}</h3>
          <div className="bars">
            {r.topMembers.map(({ user, n }) => (
              <div className="bar-row" key={user.id} style={{ ["--cat-hue" as string]: 80 }}>
                <span className="bl">
                  <Avatar user={user} size={22} />
                  {user.name}
                </span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${(n / r.memMax) * 100}%`, background: "var(--ink-700)" }}
                  />
                </span>
                <span className="bv">{t.visits(n)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* fill by day */}
      <div className="report-section">
        <h3>{t.fillByDay}</h3>
        <div className="day-bars">
          {r.dayFill.map((v, i) => (
            <div key={i} className={`day-bar ${i === 6 ? "is-shabbat" : ""}`}>
              <span className="db-val">{v}%</span>
              <span className="db-track">
                <span className="db-fill" style={{ height: `${(v / r.dayMax) * 100}%` }} />
              </span>
              <span className="db-lbl">{HEB_DAYS_SHORT[i]}</span>
            </div>
          ))}
        </div>
      </div>

      <AuditLog />
    </div>
  );
}
