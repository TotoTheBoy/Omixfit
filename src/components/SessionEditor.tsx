import { useState } from "react";
import { t } from "../lib/i18n";
import type { ClassSession } from "../lib/types";
import {
  cancelSession,
  createSessions,
  deleteSession,
  upsertSession,
  useStore,
} from "../lib/store";
import { fmtTime, toKey } from "../lib/date";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";

interface Props {
  /** Existing session to edit, or null to create. */
  session: ClassSession | null;
  /** Pre-fill date/time when creating from a grid cell. */
  presetDate?: string;
  onClose: () => void;
}

export function SessionEditor({ session, presetDate, onClose }: Props) {
  const data = useStore((s) => s);
  const editing = !!session;
  const instructors = data.users.filter(
    (u) => u.role === "instructor" || u.role === "manager",
  );

  const firstType = data.classTypes[0];
  const [typeId, setTypeId] = useState(session?.classTypeId ?? firstType.id);
  const [date, setDate] = useState(session?.date ?? presetDate ?? toKey(new Date()));
  const [time, setTime] = useState(fmtTime(session?.startMin ?? 18 * 60));
  const selType = data.classTypes.find((c) => c.id === typeId)!;
  const [duration, setDuration] = useState(session?.durationMin ?? selType.defaultDurationMin);
  const [capacity, setCapacity] = useState(session?.capacity ?? selType.defaultCapacity);
  const [instructorId, setInstructorId] = useState(
    session?.instructorId ?? instructors[0].id,
  );
  const [room, setRoom] = useState(session?.room ?? "סטודיו A");
  const [weeks, setWeeks] = useState(1);

  function onTypeChange(id: string) {
    setTypeId(id);
    const ty = data.classTypes.find((c) => c.id === id)!;
    if (!editing) {
      setDuration(ty.defaultDurationMin);
      setCapacity(ty.defaultCapacity);
    }
  }

  function startMinFromTime(): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  }

  function save() {
    const startMin = startMinFromTime();
    if (editing && session) {
      upsertSession({
        ...session,
        classTypeId: typeId,
        date,
        startMin,
        durationMin: duration,
        capacity,
        instructorId,
        room,
      });
      toast("השיעור עודכן", "ok");
    } else {
      createSessions(
        {
          classTypeId: typeId,
          date,
          startMin,
          durationMin: duration,
          capacity,
          instructorId,
          room,
          locationId: data.locations[0].id,
        },
        weeks,
      );
      toast(weeks > 1 ? `נוצרו ${weeks} שיעורים בסדרה` : "השיעור פורסם", "ok");
    }
    onClose();
  }

  function onCancelSession() {
    if (session) {
      cancelSession(session.id);
      toast("השיעור בוטל וההודעות נשלחו", "info");
      onClose();
    }
  }
  function onDelete() {
    if (session) {
      deleteSession(session.id);
      toast("השיעור נמחק", "info");
      onClose();
    }
  }

  return (
    <Sheet
      title={editing ? t.editSession : t.newSession}
      onClose={onClose}
      footer={
        <>
          {editing && (
            <button className="btn btn-danger" onClick={onCancelSession}>
              {t.cancelSession}
            </button>
          )}
          <button className="btn btn-lime grow" onClick={save}>
            {editing ? t.save : t.saveAndPublish}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="se-type">{t.typeLabel}</label>
        <select id="se-type" aria-label={t.typeLabel} className="select" value={typeId} onChange={(e) => onTypeChange(e.target.value)}>
          {data.classTypes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="row gap-3 wrap">
        <div className="field grow" style={{ minWidth: 140 }}>
          <label htmlFor="se-date">{t.dateLabel}</label>
          <input id="se-date" aria-label={t.dateLabel} className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field grow" style={{ minWidth: 110 }}>
          <label htmlFor="se-time">{t.timeLabel}</label>
          <input id="se-time" aria-label={t.timeLabel} className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <div className="row gap-3 wrap">
        <div className="field grow" style={{ minWidth: 110 }}>
          <label htmlFor="se-dur">{t.durationLabel}</label>
          <input
            id="se-dur"
            aria-label={t.durationLabel}
            className="input tnum"
            type="number"
            min={15}
            step={5}
            value={duration}
            onChange={(e) => setDuration(+e.target.value)}
          />
        </div>
        <div className="field grow" style={{ minWidth: 110 }}>
          <label htmlFor="se-cap">{t.capacityLabel}</label>
          <input
            id="se-cap"
            aria-label={t.capacityLabel}
            className="input tnum"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(+e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="se-inst">{t.instructorLabel}</label>
        <select id="se-inst" aria-label={t.instructorLabel} className="select" value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
          {instructors.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="se-room">{t.roomLabel}</label>
        <input id="se-room" aria-label={t.roomLabel} className="input" value={room} onChange={(e) => setRoom(e.target.value)} />
      </div>

      {!editing && (
        <div className="field">
          <label>{t.recurrence}</label>
          <div className="seg" style={{ width: "fit-content" }}>
            <button className={weeks === 1 ? "on" : ""} onClick={() => setWeeks(1)}>
              {t.recurrenceNone}
            </button>
            <button className={weeks === 4 ? "on" : ""} onClick={() => setWeeks(4)}>
              4 {t.recurrenceWeeks}
            </button>
            <button className={weeks === 8 ? "on" : ""} onClick={() => setWeeks(8)}>
              8 {t.recurrenceWeeks}
            </button>
          </div>
          {weeks > 1 && (
            <p className="muted" style={{ fontSize: ".82rem", margin: "2px 0 0" }}>
              ייווצרו {weeks} מופעים — אחד בכל שבוע באותו יום ושעה.
            </p>
          )}
        </div>
      )}

      {editing && (
        <button className="btn btn-ghost btn-sm" onClick={onDelete} style={{ alignSelf: "flex-start" }}>
          {t.remove} לצמיתות
        </button>
      )}
    </Sheet>
  );
}
