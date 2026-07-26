import { useMemo, useState } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassCategory, ClassSession } from "../lib/types";
import { classTypeOf, healthDeclarationState, useStore } from "../lib/store";
import { moveSession } from "../lib/reschedule";
import { HealthDeclaration } from "./Onboarding";
import { useNow } from "../lib/useNow";
import { addDays, fromKey, toKey } from "../lib/date";
import { SessionDetail } from "../components/SessionDetail";
import { SessionEditor } from "../components/SessionEditor";
import { CalendarGrid, type CalView } from "../components/CalendarGrid";
import { InstallBanner } from "../components/InstallBanner";

const HE_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
const fmtD = (d: Date) => `${d.getDate()} ב${HE_MONTHS[d.getMonth()]}`;

// Shown when a renewed declaration flagged a medical item and the doctor's
// certificate is awaiting staff clearance - booking stays locked until then.
function HealthClearancePending() {
  return (
    <div className="page">
      <div className="health-lock">
        <div className="health-lock-emoji" aria-hidden="true">🩺</div>
        <h1 className="h1">ממתין לאישור רפואי</h1>
        <p className="muted">
          סימנת סעיף רפואי בהצהרת הבריאות. כדי להמשיך להזמין אימונים יש להמציא
          תעודה רפואית מרופא המתירה פעילות גופנית, ולהמתין לאישור הצוות.
        </p>
        <p className="muted">לשליחת התעודה או לבירור: <a href="mailto:office@omixfit.com">office@omixfit.com</a></p>
      </div>
    </div>
  );
}

export function Schedule() {
  const data = useStore((s) => s);
  useNow();
  const [view, setView] = useState<CalView>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [cats, setCats] = useState<Set<ClassCategory>>(new Set());
  const [open, setOpen] = useState<ClassSession | null>(null);
  const [edit, setEdit] = useState<ClassSession | null | "new">(null);

  const me = data.users.find((u) => u.id === data.currentUserId);
  const isStaff = !!me && me.role !== "member";

  // Members never see cancelled classes; staff do. Category filter applies to all.
  const sessions = useMemo(
    () =>
      data.sessions.filter((s) => {
        if (!isStaff && s.cancelled) return false;
        if (cats.size && !cats.has(classTypeOf(s, data).category)) return false;
        return true;
      }),
    [data, cats, isStaff],
  );

  // ---- insurance lock (members only) ----
  if (me && me.role === "member") {
    const hs = healthDeclarationState(me);
    if (hs === "expired" || hs === "missing") return <HealthDeclaration user={me} />;
    if (hs === "pending_medical") return <HealthClearancePending />;
  }

  function shift(dir: -1 | 1) {
    if (view === "day") setAnchor((a) => addDays(a, dir));
    else if (view === "week") setAnchor((a) => addDays(a, dir * 7));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
  }
  function toggleCat(c: ClassCategory) {
    setCats((p) => {
      const n = new Set(p);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  }

  // Staff drag-drop: move ONLY the session (bookings/client data untouched), then
  // ask how to update registered members (shared with the admin calendar).
  const reschedule = (s: ClassSession, newDateKey: string, newStartMin: number) =>
    moveSession(s, newDateKey, newStartMin, data);

  const title =
    view === "month"
      ? `${HE_MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
      : view === "day"
        ? `${fmtD(anchor)} ${anchor.getFullYear()}`
        : (() => {
            const start = addDays(anchor, -((anchor.getDay() + 7) % 7));
            const end = addDays(start, 6);
            return `${fmtD(start)} - ${fmtD(end)}`;
          })();

  return (
    <div className="page">
      <div className="page-head cal-head">
        <div>
          <h1 className="h1">{t.nav.schedule}</h1>
          <div className="sub">{title}</div>
        </div>
        <div className="cal-controls">
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
      </div>

      <InstallBanner />

      <div className="filterbar">
        <button className={`filter-chip ${cats.size === 0 ? "on" : ""}`} onClick={() => setCats(new Set())} aria-pressed={cats.size === 0}>הכול</button>
        {(Object.keys(CATEGORY_META) as ClassCategory[]).map((c) => (
          <button key={c} className={`filter-chip ${cats.has(c) ? "on" : ""}`} onClick={() => toggleCat(c)} aria-pressed={cats.has(c)}>
            {CATEGORY_META[c].label}
          </button>
        ))}
        {isStaff && (
          <button className="btn btn-lime btn-sm cal-add" onClick={() => setEdit("new")}>+ {t.newSession}</button>
        )}
      </div>

      {isStaff && (
        <p className="cal-hint muted">גררו שיעור בין שעות/ימים כדי להעביר אותו · הנרשמים יעודכנו אוטומטית.</p>
      )}

      <CalendarGrid
        view={view}
        anchor={anchor}
        sessions={sessions}
        data={data}
        isStaff={isStaff}
        onOpen={setOpen}
        onReschedule={reschedule}
      />

      {open && <SessionDetail session={open} onClose={() => setOpen(null)} onEdit={(s) => { setOpen(null); setEdit(s); }} />}
      {edit && (
        <SessionEditor
          session={edit === "new" ? null : edit}
          presetDate={edit === "new" ? toKey(anchor) : undefined}
          onClose={() => setEdit(null)}
          onSaved={(dateKey) => setAnchor(fromKey(dateKey))}
        />
      )}
    </div>
  );
}
