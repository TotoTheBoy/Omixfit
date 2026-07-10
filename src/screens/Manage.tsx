import { useMemo, useState } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassSession, ClassType } from "../lib/types";
import { classTypeOf, confirmedCount, notifyScheduleChange, upsertSession, useStore } from "../lib/store";
import { Sheet } from "../components/Sheet";
import { toast } from "../components/Toast";
import {
  addDays,
  fmtTime,
  HEB_DAYS_LONG,
  isToday,
  startOfWeek,
  toKey,
  weekDays,
} from "../lib/date";
import { WeekNav } from "../components/common";
import { SessionEditor } from "../components/SessionEditor";
import { SessionDetail } from "../components/SessionDetail";
import { TypeEditor } from "../components/TypeEditor";
import { EventsAdmin } from "../components/EventsAdmin";
import { IcPlus, IcSpark, IcUsers, IcCalendar } from "../components/icons";

type EditorState =
  | { mode: "closed" }
  | { mode: "create"; date: string }
  | { mode: "edit"; session: ClassSession };

// Trainer management — the schedule grid, class-type catalogue and reports.
// Clients + Finance are their own top-level sections now.
export function Manage() {
  const data = useStore((s) => s);
  const [tab, setTab] = useState<"schedule" | "catalog" | "events">("schedule");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [detail, setDetail] = useState<ClassSession | null>(null);
  const [typeEditor, setTypeEditor] = useState<
    { mode: "closed" } | { mode: "create" } | { mode: "edit"; type: ClassType }
  >({ mode: "closed" });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [notify, setNotify] = useState<ClassSession | null>(null);

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

  const byDay = useMemo(() => {
    const map = new Map<string, ClassSession[]>();
    for (const s of weekSessions) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startMin - b.startMin);
    return map;
  }, [weekSessions]);

  // #10 Drag a class block onto another day → reschedule it there, then prompt
  // to notify the booked participants of the change.
  async function handleDrop(dayKey: string) {
    const id = dragId;
    setDragId(null);
    setDragOverKey(null);
    if (!id) return;
    const session = data.sessions.find((s) => s.id === id);
    if (!session || session.date === dayKey) return; // no-op on the same day
    const moved = { ...session, date: dayKey };
    await upsertSession(moved);
    toast(t.reschedule.moved(`${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}`), "ok");
    setNotify(moved); // open the "notify participants?" prompt
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">{t.nav.calendar}</h1>
          <div className="sub">{data.locations[0].name}</div>
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

      <div style={{ margin: "4px 0 18px" }}>
        <WeekNav
          weekStart={weekStart}
          onPrev={() => setWeekStart(addDays(weekStart, -7))}
          onNext={() => setWeekStart(addDays(weekStart, 7))}
          onToday={() => setWeekStart(startOfWeek(new Date()))}
        />
      </div>

      <div className="mgr-grid">
        {days.map((d) => {
          const key = toKey(d);
          const slots = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={`mgr-col ${dragOverKey === key ? "drag-over" : ""}`}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); if (dragOverKey !== key) setDragOverKey(key); } }}
              onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
              onDrop={(e) => { e.preventDefault(); handleDrop(key); }}
            >
              <div className={`mgr-col-head ${isToday(key) ? "is-today" : ""}`}>
                {HEB_DAYS_LONG[d.getDay()]}
                <small>{d.getDate()}/{d.getMonth() + 1}</small>
              </div>
              {slots.map((s) => {
                const type = classTypeOf(s, data);
                const booked = confirmedCount(s.id, data);
                return (
                  <button
                    key={s.id}
                    className={`mgr-slot ${s.cancelled ? "is-cancelled" : ""}`}
                    style={{ ["--cat-hue" as string]: CATEGORY_META[type.category].hue }}
                    draggable
                    onDragStart={() => setDragId(s.id)}
                    onDragEnd={() => { setDragId(null); setDragOverKey(null); }}
                    onClick={() => setDetail(s)}
                  >
                    <div className="ms-time">{fmtTime(s.startMin)}</div>
                    <div className="ms-name">{type.name}</div>
                    <div className="ms-fill">
                      {booked}/{s.capacity} · {s.room}
                    </div>
                  </button>
                );
              })}
              <button className="mgr-add" onClick={() => setEditor({ mode: "create", date: key })}>
                <IcPlus width={14} height={14} /> {t.newSession}
              </button>
            </div>
          );
        })}
      </div>
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
        />
      )}
      {typeEditor.mode !== "closed" && (
        <TypeEditor
          type={typeEditor.mode === "edit" ? typeEditor.type : null}
          onClose={() => setTypeEditor({ mode: "closed" })}
        />
      )}
      {notify && (
        <Sheet
          title={t.reschedule.notifyTitle}
          onClose={() => setNotify(null)}
          footer={
            <div className="row gap-2" style={{ width: "100%" }}>
              <button
                className="btn btn-lime grow"
                onClick={() => {
                  notifyScheduleChange(notify.id)
                    .then((n) => toast(t.reschedule.sent(n), "ok"))
                    .catch(() => toast(t.reschedule.sendErr, "err"));
                  setNotify(null);
                }}
              >
                {t.reschedule.notifyYes}
              </button>
              <button className="btn btn-ghost" onClick={() => setNotify(null)}>
                {t.reschedule.notifyNo}
              </button>
            </div>
          }
        >
          <p style={{ lineHeight: 1.5 }}>{t.reschedule.notifyBody}</p>
        </Sheet>
      )}
    </div>
  );
}
