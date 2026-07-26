import { useRef } from "react";
import type { AppData, ClassSession } from "../lib/types";
import { CATEGORY_META } from "../lib/i18n";
import { classTypeOf, confirmedCount } from "../lib/store";
import { fmtTime, HEB_DAYS_SHORT, startOfWeek, toKey, weekDays } from "../lib/date";

export type CalView = "day" | "week" | "month";

const DAY_START_H = 6; // grid starts 06:00
const DAY_END_H = 23; // grid ends 23:00
const HOUR_H = 54; // px per hour
const SNAP_MIN = 15; // drag snaps to 15-minute slots

interface Props {
  view: CalView;
  anchor: Date;
  sessions: ClassSession[];
  data: AppData;
  isStaff: boolean;
  onOpen: (s: ClassSession) => void;
  /** Staff drag-drop: move ONLY the session (date/time). Bookings are untouched. */
  onReschedule: (s: ClassSession, newDateKey: string, newStartMin: number) => void;
}

export function CalendarGrid(props: Props) {
  if (props.view === "month") return <MonthView {...props} />;
  return <TimeGrid {...props} />;
}

// ---- shared drag state (grab offset within the block) -----------------------
const drag = { id: "", offsetY: 0 };

function blockStyle(session: ClassSession, cat: string) {
  const meta = CATEGORY_META[cat as keyof typeof CATEGORY_META];
  const top = ((session.startMin - DAY_START_H * 60) / 60) * HOUR_H;
  const height = Math.max((session.durationMin / 60) * HOUR_H - 3, 22);
  return {
    top,
    height,
    background: session.cancelled ? "var(--surface-2)" : `hsl(${meta?.hue ?? 210} 60% 55%)`,
    opacity: session.cancelled ? 0.55 : 1,
  };
}

// ---- Day / Week time grid ---------------------------------------------------
function TimeGrid({ view, anchor, sessions, data, isStaff, onOpen, onReschedule }: Props) {
  const days = view === "day" ? [new Date(anchor)] : weekDays(startOfWeek(anchor));
  const hours: number[] = [];
  for (let h = DAY_START_H; h <= DAY_END_H; h++) hours.push(h);
  const gridRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const nowKey = toKey(now);
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) - DAY_START_H * 60) / 60 * HOUR_H;

  function onColDrop(e: React.DragEvent, dayKey: string) {
    e.preventDefault();
    if (!isStaff || !drag.id) return;
    const s = sessions.find((x) => x.id === drag.id) ?? data.sessions.find((x) => x.id === drag.id);
    if (!s) return;
    const colTop = (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    const y = e.clientY - colTop - drag.offsetY;
    let startMin = DAY_START_H * 60 + Math.round((y / HOUR_H) * 60 / SNAP_MIN) * SNAP_MIN;
    startMin = Math.max(DAY_START_H * 60, Math.min((DAY_END_H) * 60 - s.durationMin, startMin));
    drag.id = "";
    if (dayKey !== s.date || startMin !== s.startMin) onReschedule(s, dayKey, startMin);
  }

  return (
    <div className={`cal-grid ${view}`}>
      <div className="cal-corner" />
      {days.map((d) => (
        <div key={toKey(d)} className={`cal-dayhead ${toKey(d) === nowKey ? "is-today" : ""}`}>
          <span className="cdh-dow">{HEB_DAYS_SHORT[d.getDay()]}</span>
          <span className="cdh-num">{d.getDate()}</span>
        </div>
      ))}

      <div className="cal-times">
        {hours.map((h) => (
          <div key={h} className="cal-time" style={{ height: HOUR_H }}>
            <span>{String(h).padStart(2, "0")}:00</span>
          </div>
        ))}
      </div>

      <div className="cal-cols" ref={gridRef}>
        {days.map((d) => {
          const dayKey = toKey(d);
          const dayS = sessions.filter((s) => s.date === dayKey);
          return (
            <div
              key={dayKey}
              className="cal-col"
              style={{ height: (DAY_END_H - DAY_START_H + 1) * HOUR_H }}
              onDragOver={(e) => isStaff && e.preventDefault()}
              onDrop={(e) => onColDrop(e, dayKey)}
            >
              {hours.map((h) => (
                <div key={h} className="cal-slot" style={{ height: HOUR_H }} />
              ))}
              {dayKey === nowKey && nowTop >= 0 && (
                <div className="cal-now" style={{ top: nowTop }} />
              )}
              {dayS.map((s) => {
                const type = classTypeOf(s, data);
                const booked = confirmedCount(s.id, data);
                return (
                  <button
                    key={s.id}
                    className={`cal-ev ${s.cancelled ? "off" : ""}`}
                    style={blockStyle(s, type.category)}
                    draggable={isStaff && !s.cancelled}
                    onDragStart={(e) => {
                      drag.id = s.id;
                      drag.offsetY = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
                    }}
                    onClick={() => onOpen(s)}
                    title={`${type.name} · ${fmtTime(s.startMin)}`}
                  >
                    <span className="cal-ev-t">{type.name}</span>
                    <span className="cal-ev-time">{fmtTime(s.startMin)} · {booked}/{s.capacity}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Month grid -------------------------------------------------------------
function MonthView({ anchor, sessions, data, isStaff, onOpen, onReschedule }: Props) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const nowKey = toKey(new Date());

  function onCellDrop(e: React.DragEvent, dayKey: string) {
    e.preventDefault();
    if (!isStaff || !drag.id) return;
    const s = data.sessions.find((x) => x.id === drag.id);
    drag.id = "";
    if (s && s.date !== dayKey) onReschedule(s, dayKey, s.startMin); // keep the time
  }

  return (
    <div className="cal-month">
      {HEB_DAYS_SHORT.map((d, i) => (
        <div key={i} className="cmh">{d}</div>
      ))}
      {cells.map((d) => {
        const dayKey = toKey(d);
        const inMonth = d.getMonth() === anchor.getMonth();
        const dayS = sessions.filter((s) => s.date === dayKey).sort((a, b) => a.startMin - b.startMin);
        return (
          <div
            key={dayKey}
            className={`cmc ${inMonth ? "" : "out"} ${dayKey === nowKey ? "is-today" : ""}`}
            onDragOver={(e) => isStaff && e.preventDefault()}
            onDrop={(e) => onCellDrop(e, dayKey)}
          >
            <span className="cmc-num">{d.getDate()}</span>
            <div className="cmc-evs">
              {dayS.slice(0, 4).map((s) => {
                const type = classTypeOf(s, data);
                const meta = CATEGORY_META[type.category];
                return (
                  <button
                    key={s.id}
                    className={`cmc-ev ${s.cancelled ? "off" : ""}`}
                    style={{ ["--cat-hue" as string]: meta?.hue ?? 210 }}
                    draggable={isStaff && !s.cancelled}
                    onDragStart={() => { drag.id = s.id; }}
                    onClick={() => onOpen(s)}
                  >
                    <span className="dot" />
                    {fmtTime(s.startMin)} {type.name}
                  </button>
                );
              })}
              {dayS.length > 4 && <span className="cmc-more">+{dayS.length - 4}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
