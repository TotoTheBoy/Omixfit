import { useState } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassCategory, NotifyPrefs } from "../lib/types";
import { memberStats, updateUser, useStore } from "../lib/store";
import { Avatar } from "../components/common";
import { Sheet } from "../components/Sheet";
import { toast } from "../components/Toast";
import { IcBolt, IcCheck, IcSpark, IcCalendar, IcBookmark } from "../components/icons";

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

  function setPref(patch: Partial<NotifyPrefs>) {
    updateUser(me.id, { prefs: { ...prefs, ...patch } });
  }

  const fav = stats.favorite as ClassCategory | null;

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
      <div className="member-card">
        <div className="mc-top">
          <span className="mc-brand">
            <span className="logo">
              <IcBolt width={16} height={16} style={{ color: "var(--ink-900)" }} />
            </span>
            {t.appName}
          </span>
          <span className={`status-pill ${me.membershipActive ? "on" : "off"}`}>
            <IcCheck width={14} height={14} />
            {t.membership} {me.membershipActive ? t.active : t.inactive}
          </span>
        </div>
        <div className="mc-name">{me.name}</div>
        <div className="mc-plan">{me.membershipPlan}</div>
        <div className="mc-foot">
          <div>
            <small>{t.phone}</small>
            <b dir="ltr">{me.phone}</b>
          </div>
          <div style={{ textAlign: "end" }}>
            <small>{t.validUntil}</small>
            <b>{me.membershipValidUntil}</b>
          </div>
          <Avatar user={me} size={48} />
        </div>
      </div>

      {/* stats */}
      <h2 className="h2" style={{ marginBottom: 10 }}>{t.myStats}</h2>
      <div className="profile-grid" style={{ marginBottom: 22 }}>
        <Stat icon={<IcCheck width={15} height={15} />} k={t.attendedCount} v={String(stats.attended)} />
        <Stat icon={<IcCalendar width={15} height={15} />} k={t.upcomingCount} v={String(stats.upcoming)} dark />
        <Stat icon={<IcBookmark width={15} height={15} />} k={t.totalCount} v={String(stats.total)} />
        <Stat
          icon={<IcSpark width={15} height={15} />}
          k={t.favoriteCat}
          v={fav ? `${CATEGORY_META[fav].emoji} ${CATEGORY_META[fav].label}` : "—"}
        />
      </div>

      {/* notifications */}
      <div className="card" style={{ padding: "6px 18px 14px" }}>
        <h2 className="h2" style={{ margin: "14px 0 4px" }}>{t.notifications}</h2>
        <p className="muted" style={{ fontSize: ".82rem", margin: "0 0 6px" }}>
          וואטסאפ הוא הערוץ המוביל בישראל — מומלץ להשאיר פעיל.
        </p>
        <PrefRow
          label={t.notifyPush}
          hint="עובד באפליקציה המותקנת למסך הבית (iOS 16.4+)"
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

      <button
        className="btn btn-ghost"
        style={{ marginTop: 20 }}
        onClick={onSwitchUser}
      >
        {t.switchUser} / {t.signOut}
      </button>

      {editing && <ProfileEditor onClose={() => setEditing(false)} />}
    </div>
  );
}

function Stat({
  icon,
  k,
  v,
  dark,
}: {
  icon: React.ReactNode;
  k: string;
  v: string;
  dark?: boolean;
}) {
  return (
    <div className={`stat ${dark ? "dark" : ""}`}>
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
