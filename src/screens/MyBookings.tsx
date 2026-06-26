import { useMemo, useState } from "react";
import { t } from "../lib/i18n";
import type { ClassSession } from "../lib/types";
import { sessionStartDate, useStore } from "../lib/store";
import { ClassCard } from "../components/ClassCard";
import { SessionDetail } from "../components/SessionDetail";
import { IcBookmark } from "../components/icons";

export function MyBookings({ onGoSchedule }: { onGoSchedule: () => void }) {
  const data = useStore((s) => s);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [open, setOpen] = useState<ClassSession | null>(null);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const mineIds = new Set(
      data.bookings
        .filter(
          (b) =>
            b.userId === data.currentUserId &&
            (b.state === "confirmed" ||
              b.state === "attended" ||
              b.state === "no_show" ||
              b.state === "waitlisted"),
        )
        .map((b) => b.sessionId),
    );
    const sessions = data.sessions
      .filter((s) => mineIds.has(s.id))
      .sort((a, b) => sessionStartDate(a).getTime() - sessionStartDate(b).getTime());
    return {
      upcoming: sessions.filter((s) => sessionStartDate(s).getTime() >= now && !s.cancelled),
      past: sessions.filter((s) => sessionStartDate(s).getTime() < now || s.cancelled).reverse(),
    };
  }, [data]);

  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">{t.nav.myBookings}</h1>
          <div className="sub">
            {upcoming.length > 0
              ? `${upcoming.length} שיעורים קרובים מחכים לך`
              : "כל ההזמנות שלך במקום אחד"}
          </div>
        </div>
        <div className="seg">
          <button className={tab === "upcoming" ? "on" : ""} onClick={() => setTab("upcoming")}>
            {t.upcoming}
          </button>
          <button className={tab === "past" ? "on" : ""} onClick={() => setTab("past")}>
            {t.past}
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <div className="ico">
            <IcBookmark width={42} height={42} style={{ opacity: 0.4 }} />
          </div>
          <h3>{tab === "upcoming" ? t.emptyBookingsTitle : t.past}</h3>
          <p>{t.emptyBookingsHint}</p>
          {tab === "upcoming" && (
            <button className="btn btn-lime" style={{ marginTop: 14 }} onClick={onGoSchedule}>
              {t.goToSchedule}
            </button>
          )}
        </div>
      ) : (
        <div className="class-list cols-3">
          {list.map((s) => (
            <ClassCard key={s.id} session={s} onOpen={setOpen} />
          ))}
        </div>
      )}

      {open && <SessionDetail session={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
