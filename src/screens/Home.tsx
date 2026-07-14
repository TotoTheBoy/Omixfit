import { useEffect } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import {
  classTypeOf,
  memberStats,
  sessionStartDate,
  updateUser,
  useStore,
} from "../lib/store";
import { loyaltyFor, weeklyStreak, LOYALTY_TIERS } from "../lib/engine";
import { fmtDayHeading, fmtRelative, fmtTime, fromKey } from "../lib/date";
import { OmixMark } from "../components/Brand";
import { IcBookmark, IcCalendar, IcChevR, IcUser } from "../components/icons";
import type { ClassSession } from "../lib/types";

type View = "schedule" | "bookings" | "profile";

/** Trainee home — the app's landing surface once signed in. A dashboard that
 *  summarises the member (loyalty tier + progress, next class, quick stats, the
 *  studio feed) and routes them onward via quick actions, à la Arbox. */
export function Home({ onGo }: { onGo: (v: View) => void }) {
  const data = useStore((s) => s);
  const me = data.users.find((u) => u.id === data.currentUserId)!;
  const stats = memberStats(me.id, data);
  const loyalty = loyaltyFor(stats.attended);
  const streak = weeklyStreak(me.id, data);

  // Rank-up celebration: baseline silently on first ever load (so long-standing
  // members don't get a false party), then a genuine climb past the seen index
  // shows the banner until acknowledged.
  useEffect(() => {
    if (me.loyaltySeen === undefined) updateUser(me.id, { loyaltySeen: loyalty.index });
  }, [me.id, me.loyaltySeen, loyalty.index]);
  const rankedUp = me.loyaltySeen !== undefined && loyalty.index > me.loyaltySeen;
  const ackRank = () => updateUser(me.id, { loyaltySeen: loyalty.index });

  const hour = new Date().getHours();
  const timeGreet = hour < 12 ? t.greet.morning : hour < 18 ? t.greet.noon : t.greet.evening;
  const firstName = me.firstName || me.name?.split(" ")[0] || "";

  const now = Date.now();
  const next = data.bookings
    .filter((b) => b.userId === me.id && b.state === "confirmed")
    .map((b) => data.sessions.find((se) => se.id === b.sessionId))
    .filter((se): se is ClassSession => !!se && sessionStartDate(se).getTime() > now)
    .sort((a, b) => sessionStartDate(a).getTime() - sessionStartDate(b).getTime())[0];

  const feed = [...data.announcements].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);

  return (
    <div className="home">
      <div className="home-greet">
        <h1 className="h1">{timeGreet}{firstName ? `, ${firstName}` : ""} 👋</h1>
        <p className="muted">{t.home.subtitle}</p>
      </div>

      {rankedUp && (
        <div className="rankup" role="status">
          <OmixMark size={40} />
          <div className="rankup-txt">
            <b>{t.home.rankUp}</b>
            <span>{t.home.rankUpBody(loyalty.current.name)}</span>
          </div>
          <button className="btn btn-primary" onClick={ackRank}>{t.home.rankUpCta}</button>
        </div>
      )}

      {/* loyalty ladder — several ranks, current highlighted, progress to next */}
      <section className="home-loyalty">
        <div className="hl-head">
          <div>
            <span className="hl-kicker">{t.home.loyaltyKicker}</span>
            <b className="hl-tier">{loyalty.current.name}</b>
          </div>
          <span className="hl-attended">{t.home.attendedN(stats.attended)}</span>
        </div>
        <ol className="hl-ladder" aria-label={t.home.loyaltyKicker}>
          {LOYALTY_TIERS.map((tier, i) => (
            <li
              key={tier.id}
              className={`hl-step ${i < loyalty.index ? "done" : ""} ${i === loyalty.index ? "cur" : ""}`}
            >
              <span className="hl-dot" aria-hidden="true">{i <= loyalty.index ? "★" : "☆"}</span>
              <span className="hl-name">{tier.name.replace("OMIX ", "")}</span>
              <small>{tier.min}+</small>
            </li>
          ))}
        </ol>
        {loyalty.next && (
          <div className="hl-progress-wrap">
            <div className="hl-progress"><span style={{ width: `${loyalty.progress * 100}%` }} /></div>
            <small>{t.loyalty.toNext(loyalty.toNext, loyalty.next.name)}</small>
          </div>
        )}
      </section>

      {/* next class */}
      <div className="next-class home-next">
        <span className="nc-label">{t.nextClass}</span>
        {next ? (
          <button className="nc-body nc-btn" onClick={() => onGo("bookings")}>
            <span className="nc-emoji" aria-hidden="true">{CATEGORY_META[classTypeOf(next, data).category].emoji}</span>
            <div className="nc-info">
              <b>{classTypeOf(next, data).name}</b>
              <span>{fmtDayHeading(fromKey(next.date))} · {fmtTime(next.startMin)}</span>
              <small>{next.room}</small>
            </div>
            <IcChevR width={18} height={18} style={{ opacity: 0.6, marginInlineStart: "auto" }} />
          </button>
        ) : (
          <button className="nc-empty" onClick={() => onGo("schedule")}>{t.noNextClass}</button>
        )}
      </div>

      {/* quick stats */}
      <div className="home-stats">
        <div className="hs"><b>{stats.attended}</b><span>{t.attendedCount}</span></div>
        <div className="hs"><b>{stats.upcoming}</b><span>{t.upcomingCount}</span></div>
        <div className="hs"><b>{streak}</b><span>{t.home.streakWeeks}</span></div>
      </div>

      {/* studio feed */}
      <section className="home-feed">
        <h2 className="h2">{t.ann.feedTitle}</h2>
        {feed.length === 0 ? (
          <div className="feed-empty">{t.ann.feedEmpty}</div>
        ) : (
          <ul className="feed-list">
            {feed.map((a) => (
              <li key={a.id} className={`feed-card ann-tone-${a.tone ?? "news"}`}>
                <div className="feed-top">
                  <b>{a.title}</b>
                  <small>{fmtRelative(a.createdAt)}</small>
                </div>
                <p>{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* quick actions */}
      <section className="home-actions">
        <button className="ha ha-book" onClick={() => onGo("schedule")}>
          <IcCalendar width={22} height={22} />
          <span>{t.home.actBook}</span>
        </button>
        <button className="ha" onClick={() => onGo("bookings")}>
          <IcBookmark width={22} height={22} />
          <span>{t.home.actBookings}</span>
        </button>
        <button className="ha" onClick={() => onGo("profile")}>
          <IcUser width={22} height={22} />
          <span>{t.home.actProfile}</span>
        </button>
      </section>
    </div>
  );
}
