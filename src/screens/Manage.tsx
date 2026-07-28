import { useMemo, useState } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassSession, ClassType } from "../lib/types";
import { confirmedCount, useStore } from "../lib/store";
import { moveSession } from "../lib/reschedule";
import {
  addDays,
  fromKey,
  startOfWeek,
  toKey,
  weekDays,
} from "../lib/date";
import { SessionEditor } from "../components/SessionEditor";
import { SessionDetail } from "../components/SessionDetail";
import { TypeEditor } from "../components/TypeEditor";
import { EventsAdmin } from "../components/EventsAdmin";
import { CalendarGrid, type CalView } from "../components/CalendarGrid";
import { substituteInstructorLoad } from "../lib/store";
import {
  POLICY_EXPIRY,
  policyDaysLeft,
  policyYearStartKey,
  SUBSTITUTE_DAY_LIMIT,
  SUBSTITUTE_WARN_AT,
} from "../lib/legal";
import { IcPlus, IcSpark, IcUsers, IcCalendar } from "../components/icons";

function SubstituteLimitCard() {
  const data = useStore((s) => s);
  const loads = substituteInstructorLoad(data, policyYearStartKey());
  const flagged = loads.filter((l) => l.days >= SUBSTITUTE_WARN_AT);
  if (flagged.length === 0) return null;
  return (
    <div className="policy-banner" style={{ background: "#fdf2d8", borderColor: "#e5c675" }}>
      <span aria-hidden="true">🧑‍🏫</span>
      <div>
        <b>מדריך מחליף מתקרב למגבלת הביטוח (30 ימים/שנה)</b>
        {flagged.map((l) => (
          <small key={l.user.id} style={{ display: "block" }}>
            {l.user.name}: {l.days}/{SUBSTITUTE_DAY_LIMIT} ימי אימון בשנת הפוליסה
            {l.days >= SUBSTITUTE_DAY_LIMIT ? " · חריגה! יש לעדכן פוליסה" : ""}
          </small>
        ))}
      </div>
    </div>
  );
}

function PolicyBanner() {
  const left = policyDaysLeft();
  if (left > 45) return null;
  const expired = left < 0;
  const exp = POLICY_EXPIRY.split("-").reverse().join("/");
  return (
    <div className={`policy-banner ${expired ? "expired" : ""}`}>
      <span aria-hidden="true">{expired ? "⛔" : "⚠️"}</span>
      <div>
        <b>{expired ? "פוליסת הביטוח פגה!" : `פוליסת הביטוח פגה בעוד ${left} ימים`}</b>
        <small>תוקף עד {exp}. יש לחדש את הפוליסה כדי לשמור על הכיסוי לפעילות ולמתאמנים.</small>
      </div>
    </div>
  );
}

const HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

type EditorState =
  | { mode: "closed" }
  | { mode: "create"; date: string }
  | { mode: "edit"; session: ClassSession };

// Trainer management - the schedule grid, class-type catalogue and reports.
// Clients + Finance are their own top-level sections now.
export function Manage() {
  const data = useStore((s) => s);
  const [tab, setTab] = useState<"schedule" | "catalog" | "events">("schedule");
  const [view, setView] = useState<CalView>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [detail, setDetail] = useState<ClassSession | null>(null);
  const [typeEditor, setTypeEditor] = useState<
    { mode: "closed" } | { mode: "create" } | { mode: "edit"; type: ClassType }
  >({ mode: "closed" });

  const weekStart = startOfWeek(anchor);
  const days = weekDays(weekStart);
  const weekKeys = new Set(days.map(toKey));

  const weekSessions = useMemo(
    () => data.sessions.filter((s) => weekKeys.has(s.date)),
    [data.sessions, weekStart],
  );

  const stats = useMemo(() => {
    let booked = 0;
    let capacity = 0;
    for (const s of weekSessions) {
      if (s.cancelled) continue;
      booked += confirmedCount(s.id, data);
      capacity += s.capacity;
    }
    return {
      sessions: weekSessions.filter((s) => !s.cancelled).length,
      booked,
      fill: capacity ? Math.round((booked / capacity) * 100) : 0,
    };
  }, [weekSessions, data]);

  function shift(dir: -1 | 1) {
    if (view === "day") setAnchor((a) => addDays(a, dir));
    else if (view === "week") setAnchor((a) => addDays(a, dir * 7));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
  }
  const title =
    view === "month"
      ? `${HE_MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
      : view === "day"
        ? `${anchor.getDate()} ב${HE_MONTHS[anchor.getMonth()]}`
        : `${weekStart.getDate()} ב${HE_MONTHS[weekStart.getMonth()]} - ${days[6].getDate()} ב${HE_MONTHS[days[6].getMonth()]}`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">{t.nav.calendar}</h1>
          <div className="sub">{data.locations[0]?.name}</div>
        </div>
        {tab === "schedule" && (
          <button className="btn btn-lime" onClick={() => setEditor({ mode: "create", date: toKey(days[0]) })}>
            <IcPlus width={18} height={18} /> {t.newSession}
          </button>
        )}
        {tab === "catalog" && (
          <button className="btn btn-lime" onClick={() => setTypeEditor({ mode: "create" })}>
            <IcPlus width={18} height={18} /> {t.newTypeTitle}
          </button>
        )}
      </div>

      <PolicyBanner />
      <SubstituteLimitCard />

      <div className="seg" style={{ marginBottom: 18 }}>
        <button className={tab === "schedule" ? "on" : ""} onClick={() => setTab("schedule")}>
          {t.scheduleTab}
        </button>
        <button className={tab === "catalog" ? "on" : ""} onClick={() => setTab("catalog")}>
          {t.catalog}
        </button>
        <button className={tab === "events" ? "on" : ""} onClick={() => setTab("events")}>
          {t.events.tab}
        </button>
      </div>

      {tab === "events" && <EventsAdmin />}

      {tab === "catalog" && data.classTypes.length === 0 && (
        <div className="empty">
          <div className="ico">🏷️</div>
          <h2>{t.catalogEmpty}</h2>
          <p>{t.catalogEmptyHint}</p>
          <button className="btn btn-lime" style={{ marginTop: 14 }} onClick={() => setTypeEditor({ mode: "create" })}>
            <IcPlus width={18} height={18} /> {t.newTypeTitle}
          </button>
        </div>
      )}
      {tab === "catalog" && data.classTypes.length > 0 && (
        <div className="catalog">
          {data.classTypes.map((ct) => {
            const meta = CATEGORY_META[ct.category];
            const count = data.sessions.filter((s) => s.classTypeId === ct.id).length;
            return (
              <button
                key={ct.id}
                className="cat-card"
                style={{ ["--cat-hue" as string]: meta.hue }}
                onClick={() => setTypeEditor({ mode: "edit", type: ct })}
              >
                <span className="cc-ico">{meta.emoji}</span>
                <span className="cc-body">
                  <b>{ct.name}</b>
                  <small>
                    {meta.label} · {ct.defaultCapacity} מקומות · {ct.defaultDurationMin}׳ · {t.typeSessions(count)}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "schedule" && (
      <>
      <div className="stats">
        <div className="stat dark">
          <div className="k"><IcCalendar width={15} height={15} /> {t.weekSessions}</div>
          <div className="v">{stats.sessions}</div>
        </div>
        <div className="stat">
          <div className="k"><IcUsers width={15} height={15} /> {t.totalBooked}</div>
          <div className="v">{stats.booked}</div>
        </div>
        <div className="stat">
          <div className="k"><IcSpark width={15} height={15} /> {t.fillRate}</div>
          <div className="v">{stats.fill}%</div>
        </div>
      </div>

      <div className="cal-controls" style={{ margin: "4px 0 14px", justifyContent: "space-between" }}>
        <div className="seg cal-viewseg" role="tablist">
          {(["day", "week", "month"] as CalView[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v}
              className={view === v ? "on" : ""} onClick={() => setView(v)}>
              {v === "day" ? "יום" : v === "week" ? "שבוע" : "חודש"}
            </button>
          ))}
        </div>
        <div className="cal-nav">
          <button className="iconbtn" onClick={() => shift(-1)} aria-label="הקודם">‹</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAnchor(new Date())}>היום</button>
          <button className="iconbtn" onClick={() => shift(1)} aria-label="הבא">›</button>
        </div>
      </div>
      <p className="sub" style={{ margin: "0 0 6px" }}>{title}</p>
      <p className="cal-hint muted">גררו שיעור בין שעות/ימים כדי להעביר אותו · תישאלו איך לעדכן את הנרשמים.</p>

      <CalendarGrid
        view={view}
        anchor={anchor}
        sessions={data.sessions}
        data={data}
        isStaff
        onOpen={setDetail}
        onReschedule={(s, dk, sm) => moveSession(s, dk, sm, data)}
      />
      </>
      )}

      {detail && (
        <SessionDetail
          session={detail}
          onClose={() => setDetail(null)}
          onEdit={(s) => {
            setDetail(null);
            setEditor({ mode: "edit", session: s });
          }}
        />
      )}
      {editor.mode !== "closed" && (
        <SessionEditor
          session={editor.mode === "edit" ? editor.session : null}
          presetDate={editor.mode === "create" ? editor.date : undefined}
          onClose={() => setEditor({ mode: "closed" })}
          onSaved={(d) => setAnchor(fromKey(d))}
        />
      )}
      {typeEditor.mode !== "closed" && (
        <TypeEditor
          type={typeEditor.mode === "edit" ? typeEditor.type : null}
          onClose={() => setTypeEditor({ mode: "closed" })}
        />
      )}
    </div>
  );
}
