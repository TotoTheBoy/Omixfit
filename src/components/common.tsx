import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassCategory, User } from "../lib/types";
import { fmtWeekRange, HEB_MONTHS } from "../lib/date";
import { IcChevL, IcChevR } from "./icons";

export function Avatar({ user, size = 34 }: { user: User; size?: number }) {
  return (
    <span
      className="avatar"
      style={{
        background: user.avatarColor,
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
      title={user.name}
    >
      {user.initials}
    </span>
  );
}

export function FaceStack({ users, max = 4 }: { users: User[]; max?: number }) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <div className="face-stack">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={28} />
      ))}
      {rest > 0 && <span className="more">+{rest}</span>}
    </div>
  );
}

export function CategoryChip({ category }: { category: ClassCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className="chip"
      style={{
        background: `hsl(${meta.hue} 85% 95%)`,
        color: `hsl(${meta.hue} 70% 32%)`,
      }}
    >
      <span
        className="badge-dot"
        style={{ background: `hsl(${meta.hue} 80% 50%)` }}
      />
      {meta.label}
    </span>
  );
}

export function CapacityBar({
  booked,
  capacity,
}: {
  booked: number;
  capacity: number;
}) {
  const left = Math.max(0, capacity - booked);
  const pct = Math.min(100, Math.round((booked / capacity) * 100));
  const cls = left === 0 ? "full" : left <= 3 ? "warn" : "";
  const label =
    left === 0 ? t.full : t.spotsLeft(left);
  return (
    <div className="capacity">
      <div className="cap-top">
        <span
          className="cap-label"
          style={{
            color:
              left === 0
                ? "var(--danger-ink)"
                : left <= 3
                  ? "var(--warn-ink)"
                  : "var(--ok-ink)",
          }}
        >
          {label}
        </span>
        <span className="cap-num">{t.ofCapacity(booked, capacity)}</span>
      </div>
      <div className="cap-bar">
        <div className={`cap-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function WeekNav({
  weekStart,
  onPrev,
  onNext,
  onToday,
}: {
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="row gap-3 wrap">
      <div className="weekbar grow">
        <button className="weeknav-btn" onClick={onPrev} aria-label="שבוע קודם">
          <IcChevR />
        </button>
        <div className="weeklabel">
          {fmtWeekRange(weekStart)}
          <small>{HEB_MONTHS[weekStart.getMonth()]} {weekStart.getFullYear()}</small>
        </div>
        <button className="weeknav-btn" onClick={onNext} aria-label="שבוע הבא">
          <IcChevL />
        </button>
      </div>
      <button className="today-pill" onClick={onToday}>
        {t.nav.today}
      </button>
    </div>
  );
}
