import { useMemo, useState } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import type { Role, User } from "../lib/types";
import {
  classTypeOf,
  memberStats,
  sessionStartDate,
  updateUser,
  useStore,
} from "../lib/store";
import { fmtDayHeading, fmtTime } from "../lib/date";
import { Avatar } from "./common";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";
import { IcUsers, IcCheck, IcClose } from "./icons";

// Magnifier icon (local — not in the shared set)
const IcSearch = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

const ROLE_ORDER: Record<Role, number> = { admin: 0, manager: 1, instructor: 2, member: 3 };

export function Members() {
  const data = useStore((s) => s);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<User | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...data.users]
      .filter(
        (u) =>
          !needle ||
          u.name.toLowerCase().includes(needle) ||
          u.phone.replace(/[-\s]/g, "").includes(needle.replace(/[-\s]/g, "")),
      )
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, "he"));
  }, [data.users, q]);

  return (
    <div>
      <div className="search">
        <IcSearch aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.searchMembers}
          aria-label={t.searchMembers}
          type="search"
        />
      </div>

      <p className="muted" style={{ margin: "0 0 12px", fontSize: ".85rem" }}>
        {t.allMembers(filtered.length)}
      </p>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="ico"><IcUsers width={40} height={40} style={{ opacity: 0.4 }} /></div>
          <h3>{t.noMembers}</h3>
        </div>
      ) : (
        <div className="member-list">
          {filtered.map((u) => {
            const st = memberStats(u.id, data);
            return (
              <button key={u.id} className="member-row" onClick={() => setOpen(u)}>
                <Avatar user={u} size={42} />
                <span className="mr-body">
                  <span className="mr-name">
                    {u.name}
                    <span className={`tag role-${u.role}`}>{t.roles[u.role]}</span>
                    {!u.membershipActive && <span className="tag inactive">{t.inactive}</span>}
                  </span>
                  <span className="mr-sub" dir="ltr">{u.phone}</span>
                </span>
                <span className="mr-stat">
                  <b>{st.attended}</b>
                  <small>{t.attendedShort}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {open && <MemberDetail userId={open.id} onClose={() => setOpen(null)} />}
    </div>
  );
}

function MemberDetail({ userId, onClose }: { userId: string; onClose: () => void }) {
  const data = useStore((s) => s);
  const u = data.users.find((x) => x.id === userId)!;
  const st = memberStats(u.id, data);

  const recent = useMemo(() => {
    return data.bookings
      .filter((b) => b.userId === u.id && b.state !== "cancelled")
      .map((b) => ({ b, s: data.sessions.find((x) => x.id === b.sessionId)! }))
      .filter((x) => x.s)
      .sort((a, b) => sessionStartDate(b.s).getTime() - sessionStartDate(a.s).getTime())
      .slice(0, 5);
  }, [data, u.id]);

  const roles: Role[] = ["member", "instructor", "manager", "admin"];

  const hero = (
    <div className="detail-hero" style={{ background: "radial-gradient(120% 140% at 100% 0%, #1c2430, #0b0e13 60%)" }}>
      <div className="glow" style={{ background: u.avatarColor }} />
      <button className="iconbtn" onClick={onClose} aria-label={t.close}
        style={{ position: "absolute", insetInlineEnd: 14, top: 14, background: "rgba(255,255,255,.15)", color: "#fff" }}>
        <IcClose />
      </button>
      <div className="row gap-3">
        <Avatar user={u} size={52} />
        <div>
          <h2 style={{ fontSize: "1.4rem" }}>{u.name}</h2>
          <div className="sub" dir="ltr" style={{ textAlign: "start" }}>{u.phone}</div>
        </div>
      </div>
    </div>
  );

  return (
    <Sheet
      onClose={onClose}
      hero={hero}
      footer={
        <a className="btn btn-ink grow" href={`tel:${u.phone.replace(/[-\s]/g, "")}`}>
          {t.callMember}
        </a>
      }
    >
      <div className="row gap-3 wrap">
        <MiniStat v={st.attended} k={t.attendedShort} />
        <MiniStat v={st.upcoming} k={t.upcomingShort} />
        <MiniStat v={st.total} k={t.totalCount} />
      </div>

      {/* role management (plan.md §4.1 — admin assigns roles) */}
      <div className="field">
        <label>{t.changeRole}</label>
        <div className="filterbar" style={{ margin: 0 }}>
          {roles.map((r) => (
            <button
              key={r}
              className={`filter-chip ${u.role === r ? "on" : ""}`}
              onClick={() => {
                updateUser(u.id, { role: r });
                toast(`${u.name} · ${t.roles[r]}`, "ok");
              }}
            >
              {t.roles[r]}
            </button>
          ))}
        </div>
      </div>

      {/* membership gating (Q3) */}
      <div className="pref-row" style={{ borderTop: "1px solid var(--line)", borderBottom: "none" }}>
        <div className="pr-main">
          <b>{t.membershipActiveLabel}</b>
          <small>{u.membershipPlan} · {t.validUntil} {u.membershipValidUntil}</small>
        </div>
        <button
          className={`switch ${u.membershipActive ? "on" : ""}`}
          role="switch"
          aria-checked={u.membershipActive}
          aria-label={t.membershipActiveLabel}
          onClick={() => {
            updateUser(u.id, { membershipActive: !u.membershipActive });
            toast(u.membershipActive ? t.setInactive : t.setActive, "info");
          }}
        />
      </div>

      {/* recent activity */}
      <div>
        <h3 className="h2" style={{ marginBottom: 8 }}>{t.recentActivity}</h3>
        {recent.length === 0 ? (
          <p className="muted">{t.rosterEmpty}</p>
        ) : (
          <div className="roster">
            {recent.map(({ b, s }) => {
              const type = classTypeOf(s, data);
              const meta = CATEGORY_META[type.category];
              const stateLabel =
                b.state === "attended" ? t.present
                : b.state === "no_show" ? t.noShow
                : t.upcoming;
              const stateColor =
                b.state === "attended" ? "var(--ok)"
                : b.state === "no_show" ? "var(--danger)"
                : "var(--text-3)";
              return (
                <div key={b.id} className="roster-row">
                  <span style={{ fontSize: "1.1rem" }}>{meta.emoji}</span>
                  <span className="nm">
                    {type.name}
                    <span className="mr-sub">{fmtDayHeading(sessionStartDate(s))} · {fmtTime(s.startMin)}</span>
                  </span>
                  <span className="chip" style={{ background: "transparent", color: stateColor, fontWeight: 700 }}>
                    {b.state === "attended" && <IcCheck width={14} height={14} />}
                    {stateLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function MiniStat({ v, k }: { v: number; k: string }) {
  return (
    <div className="grow" style={{
      background: "var(--surface-2)", border: "1px solid var(--line)",
      borderRadius: "var(--r-md)", padding: "12px", textAlign: "center", minWidth: 90,
    }}>
      <div style={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-.02em" }}>{v}</div>
      <div className="muted" style={{ fontSize: ".78rem", fontWeight: 600 }}>{k}</div>
    </div>
  );
}
