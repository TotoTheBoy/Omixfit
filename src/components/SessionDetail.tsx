import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassSession } from "../lib/types";
import {
  actionFor,
  book,
  cancelBooking,
  classTypeOf,
  confirmedCount,
  joinWaitlist,
  setAttendance,
  useStore,
} from "../lib/store";
import { fmtDayHeading, fmtTime, fromKey } from "../lib/date";
import { Sheet } from "./Sheet";
import { Avatar, CapacityBar } from "./common";
import { toast } from "./Toast";
import { celebrate } from "./Celebration";
import { IcClock, IcClose, IcPin, IcUser } from "./icons";

export function SessionDetail({
  session,
  onClose,
  onEdit,
}: {
  session: ClassSession;
  onClose: () => void;
  onEdit?: (s: ClassSession) => void;
}) {
  const data = useStore((s) => s);
  const me = data.users.find((u) => u.id === data.currentUserId)!;
  const type = classTypeOf(session, data);
  const meta = CATEGORY_META[type.category];
  const instructor = data.users.find((u) => u.id === session.instructorId)!;
  const booked = confirmedCount(session.id, data);
  const action = actionFor(session, me.id, data);
  const mine = action.kind === "booked";
  const onWaitlist = action.kind === "waitlisted";
  const isStaff = me.role !== "member";

  const roster = data.bookings
    .filter(
      (b) =>
        b.sessionId === session.id &&
        (b.state === "confirmed" || b.state === "attended" || b.state === "no_show"),
    )
    .map((b) => ({ b, user: data.users.find((u) => u.id === b.userId)! }));
  const waitlist = data.bookings
    .filter((b) => b.sessionId === session.id && b.state === "waitlisted")
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((b) => ({ b, user: data.users.find((u) => u.id === b.userId)! }));

  async function doBook() {
    const r = await book(session.id, me.id);
    if (r === "ok") {
      toast(t.bookedToast, "ok");
      celebrate();
    }
    else if (r === "full") toast(t.fullToast, "err");
    else if (r === "membership") toast(t.membershipBlocked, "err");
    else if (r === "limit") toast(t.limitReached, "err");
    else if (r === "closed") toast(t.closedToast, "err");
  }
  async function doCancel() {
    const { promotedUserId } = await cancelBooking(session.id, me.id);
    toast(t.cancelledToast, "info");
    if (promotedUserId) {
      const promoted = data.users.find((u) => u.id === promotedUserId);
      toast(t.promotedOtherToast(promoted?.name ?? ""), "ok");
    }
  }
  async function doJoinWaitlist() {
    const r = await joinWaitlist(session.id, me.id);
    if (r === "ok") toast(t.waitlistJoinedToast, "ok");
    else if (r === "membership") toast(t.membershipBlocked, "err");
    else if (r === "closed") toast(t.closedToast, "err");
  }
  function doLeaveWaitlist() {
    cancelBooking(session.id, me.id);
    toast(t.waitlistLeftToast, "info");
  }

  const reasonNote = (() => {
    if (session.cancelled) return { cls: "warn", text: t.cancelled };
    switch (action.kind) {
      case "closed":
        return { cls: "warn", text: t.closed };
      case "blocked":
        return {
          cls: "warn",
          text: action.reason === "membership" ? t.membershipBlocked : t.limitReached,
        };
      case "waitlist":
        return { cls: "warn", text: t.waitlistNote };
      default:
        return null;
    }
  })();

  const hero = (
    <div
      className="detail-hero"
      style={{
        background: `linear-gradient(135deg, hsl(${meta.hue} 65% 22%), hsl(${meta.hue} 70% 38%))`,
      }}
    >
      <div className="glow" style={{ background: `hsl(${meta.hue} 90% 60%)` }} />
      <button
        className="iconbtn"
        onClick={onClose}
        aria-label={t.close}
        style={{
          position: "absolute",
          insetInlineEnd: 14,
          top: 14,
          background: "rgba(255,255,255,.15)",
          color: "#fff",
        }}
      >
        <IcClose />
      </button>
      <div className="chip" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}>
        {meta.emoji} {meta.label}
      </div>
      <h2 style={{ marginTop: 10 }}>{type.name}</h2>
      <div className="sub">{fmtDayHeading(fromKey(session.date))}</div>
    </div>
  );

  return (
    <Sheet
      onClose={onClose}
      hero={hero}
      footer={
        me.role === "member" ? (
          mine ? (
            <button className="btn btn-danger btn-lg btn-block" onClick={doCancel}>
              {t.cancel}
            </button>
          ) : onWaitlist ? (
            <button className="btn btn-ghost btn-lg btn-block" onClick={doLeaveWaitlist}>
              {t.leaveWaitlist} · {t.waitlistPos(action.kind === "waitlisted" ? action.pos : 0)}
            </button>
          ) : action.kind === "book" ? (
            <button className="btn btn-lime btn-lg btn-block" onClick={doBook}>
              {t.book} · {fmtTime(session.startMin)}
            </button>
          ) : action.kind === "waitlist" ? (
            <button className="btn btn-wait btn-lg btn-block" onClick={doJoinWaitlist}>
              {t.joinWaitlist}
            </button>
          ) : (
            <button className="btn btn-ghost btn-lg btn-block" disabled>
              {action.kind === "closed" ? t.closed : action.kind === "blocked" && action.reason === "membership" ? t.membershipBlocked : t.full}
            </button>
          )
        ) : onEdit ? (
          <button
            className="btn btn-ink btn-lg btn-block"
            onClick={() => onEdit(session)}
          >
            {t.editSession}
          </button>
        ) : null
      }
    >
      <div className="row gap-3 wrap">
        <InfoTile icon={<IcClock />} label={t.timeLabel}
          value={`${fmtTime(session.startMin)}–${fmtTime(session.startMin + session.durationMin)}`} />
        <InfoTile icon={<IcUser />} label={t.instructorLabel} value={instructor.name} />
        <InfoTile icon={<IcPin />} label={t.roomLabel} value={session.room} />
      </div>

      <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>{type.description}</p>

      {session.online && !session.cancelled && (
        <a className="btn btn-ink grow" href={`https://meet.jit.si/omix-${session.id}`}
          target="_blank" rel="noreferrer" style={{ marginTop: 2 }}>
          🎥 {t.joinVideo}
        </a>
      )}

      {!session.cancelled && <CapacityBar booked={booked} capacity={session.capacity} />}

      {reasonNote && (
        <div className={`note ${reasonNote.cls}`}>
          <span className="ni">ℹ️</span>
          {reasonNote.text}
        </div>
      )}

      {mine && (
        <div className="note info">
          <span className="ni">✅</span>
          {t.booked} - נשמח לראותך! ביטול אפשרי עד {data.facility.cancelCutoffHours} שעות לפני.
        </div>
      )}

      {onWaitlist && (
        <div className="note warn">
          <span className="ni">⏳</span>
          {t.onWaitlist} · {t.waitlistAhead(action.kind === "waitlisted" ? action.pos - 1 : 0)}
        </div>
      )}

      {/* Roster - staff only (privacy Q2: members see counts, not names) */}
      {isStaff && (
        <div>
          <div className="row gap-2" style={{ marginBottom: 8 }}>
            <h3 className="h2">{t.roster}</h3>
            <span className="chip" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>
              {roster.length}/{session.capacity}
            </span>
          </div>
          {roster.length === 0 ? (
            <p className="muted">{t.rosterEmpty}</p>
          ) : (
            <div className="roster">
              {roster.map(({ b, user }) => (
                <div key={b.id} className="roster-row">
                  <Avatar user={user} size={32} />
                  <span className="nm">{user.name}</span>
                  <span className="ph">{user.phone}</span>
                  <div className="att-toggle" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={b.state === "attended" ? "on-yes" : ""}
                      onClick={() => setAttendance(b.id, true)}
                    >
                      {t.present}
                    </button>
                    <button
                      className={b.state === "no_show" ? "on-no" : ""}
                      onClick={() => setAttendance(b.id, false)}
                    >
                      {t.noShow}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {waitlist.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="row gap-2" style={{ marginBottom: 8 }}>
                <h3 className="h2">{t.onWaitlist}</h3>
                <span className="chip" style={{ background: "#fff6e6", color: "var(--warn-ink)" }}>
                  {t.waitlistCountLabel(waitlist.length)}
                </span>
              </div>
              <div className="roster">
                {waitlist.map(({ b, user }, i) => (
                  <div key={b.id} className="roster-row">
                    <span className="wl-pos" aria-hidden="true">{i + 1}</span>
                    <Avatar user={user} size={32} />
                    <span className="nm">{user.name}</span>
                    <span className="ph">{user.phone}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="grow"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        padding: "11px 13px",
        minWidth: 120,
      }}
    >
      <div className="row gap-2" style={{ color: "var(--text-3)", fontSize: ".78rem", fontWeight: 600 }}>
        <span style={{ width: 15, height: 15, display: "grid" }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontWeight: 700, marginTop: 3 }}>{value}</div>
    </div>
  );
}
