import { useState } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassCategory, ClassSession, NotifyPrefs } from "../lib/types";
import { logout, memberStats, updateUser, useStore, syncCalendar, calConnectUrl, savePaymentLinks, classTypeOf, sessionStartDate, CALENDAR_CONNECT_URL } from "../lib/store";
import { fromKey, fmtTime, fmtDayHeading } from "../lib/date";
import { loyaltyFor, weeklyStreak, LOYALTY_TIERS } from "../lib/engine";
import { Avatar, VersionTag } from "../components/common";
import { Sheet } from "../components/Sheet";
import { Billing } from "../components/Billing";
import { PWAInstallAction } from "../components/PWAInstallAction";
import { AVATAR_LIST, AvatarSkin } from "../components/avatars";
import { toast } from "../components/Toast";
import { IcBolt, IcCheck, IcSpark, IcCalendar, IcBookmark } from "../components/icons";

/** YYYY-MM-DD → DD/MM/YYYY (membership card). */
const fmtDMY = (ymd: string): string => {
  const [y, m, d] = (ymd || "").split("-");
  return d && m && y ? `${d}/${m}/${y}` : ymd;
};

export function Profile({ onSwitchUser }: { onSwitchUser: () => void }) {
  const data = useStore((s) => s);
  const me = data.users.find((u) => u.id === data.currentUserId)!;
  const stats = memberStats(me.id, data);
  const prefs: NotifyPrefs = me.prefs ?? {
    push: true,
    email: true,
    whatsapp: true,
    reminderHours: 2,
  };
  const [editing, setEditing] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [calBusy, setCalBusy] = useState(false);
  const fac = data.facility;
  const [bit, setBit] = useState(fac.bitLink ?? "");
  const [paybox, setPaybox] = useState(fac.payboxLink ?? "");
  const isAdmin = me.role === "admin";
  const [skinOpen, setSkinOpen] = useState(false);

  function savePay() {
    savePaymentLinks({ bitLink: bit.trim(), payboxLink: paybox.trim() });
    toast("קישורי התשלום נשמרו", "ok");
  }

  async function syncCal() {
    setCalBusy(true);
    try {
      const r = await syncCalendar();
      if (r.connected) toast(t.calendar.synced(r.synced), "ok");
      else toast(t.calendar.notConnected, "info");
    } catch {
      toast(t.calendar.notConnected, "err");
    } finally {
      setCalBusy(false);
    }
  }

  const [calMineBusy, setCalMineBusy] = useState(false);
  async function connectMyCal() {
    try {
      window.open(await calConnectUrl(), "_blank", "noreferrer");
    } catch {
      toast(t.calendarMine.notConnected, "err");
    }
  }
  async function syncMyCal() {
    setCalMineBusy(true);
    try {
      const r = await syncCalendar("personal");
      if (r.connected) toast(t.calendarMine.synced(r.synced), "ok");
      else toast(t.calendarMine.notConnected, "info");
    } catch {
      toast(t.calendarMine.notConnected, "err");
    } finally {
      setCalMineBusy(false);
    }
  }

  function setPref(patch: Partial<NotifyPrefs>) {
    updateUser(me.id, { prefs: { ...prefs, ...patch } });
  }
  function pickSkin(emoji: string) {
    updateUser(me.id, { avatarSkin: emoji });
    toast(t.avatarSkin.saved, "ok");
  }

  const fav = stats.favorite as ClassCategory | null;
  const loyalty = loyaltyFor(stats.attended);
  const streak = weeklyStreak(me.id, data);
  // Staff aren't gated by attendance — they default to the top tier and can set
  // their own by tapping the badge (admin-only).
  const overrideId = me.loyaltyOverride ?? (isAdmin ? "marathoner" : null);
  const currentTier = overrideId
    ? LOYALTY_TIERS.find((x) => x.id === overrideId) ?? loyalty.current
    : loyalty.current;
  function cycleTier() {
    const ids = LOYALTY_TIERS.map((x) => x.id);
    const next = ids[(ids.indexOf(currentTier.id) + 1) % ids.length];
    updateUser(me.id, { loyaltyOverride: next });
    toast(t.loyalty.tierSet(LOYALTY_TIERS.find((x) => x.id === next)!.name), "ok");
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">{t.profileTitle}</h1>
          <div className="sub">{t.roles[me.role]} · {data.locations[0].name}</div>
        </div>
        <button className="btn btn-ghost" onClick={() => setEditing(true)}>
          {t.editProfile}
        </button>
      </div>

      {/* membership card */}
      <div className={`member-card tier-${currentTier.id}`}>
        <div className="mc-top">
          <span className="mc-brand">
            <span className="logo">
              <IcBolt width={16} height={16} style={{ color: "var(--ink-900)" }} />
            </span>
            {t.appName}
          </span>
          {isAdmin ? (
            <button className="mc-tier mc-tier-btn" onClick={cycleTier} title={t.loyalty.tierAdminHint}>
              {currentTier.name} ⇅
            </button>
          ) : (
            <span className="mc-tier">{currentTier.name}</span>
          )}
        </div>
        <div className="mc-id">
          <button className="mc-avatar-btn" onClick={() => setSkinOpen(true)} aria-label={t.avatarSkin.title}>
            <Avatar user={me} size={52} tone="#c5a059" />
          </button>
          <div className="mc-id-text">
            <div className="mc-name">{me.name}</div>
            {me.membershipPlan && <div className="mc-plan">{me.membershipPlan}</div>}
          </div>
        </div>
        <div className="mc-entitlement">
          {me.passSessionsLeft != null ? (
            <b className="mc-ent-gold">{t.membershipCard.passLeft(me.passSessionsLeft)}</b>
          ) : me.membershipValidUntil ? (
            <b>{t.membershipCard.validUntil(fmtDMY(me.membershipValidUntil))}</b>
          ) : (
            <b>{me.hasPass ? t.membershipCard.active : t.membershipCard.none}</b>
          )}
        </div>

        {/* OMIX loyalty: weekly streak + progress to the next tier */}
        <div className="mc-loyalty">
          {streak > 0 && (
            <div className="mc-streak" title={t.loyalty.streak(streak)}>
              {Array.from({ length: Math.min(streak, 8) }).map((_, i) => (
                <span key={i} aria-hidden="true">🔥</span>
              ))}
              <small>{t.loyalty.streak(streak)}</small>
            </div>
          )}
          {!isAdmin && !me.loyaltyOverride && loyalty.next && (
            <div className="mc-progress-wrap">
              <div className="mc-progress"><span style={{ width: `${loyalty.progress * 100}%` }} /></div>
              <small className="mc-progress-label">{t.loyalty.toNext(loyalty.toNext, loyalty.next.name)}</small>
            </div>
          )}
        </div>
      </div>

      {/* next class */}
      {me.role === "member" && (() => {
        const now = Date.now();
        const next = data.bookings
          .filter((b) => b.userId === me.id && b.state === "confirmed")
          .map((b) => data.sessions.find((se) => se.id === b.sessionId))
          .filter((se): se is ClassSession => !!se && sessionStartDate(se).getTime() > now)
          .sort((a, b) => sessionStartDate(a).getTime() - sessionStartDate(b).getTime())[0];
        return (
          <div className="next-class">
            <span className="nc-label">{t.nextClass}</span>
            {next ? (
              <div className="nc-body">
                <span className="nc-emoji" aria-hidden="true">{CATEGORY_META[classTypeOf(next, data).category].emoji}</span>
                <div className="nc-info">
                  <b>{classTypeOf(next, data).name}</b>
                  <span>{fmtDayHeading(fromKey(next.date))} · {fmtTime(next.startMin)}</span>
                  <small>{next.room}</small>
                </div>
              </div>
            ) : (
              <a className="nc-empty" href="#schedule">{t.noNextClass}</a>
            )}
          </div>
        );
      })()}

      {/* stats */}
      <h2 className="h2" style={{ marginBottom: 10 }}>{t.myStats}</h2>
      <div className="profile-grid" style={{ marginBottom: 22 }}>
        <Stat icon={<IcCheck width={15} height={15} />} k={t.attendedCount} v={String(stats.attended)} tone="charcoal" />
        <Stat icon={<IcCalendar width={15} height={15} />} k={t.upcomingCount} v={String(stats.upcoming)} tone="olive" />
        <Stat icon={<IcBookmark width={15} height={15} />} k={t.totalCount} v={String(stats.total)} tone="gold" />
        <Stat
          icon={<IcSpark width={15} height={15} />}
          k={t.favoriteCat}
          v={fav ? `${CATEGORY_META[fav].emoji} ${CATEGORY_META[fav].label}` : t.notYet}
          tone="cream"
        />
      </div>

      {/* my payments */}
      {me.role === "member" && (() => {
        const mine = data.payments.filter((p) => p.userId === me.id).sort((a, b) => b.date - a.date);
        return (
          <div className="card" style={{ padding: "6px 18px 14px", marginBottom: 22 }}>
            <h2 className="h2" style={{ margin: "14px 0 8px" }}>{t.myPayments}</h2>
            {mine.length === 0 ? (
              <p className="muted">{t.noPayments}</p>
            ) : (
              <ul className="member-details">
                {mine.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <span>{new Date(p.date).toLocaleDateString("he-IL")} · {p.serviceName}</span>
                    <b dir="ltr">₪{p.amount}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      {/* my details */}
      {me.role === "member" && (
        <div className="card" style={{ padding: "6px 18px 14px", marginBottom: 22 }}>
          <h2 className="h2" style={{ margin: "14px 0 8px" }}>{t.myDetails}</h2>
          <ul className="member-details">
            {me.email && <li><span>{t.emailLabel}</span><b dir="ltr">{me.email}</b></li>}
            <li><span>{t.phone}</span><b dir="ltr">{me.phone || "-"}</b></li>
            {me.age ? <li><span>{t.health.ageLabel}</span><b>{me.age}</b></li> : null}
            {me.address && <li><span>{t.health.addressLabel}</span><b>{me.address}</b></li>}
            {me.approvedAt ? <li><span>{t.memberSince}</span><b>{new Date(me.approvedAt).toLocaleDateString("he-IL")}</b></li> : null}
          </ul>
        </div>
      )}

      {/* notification channels */}
      <div className="card" style={{ padding: "6px 18px 14px" }}>
        <h2 className="h2" style={{ margin: "14px 0 8px" }}>{t.notifyChannels}</h2>
        <PrefRow
          label={t.notifyPush}
          on={prefs.push}
          onToggle={() => setPref({ push: !prefs.push })}
        />
        <PrefRow
          label={t.notifyWhatsapp}
          on={prefs.whatsapp}
          onToggle={() => setPref({ whatsapp: !prefs.whatsapp })}
        />
        <PrefRow
          label={t.notifyEmail}
          on={prefs.email}
          onToggle={() => setPref({ email: !prefs.email })}
        />
        <div className="pref-row">
          <div className="pr-main">
            <b>{t.reminderLead}</b>
          </div>
          <div className="seg">
            {[1, 2, 4].map((h) => (
              <button
                key={h}
                className={prefs.reminderHours === h ? "on" : ""}
                onClick={() => setPref({ reminderHours: h })}
              >
                {t.hoursBefore(h)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* proactive PWA install (Android prompt / iOS guide) */}
      <PWAInstallAction />

      {/* Personal calendar sync into the user's OWN Google calendar. Shown to
          members (their booked classes) and instructors (the classes they
          teach) — NOT to admin/manager, who run the studio calendar below and
          don't need a personal connection. */}
      {(me.role === "member" || me.role === "instructor") && (
        <div className="cal-card">
          <div className="cal-head">
            <span aria-hidden="true">🗓️</span>
            <div>
              <b>{t.calendarMine.title}</b>
              <small>{me.role === "instructor" ? t.calendarMine.subtitleCoach : t.calendarMine.subtitle}</small>
            </div>
          </div>
          <div className="cal-actions">
            <button className="btn btn-lime" onClick={connectMyCal}>
              {me.calConnected ? t.calendarMine.reconnect : t.calendarMine.connect}
            </button>
            <button className="btn btn-ghost" onClick={syncMyCal} disabled={calMineBusy}>
              {calMineBusy ? t.calendarMine.syncing : t.calendarMine.sync}
            </button>
          </div>
          <small className="cal-hint">{me.role === "instructor" ? t.calendarMine.hintCoach : t.calendarMine.hint}</small>
        </div>
      )}

      {me.role === "admin" && (
        <div className="cal-card">
          <div className="cal-head">
            <span aria-hidden="true">🗓️</span>
            <div>
              <b>{t.calendar.title}</b>
              <small>{t.calendar.subtitle}</small>
            </div>
          </div>
          <div className="cal-actions">
            <a className="btn btn-lime" href={CALENDAR_CONNECT_URL} target="_blank" rel="noreferrer">
              {t.calendar.connect}
            </a>
            <button className="btn btn-ghost" onClick={syncCal} disabled={calBusy}>
              {calBusy ? t.calendar.syncing : t.calendar.sync}
            </button>
          </div>
          <small className="cal-hint">{t.calendar.connectHint}</small>
        </div>
      )}

      {isAdmin && (
        <div className="cal-card">
          <div className="cal-head">
            <span aria-hidden="true">💳</span>
            <div>
              <b>{t.pay.adminTitle}</b>
              <small>{t.pay.adminHint}</small>
            </div>
          </div>
          <div className="field" style={{ marginTop: 4 }}>
            <label htmlFor="pl-bit">{t.pay.bit} (קישור)</label>
            <input id="pl-bit" className="input" dir="ltr" value={bit} onChange={(e) => setBit(e.target.value)} placeholder="https://www.bitpay.co.il/app/me/..." />
          </div>
          <div className="field">
            <label htmlFor="pl-pb">{t.pay.paybox} (קישור)</label>
            <input id="pl-pb" className="input" dir="ltr" value={paybox} onChange={(e) => setPaybox(e.target.value)} placeholder="https://link.payboxapp.com/..." />
          </div>
          <button className="btn btn-lime" onClick={savePay}>{t.save}</button>
        </div>
      )}

      {me.role === "admin" && (
        <button className="billing-entry" onClick={() => setBillingOpen(true)}>
          <span aria-hidden="true">🔒</span>
          {t.billing.open}
          <small>{t.billing.subtitle}</small>
        </button>
      )}

      {/* low-emphasis account actions, anchored at the very bottom */}
      <div className="profile-foot-actions">
        <button className="link-btn" onClick={onSwitchUser}>{t.switchUser}</button>
        <span aria-hidden="true">·</span>
        <button
          className="link-btn danger"
          onClick={() => { logout(); toast(t.loggedOutToast, "info"); }}
        >
          {t.signOut}
        </button>
      </div>

      <p className="muted" style={{ textAlign: "center", fontSize: ".82rem", margin: "14px 0 0" }}>
        {t.support.prompt}{" "}
        <a href={`mailto:${t.support.email}`}>{t.support.email}</a>
      </p>

      <VersionTag className="profile-version" />

      {skinOpen && (
        <Sheet title={t.avatarSkin.title} onClose={() => setSkinOpen(false)}>
          <p className="muted" style={{ margin: "0 0 12px" }}>{t.avatarSkin.hint}</p>
          <div className="skin-grid">
            <button className={`skin ${!me.avatarSkin ? "on" : ""}`} onClick={() => pickSkin("")}>
              <span className="skin-emoji skin-initials">{me.initials}</span>
              <small>{t.avatarSkin.none}</small>
            </button>
            {AVATAR_LIST.map((a) => (
              <button
                key={a.id}
                className={`skin ${me.avatarSkin === `svg:${a.id}` ? "on" : ""}`}
                onClick={() => pickSkin(`svg:${a.id}`)}
              >
                <span className="skin-emoji skin-svg"><AvatarSkin skin={`svg:${a.id}`} /></span>
                <small>{a.label}</small>
              </button>
            ))}
            {t.avatarSkins.map((s) => (
              <button
                key={s.emoji}
                className={`skin ${me.avatarSkin === s.emoji ? "on" : ""}`}
                onClick={() => pickSkin(s.emoji)}
              >
                <span className="skin-emoji">{s.emoji}</span>
                <small>{s.label}</small>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {editing && <ProfileEditor onClose={() => setEditing(false)} />}
      {billingOpen && <Billing onClose={() => setBillingOpen(false)} />}
    </div>
  );
}

function Stat({
  icon,
  k,
  v,
  tone,
}: {
  icon: React.ReactNode;
  k: string;
  v: string;
  /** Premium colour-story variant; the 4 dashboard cards run charcoal → olive
      → champagne gold → warm cream in sequence (see .stat.tone-* in app.css). */
  tone?: "charcoal" | "olive" | "gold" | "cream";
}) {
  return (
    <div className={`stat${tone ? ` tone-${tone}` : ""}`}>
      <div className="k">{icon} {k}</div>
      <div className="v" style={{ fontSize: "1.5rem" }}>{v}</div>
    </div>
  );
}

function PrefRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="pref-row">
      <div className="pr-main">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
      <button
        className={`switch ${on ? "on" : ""}`}
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
      />
    </div>
  );
}

function ProfileEditor({ onClose }: { onClose: () => void }) {
  const data = useStore((s) => s);
  const me = data.users.find((u) => u.id === data.currentUserId)!;
  const [name, setName] = useState(me.name);
  const [phone, setPhone] = useState(me.phone);

  function save() {
    const parts = name.trim().split(" ");
    const initials = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
    updateUser(me.id, { name: name.trim() || me.name, phone, initials });
    toast("הפרטים נשמרו", "ok");
    onClose();
  }

  return (
    <Sheet
      title={t.editProfile}
      onClose={onClose}
      footer={
        <button className="btn btn-lime grow" onClick={save}>
          {t.save}
        </button>
      }
    >
      <div className="field">
        <label htmlFor="pe-name">{t.fullName}</label>
        <input id="pe-name" aria-label={t.fullName} className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pe-phone">{t.phone}</label>
        <input
          id="pe-phone"
          aria-label={t.phone}
          className="input"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
