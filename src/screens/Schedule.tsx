import { useMemo, useRef, useState } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassCategory, ClassSession } from "../lib/types";
import { healthDeclarationState, useStore } from "../lib/store";
import { HealthDeclaration } from "./Onboarding";
import { useNow } from "../lib/useNow";
import {
  addDays,
  fmtDayHeading,
  HEB_DAYS_SHORT,
  isShabbat,
  isToday,
  startOfWeek,
  toKey,
  weekDays,
} from "../lib/date";
import { WeekNav } from "../components/common";
import { ClassCard } from "../components/ClassCard";
import { SessionDetail } from "../components/SessionDetail";
import { InstallBanner } from "../components/InstallBanner";
import { IcCalendar } from "../components/icons";

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
  useNow(); // keep time-dependent booking states fresh as time passes (§5.3)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [activeKey, setActiveKey] = useState(() => toKey(new Date()));
  const [cats, setCats] = useState<Set<ClassCategory>>(new Set());
  const [open, setOpen] = useState<ClassSession | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const days = weekDays(weekStart);

  // Keyboard roving on the day strip. RTL: ArrowRight → earlier day (rightward),
  // ArrowLeft → later day (leftward). Home/End jump to Sunday/Saturday.
  function onStripKey(e: React.KeyboardEvent) {
    const idx = days.findIndex((d) => toKey(d) === activeKey);
    if (idx < 0) return;
    let next = idx;
    if (e.key === "ArrowLeft") next = Math.min(6, idx + 1);
    else if (e.key === "ArrowRight") next = Math.max(0, idx - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 6;
    else return;
    e.preventDefault();
    setActiveKey(toKey(days[next]));
    const btns = stripRef.current?.querySelectorAll<HTMLButtonElement>("button.daycol");
    btns?.[next]?.focus();
  }

  // sessions grouped by day key
  const byDay = useMemo(() => {
    const map = new Map<string, ClassSession[]>();
    for (const s of data.sessions) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startMin - b.startMin);
    return map;
  }, [data.sessions]);

  function countFor(key: string): number {
    return (byDay.get(key) ?? []).filter((s) => !s.cancelled).length;
  }

  const activeCategoryFilter = (s: ClassSession) => {
    // Members never see a cancelled class - it simply disappears (only the admin
    // calendar keeps the cancelled marker).
    if (s.cancelled) return false;
    // Guard: a session whose class type was removed must not crash the whole day.
    const ct = data.classTypes.find((c) => c.id === s.classTypeId);
    if (!ct) return false;
    return cats.size === 0 || cats.has(ct.category);
  };

  const activeSessions = (byDay.get(activeKey) ?? []).filter(activeCategoryFilter);
  const activeDate = days.find((d) => toKey(d) === activeKey) ?? days[0];

  function toggleCat(c: ClassCategory) {
    setCats((prev) => {
      const n = new Set(prev);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  }

  function goWeek(delta: number) {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    setActiveKey(toKey(next)); // jump to first day of that week
  }
  function goToday() {
    setWeekStart(startOfWeek(new Date()));
    setActiveKey(toKey(new Date()));
  }

  // Insurance lock: a member may not access the booking view without a valid,
  // in-date, cleared health declaration. Expired/missing → re-declare; a flagged
  // renewal waits for staff clearance. Staff (role !== member) are unaffected.
  const me = data.users.find((u) => u.id === data.currentUserId);
  if (me && me.role === "member") {
    const hs = healthDeclarationState(me);
    if (hs === "expired" || hs === "missing") return <HealthDeclaration user={me} />;
    if (hs === "pending_medical") return <HealthClearancePending />;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">{t.nav.schedule}</h1>
          <div className="sub">{data.locations[0]?.name}</div>
        </div>
        <WeekNav
          weekStart={weekStart}
          onPrev={() => goWeek(-1)} /* "שבוע קודם" - earlier in time */
          onNext={() => goWeek(1)} /* "שבוע הבא" - later in time */
          onToday={goToday}
        />
      </div>

      <InstallBanner />

      {/* day strip */}
      <div
        className="daystrip"
        role="group"
        aria-label="בחירת יום"
        ref={stripRef}
        onKeyDown={onStripKey}
      >
        {days.map((d) => {
          const key = toKey(d);
          const n = countFor(key);
          return (
            <button
              key={key}
              className={`daycol ${key === activeKey ? "is-active" : ""} ${
                isToday(key) ? "is-today" : ""
              } ${isShabbat(d) ? "is-shabbat" : ""}`}
              onClick={() => setActiveKey(key)}
              aria-pressed={key === activeKey}
              aria-current={isToday(key) ? "date" : undefined}
            >
              {/* Visible text stays part of the accessible name (WCAG 2.5.3);
                  an sr-only span adds the full, unabbreviated description. */}
              <span className="dow">{HEB_DAYS_SHORT[d.getDay()]}</span>
              <span className="dnum">{d.getDate()}</span>
              <span className="cnt">{n > 0 ? `${n} ש׳` : "-"}</span>
              <span className="sr-only"> - {fmtDayHeading(d)}, {n} שיעורים</span>
            </button>
          );
        })}
      </div>

      {/* category filters */}
      <div className="filterbar">
        <button
          className={`filter-chip ${cats.size === 0 ? "on" : ""}`}
          onClick={() => setCats(new Set())}
          aria-pressed={cats.size === 0}
        >
          הכול
        </button>
        {(Object.keys(CATEGORY_META) as ClassCategory[]).map((c) => (
          <button
            key={c}
            className={`filter-chip ${cats.has(c) ? "on" : ""}`}
            onClick={() => toggleCat(c)}
            aria-pressed={cats.has(c)}
          >
            {CATEGORY_META[c].label}
          </button>
        ))}
      </div>

      {/* active day */}
      <div className="day-section">
        <div className="dh">
          <h2>{fmtDayHeading(activeDate)}</h2>
          {isShabbat(activeDate) && (
            <span className="chip count-chip">
              {t.shabbatNote}
            </span>
          )}
          <span className="line" />
        </div>

        {activeSessions.length === 0 ? (
          <div className="empty">
            <div className="ico">
              <IcCalendar width={42} height={42} style={{ opacity: 0.4 }} />
            </div>
            <h3>{t.noClasses}</h3>
            <p>{t.noClassesHint}</p>
          </div>
        ) : (
          <div className="class-list cols-3">
            {activeSessions.map((s) => (
              <ClassCard key={s.id} session={s} onOpen={setOpen} />
            ))}
          </div>
        )}
      </div>

      {open && <SessionDetail session={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
