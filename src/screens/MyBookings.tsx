import { useMemo, useState } from "react";
import { t } from "../lib/i18n";
import type { ClassSession } from "../lib/types";
import { sessionStartDate, useStore } from "../lib/store";
import { useNow } from "../lib/useNow";
import { ClassCard } from "../components/ClassCard";
import { SessionDetail } from "../components/SessionDetail";
import { Packages } from "../components/Packages";
import { PayOptions } from "../components/PayOptions";
import { Sheet } from "../components/Sheet";
import { IcBookmark } from "../components/icons";

export function MyBookings({ onGoSchedule }: { onGoSchedule: () => void }) {
  const data = useStore((s) => s);
  const nowTick = useNow(); // re-split upcoming/past as sessions roll into the past
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [open, setOpen] = useState<ClassSession | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const { upcoming, past } = useMemo(() => {
    const now = nowTick;
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
  }, [data, nowTick]);

  const list = tab === "upcoming" ? upcoming : past;
  const me = data.users.find((u) => u.id === data.currentUserId);
  const credits = me?.passSessionsLeft;
  const lowCredit = typeof credits === "number" && credits <= 2;

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

      <h2 className="sr-only">{tab === "upcoming" ? t.upcoming : t.past}</h2>
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

      {/* #2 packages & memberships store — relocated into "My Orders" as a
          dedicated, premium section that invites purchase / renewal. */}
      <section className="orders-store">
        <span className="orders-store-eyebrow">{t.packages.storeEyebrow}</span>
        {lowCredit && (
          <div className="credit-nudge">
            <b>{t.packages.lowCredit(credits!)}</b>
            <span>{t.packages.lowCreditCta}</span>
          </div>
        )}
        <Packages onBuy={() => setPayOpen(true)} />
      </section>

      {payOpen && (
        <Sheet title={t.pay.buyTitle} onClose={() => setPayOpen(false)}>
          <p className="muted" style={{ margin: "0 0 14px" }}>{t.pay.choose}</p>
          <PayOptions onDone={() => setPayOpen(false)} />
        </Sheet>
      )}

      {open && <SessionDetail session={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
