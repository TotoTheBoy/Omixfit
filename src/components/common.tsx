import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassCategory, User } from "../lib/types";
import { fmtWeekRange, HEB_MONTHS } from "../lib/date";
import { buildTimeLabel, VERSION_LABEL } from "../lib/version";
import { IcChevL, IcChevR } from "./icons";

// Tiny build-identity line so anyone can see which commit is deployed
// (hover for the build time). Rendered in the profile + login footers.
export function VersionTag({ className = "" }: { className?: string }) {
  const built = buildTimeLabel();
  return (
    <div
      className={`version-tag ${className}`.trim()}
      dir="ltr"
      title={built ? `${t.version} · ${built}` : t.version}
    >
      {t.version} {VERSION_LABEL}
    </div>
  );
}

// Pick dark or white initials by whichever has the higher WCAG contrast against
// the avatar background - keeps initials legible (AA) on any palette color.
function readableInk(hex: string): string {
  const h = hex.replace("#", "");
  const ch = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
  // Use a fixed near-black for the dark ink (luminance ~0.006) so the contrast
  // math matches the colour actually rendered - independent of the (warmer)
  // --ink-900 chrome token.
  const cDark = (L + 0.05) / (0.006 + 0.05);
  const cWhite = 1.05 / (L + 0.05);
  return cDark >= cWhite ? "#0b0e13" : "#ffffff";
}

export function Avatar({
  user,
  size = 34,
  tone,
}: {
  user: User;
  size?: number;
  /** Force a brand background hex (e.g. the nav pill) instead of the per-user color. */
  tone?: string;
}) {
  const skin = user.avatarSkin;
  const bg = tone ?? user.avatarColor;
  return (
    <span
      className="avatar"
      style={{
        background: skin ? "var(--surface-2)" : bg,
        color: readableInk(bg),
        width: size,
        height: size,
        fontSize: skin ? size * 0.56 : size * 0.4,
      }}
      title={user.name}
    >
      {skin || user.initials}
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
