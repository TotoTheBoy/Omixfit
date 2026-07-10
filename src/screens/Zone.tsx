import { useState } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassSession } from "../lib/types";
import { classTypeOf, dashboardStats, useStore } from "../lib/store";
import { fmtTime } from "../lib/date";
import { Planner } from "../components/Planner";
import { IntervalTimer } from "../components/IntervalTimer";
import { SessionDetail } from "../components/SessionDetail";

/** אימון ZONE — the live-workout workspace: a full-screen interval timer, the
 *  tagged lesson-plan archive + task notes, and today's classes for on-the-spot
 *  attendance. Everything a coach needs during a session, in one place. */
export function Zone() {
  const data = useStore((s) => s);
  const s = dashboardStats(data);
  const [timerOpen, setTimerOpen] = useState(false);
  const [detail, setDetail] = useState<ClassSession | null>(null);

  return (
    <div className="page zone">
      <div className="page-head">
        <div>
          <h1 className="h1">{t.nav.zone}</h1>
          <div className="sub">{t.zone.sub}</div>
        </div>
      </div>

      <button className="btn btn-lime btn-lg btn-block" onClick={() => setTimerOpen(true)}>
        ⏱ {t.timer.launch}
      </button>

      <section className="dash-sec" style={{ marginTop: 24 }}>
        <h2 className="h2" style={{ marginBottom: 10 }}>{t.zone.attendance}</h2>
        {s.classesToday.length === 0 ? (
          <p className="muted">{t.dash.noClassesToday}</p>
        ) : (
          <div className="dash-today">
            {s.classesToday.map(({ session, booked }) => {
              const type = classTypeOf(session, data);
              const full = booked >= session.capacity;
              return (
                <button key={session.id} className="today-row zone-cls" onClick={() => setDetail(session)}>
                  <span className="tr-time">{fmtTime(session.startMin)}</span>
                  <span className="tr-name">{CATEGORY_META[type.category].emoji} {type.name}</span>
                  <span className={`tr-fill ${full ? "full" : ""}`}>{booked}/{session.capacity}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="dash-sec" style={{ marginTop: 28 }}>
        <Planner />
      </section>

      {timerOpen && <IntervalTimer onClose={() => setTimerOpen(false)} />}
      {detail && <SessionDetail session={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
