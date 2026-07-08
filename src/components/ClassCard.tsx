import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassSession } from "../lib/types";
import {
  actionFor,
  classTypeOf,
  confirmedCount,
  useStore,
  waitlistCount,
} from "../lib/store";
import { fmtTime } from "../lib/date";
import { IcCheck, IcClock, IcPin, IcUser } from "./icons";

export function ClassCard({
  session,
  onOpen,
}: {
  session: ClassSession;
  onOpen: (s: ClassSession) => void;
}) {
  const data = useStore((s) => s);
  const type = classTypeOf(session, data);
  const meta = CATEGORY_META[type.category];
  const instructor = data.users.find((u) => u.id === session.instructorId)!;
  const booked = confirmedCount(session.id, data);
  const left = session.capacity - booked;
  const me = data.users.find((u) => u.id === data.currentUserId)!;
  const action = actionFor(session, me.id, data);
  const mine = action.kind === "booked";
  const onWaitlist = action.kind === "waitlisted";
  const wlCount = waitlistCount(session.id, data);

  const isMember = me.role === "member";

  const summary = `${type.name}, ${fmtTime(session.startMin)}, ${
    session.cancelled ? t.cancelled : left <= 0 ? t.full : t.spotsLeft(left)
  }`;

  return (
    <article
      className={`class-card ${mine ? "is-mine" : ""} ${
        onWaitlist ? "is-waitlisted" : ""
      } ${left <= 0 && !mine ? "is-full" : ""} ${
        session.cancelled ? "is-cancelled" : ""
      }`}
      style={{ ["--cat-hue" as string]: meta.hue }}
    >
      <span className="cat-rail" aria-hidden="true" />
      {/* Stretched cover button: one interactive control for the whole card so
          screen readers/keyboard get a single target. The Book button below
          sits above it (z-index) so it stays independently clickable. */}
      <button
        className="cc-cover"
        onClick={() => onOpen(session)}
        aria-label={`פרטים והרשמה - ${summary}`}
      />
      <div className="cc-top">
        <div className="cc-time">
          <span className="t">{fmtTime(session.startMin)}</span>
          <span className="dur">{session.durationMin}׳</span>
        </div>
        <div className="cc-main">
          <h3 className="cc-title">
            <span className="cc-emoji" aria-hidden="true">{meta.emoji}</span>
            {type.name}
          </h3>
          <div className="cc-meta">
            <span className="m">
              <IcUser />
              {t.withInstructor} {instructor.name}
            </span>
            <span className="m">
              <IcPin />
              {session.room}
            </span>
            <span className="m">
              <IcClock />
              {fmtTime(session.startMin)}–{fmtTime(session.startMin + session.durationMin)}
            </span>
          </div>
        </div>
      </div>

      <div className="cc-bottom">
        {session.cancelled ? (
          <span className="chip" style={{ background: "#fff0f1", color: "var(--danger-ink)" }}>
            {t.cancelled}
          </span>
        ) : (
          <div className="grow">
            {left <= 0 ? (
              <span className="cap-text full">{t.full}</span>
            ) : left <= 3 ? (
              <span className="cap-text last">{left === 1 ? t.lastSpot : t.lastSpots(left)}</span>
            ) : (
              <span className="cap-text open">{t.spotsLeft(left)}</span>
            )}
            {wlCount > 0 && left <= 0 && (
              <span className="wl-count">{t.waitlistCountLabel(wlCount)}</span>
            )}
          </div>
        )}

        {isMember && !session.cancelled && (
          <div className="cc-action">
            {mine ? (
              <span className="mine-flag">
                <IcCheck width={16} height={16} /> {t.booked}
              </span>
            ) : onWaitlist ? (
              <span className="wl-flag">{t.waitlistPos(action.pos)}</span>
            ) : action.kind === "book" ? (
              <button className="btn btn-lime btn-sm" onClick={() => onOpen(session)}>
                {t.book}
              </button>
            ) : action.kind === "waitlist" ? (
              <button className="btn btn-wait btn-sm" onClick={() => onOpen(session)}>
                {t.joinWaitlist}
              </button>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => onOpen(session)}>
                {action.kind === "closed" ? t.closed : t.book}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
