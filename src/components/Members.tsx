import { useMemo, useState } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import type { Role, User } from "../lib/types";
import {
  classTypeOf,
  hasMedicalFlag,
  deleteLead,
  deleteMember,
  memberStats,
  sessionStartDate,
  sendVerificationLink,
  setApproval,
  setLeadHandled,
  updateUser,
  setStaffClaim,
  useStore,
} from "../lib/store";
import { clientActivityLight, isNewClient, trialDaysLeft } from "../lib/engine";
import { HEALTH_GROUPS } from "../lib/health";
import { fmtDayHeading, fmtTime } from "../lib/date";
import { Avatar } from "./common";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";
import { confirm } from "./Confirm";
import { IcUsers, IcCheck, IcClose } from "./icons";

// Magnifier icon (local - not in the shared set)
const IcSearch = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

const ROLE_ORDER: Record<Role, number> = { admin: 0, manager: 1, instructor: 2, member: 3 };

// wa.me link - strip formatting, local 0 → Israel country code.
const waLink = (phone: string) => `https://wa.me/${(phone || "").replace(/\D/g, "").replace(/^0/, "972")}`;

export function Members() {
  const data = useStore((s) => s);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<User | null>(null);

  const pending = useMemo(
    () => data.users.filter((u) => u.approvalStatus === "pending"),
    [data.users],
  );

  const leads = useMemo(
    () => [...data.leads].sort((a, b) => Number(!!a.handled) - Number(!!b.handled) || b.createdAt - a.createdAt),
    [data.leads],
  );

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
      {pending.length > 0 && (
        <div className="approvals-box">
          <div className="approvals-head">
            <span className="approvals-dot" aria-hidden="true" />
            <b>{t.approvals.title}</b>
            <span className="approvals-count">{t.approvals.pendingCount(pending.length)}</span>
          </div>
          <div className="member-list">
            {pending.map((u) => (
              <button key={u.id} className="member-row" onClick={() => setOpen(u)}>
                <Avatar user={u} size={40} />
                <span className="mr-body">
                  <span className="mr-name">
                    {u.memberNo != null && <span className="member-no">#{u.memberNo}</span>}
                    {u.name}
                    {hasMedicalFlag(u) && <span className="tag flag">{t.approvals.healthFlag}</span>}
                  </span>
                  <span className="mr-sub" dir="ltr">{u.email || u.phone}</span>
                </span>
                <span className="tag pending">{t.approvals.statusPending}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {leads.length > 0 && (
        <div className="approvals-box">
          <div className="approvals-head">
            <span className="approvals-dot" aria-hidden="true" />
            <b>{t.lead.adminTitle}</b>
            <span className="approvals-count">{leads.filter((l) => !l.handled).length}</span>
          </div>
          <div className="member-list">
            {leads.map((l) => (
              <div key={l.id} className="member-row" style={{ cursor: "default", opacity: l.handled ? 0.55 : 1 }}>
                <span className="mr-body">
                  <span className="mr-name">
                    {l.name}
                    {l.handled && <span className="tag role-manager">{t.lead.handled}</span>}
                  </span>
                  <span className="mr-sub" dir="ltr">{l.phone}{l.email ? ` · ${l.email}` : ""}</span>
                  {l.city && <span className="mr-sub">{l.city}</span>}
                  {l.note && <span className="mr-sub">{l.note}</span>}
                </span>
                <span className="row gap-2">
                  <a className="btn btn-sm btn-lime" href={`https://wa.me/${l.phone.replace(/\D/g, "").replace(/^0/, "972")}`} target="_blank" rel="noreferrer" aria-label={t.lead.whatsapp}>💬</a>
                  <button className="btn btn-sm btn-ghost" onClick={() => setLeadHandled(l.id, !l.handled)} aria-label={t.lead.toggleHandled}>{l.handled ? "↩︎" : "✓"}</button>
                  <button className="btn btn-sm btn-danger" onClick={async () => { if (await confirm({ title: t.lead.delete, body: l.name ? `למחוק את הליד "${l.name}"?` : undefined, danger: true, confirmLabel: t.remove })) deleteLead(l.id); }} aria-label={t.lead.delete}>🗑</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      <div className="lights-legend">
        <span><i className="light light-green" /> {t.lights.green}</span>
        <span><i className="light light-orange" /> {t.lights.orange}</span>
        <span><i className="light light-red" /> {t.lights.red}</span>
      </div>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: ".85rem" }}>
        {t.allMembers(filtered.length)}
      </p>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="ico"><IcUsers width={40} height={40} style={{ opacity: 0.4 }} /></div>
          <h2>{t.noMembers}</h2>
        </div>
      ) : (
        <div className="member-list">
          {filtered.map((u) => {
            const st = memberStats(u.id, data);
            return (
              <button key={u.id} className="member-row" onClick={() => setOpen(u)}>
                {u.role === "member" && (
                  <span
                    className={`light light-${clientActivityLight(u.id, data)}`}
                    title={t.lights.title}
                    aria-label={t.lights[clientActivityLight(u.id, data)]}
                  />
                )}
                <Avatar user={u} size={42} />
                <span className="mr-body">
                  <span className="mr-name">
                    {u.memberNo != null && <span className="member-no">#{u.memberNo}</span>}
                    {u.name}
                    <span className={`tag role-${u.role}`}>{t.roles[u.role]}</span>
                    {isNewClient(u) && <span className="tag tag-new">{t.approvals.newClient}</span>}
                    {u.trainerNotes && <span className="tag inactive" title={u.trainerNotes}>🩺 {t.injury.hasNotes}</span>}
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

      {open && data.users.some((x) => x.id === open.id) && (
        <MemberDetail userId={open.id} onClose={() => setOpen(null)} />
      )}
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

  // Admin is intentionally NOT assignable from the app (console-only).
  const roles: Role[] = ["member", "instructor", "manager"];
  const isAdmin = u.role === "admin";
  const hf = u.healthForm;
  const [notes, setNotes] = useState(u.trainerNotes ?? "");
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const me = data.users.find((x) => x.id === data.currentUserId);
  const canManage = me?.role === "admin" || me?.role === "manager";

  async function removeMember() {
    setDeleting(true);
    try {
      await deleteMember(u.id);
      toast(t.approvals.deletedToast(u.name), "info");
      onClose();
    } catch {
      toast(t.approvals.deleteErr, "err");
      setDeleting(false);
    }
  }

  // Permanent-delete danger zone (admin/manager only; never an admin target).
  // Shown on both the pending-review and full member cards - also handy for tests.
  const deleteZone = canManage && !isAdmin ? (
    <div className="danger-zone">
      {confirmDel ? (
        <>
          <p className="dz-warn">{t.approvals.deleteConfirm(u.name)}</p>
          <div className="row gap-2">
            <button className="btn btn-danger grow" onClick={removeMember} disabled={deleting}>
              {deleting ? t.approvals.deleting : t.approvals.deleteYes}
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(false)} disabled={deleting}>
              {t.approvals.deleteCancel}
            </button>
          </div>
        </>
      ) : (
        <button className="btn btn-danger btn-block" onClick={() => setConfirmDel(true)}>
          🗑 {t.approvals.deleteMember}
        </button>
      )}
    </div>
  ) : null;

  async function decide(status: "approved" | "rejected") {
    try {
      await setApproval(u.id, status);
    } catch {
      toast("העדכון נכשל - נסו שוב", "err");
      return;
    }
    if (status === "approved") {
      // setApproval now sends the "you're approved" e-mail automatically (server-side).
      toast(t.approvals.approvedToast(u.name), "ok");
    } else {
      toast(t.approvals.rejectedToast(u.name), "info");
    }
    onClose();
  }

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

  // Pending registrant → a stripped-down REVIEW card: just what Omer needs to
  // approve/decline (she already knows her clients). No stats/role/activity.
  if (u.approvalStatus === "pending") {
    const step1 = !!u.emailVerified; // account authentication (MFA)
    const step2 = !!(u.name && u.age && u.address); // profile completion
    const step3 = !!hf; // signed health declaration
    const step4 = !!hf?.termsAccepted; // studio terms
    const canApprove = step1 && step3 && step4; // steps 1, 3, 4 gate approval
    const missing = [
      !step1 && t.approvals.step1,
      !step3 && t.approvals.step3,
      !step4 && t.approvals.step4,
    ].filter(Boolean) as string[];
    async function resendVerify() {
      try {
        await sendVerificationLink(u.id);
        toast(t.approvals.resendSent, "ok");
      } catch {
        toast(t.approvals.resendErr, "err");
      }
    }
    return (
      <Sheet
        onClose={onClose}
        hero={hero}
        footer={
          <div className="row gap-2" style={{ width: "100%" }}>
            <button
              className="btn btn-lime grow"
              disabled={!canApprove}
              title={canApprove ? undefined : t.approvals.approveBlocked}
              onClick={() => decide("approved")}
            >
              {t.approvals.approve}
            </button>
            <button className="btn btn-danger" onClick={() => decide("rejected")}>
              {t.approvals.reject}
            </button>
          </div>
        }
      >
        <span className="tag pending" style={{ marginBottom: 12, display: "inline-block" }}>
          {t.approvals.statusPending}
        </span>

        {/* At-a-glance: exactly what's still missing before Omer can approve. */}
        <div className={`stage-summary ${canApprove ? "ready" : "waiting"}`} role="status">
          {canApprove ? t.approvals.readyToApprove : t.approvals.missingForApproval(missing.join(" · "))}
        </div>

        <HealthReview u={u} />

        <ul className="member-details">
          <li><span>{t.approvals.whereFrom}</span><b>{u.address || "-"}</b></li>
          <li><span>{t.phone}</span><b dir="ltr">{u.phone || "-"}</b></li>
          <li><span>{t.emailLabel}</span><b dir="ltr">{u.email || "-"}</b></li>
          {u.age ? <li><span>{t.health.ageLabel}</span><b>{u.age}</b></li> : null}
        </ul>

        <div className="lead-stepper">
          <StepRow ok={step1} n={1} title={t.approvals.step1}
            warn={!step1 ? t.approvals.step1Warn : undefined}
            action={!step1 ? { label: t.approvals.resendVerify, onClick: resendVerify } : undefined} />
          <StepRow ok={step2} n={2} title={t.approvals.step2}
            warn={!step2 ? t.approvals.step2Warn : undefined} />
          <StepRow ok={step3} n={3} title={t.approvals.step3}
            sub={hf?.signedName ? t.approvals.signedBy(hf.signedName) : t.approvals.noHealthForm} />
          <StepRow ok={step4} n={4} title={t.approvals.step4} />
        </div>

        {!canApprove && (
          <p className="muted" style={{ marginTop: 10, fontSize: ".82rem" }}>{t.approvals.approveBlocked}</p>
        )}
        {deleteZone}
      </Sheet>
    );
  }

  return (
    <Sheet
      onClose={onClose}
      hero={hero}
      footer={
        <>
          <a className="btn btn-ink" href={`tel:${u.phone.replace(/[-\s]/g, "")}`}>
            {t.callMember}
          </a>
          <a className="btn btn-lime grow" href={waLink(u.phone)} target="_blank" rel="noreferrer">
            💬 {t.whatsappMember}
          </a>
        </>
      }
    >
      <div className="row gap-3 wrap">
        <MiniStat v={st.attended} k={t.attendedShort} />
        <MiniStat v={st.upcoming} k={t.upcomingShort} />
        <MiniStat v={st.total} k={t.totalCount} />
      </div>

      <HealthReview u={u} />

      {/* full registration / contact details */}
      <ul className="member-details">
        {u.email && <li><span>{t.emailLabel}</span><b dir="ltr">{u.email}</b></li>}
        <li><span>{t.phone}</span><b dir="ltr">{u.phone || "-"}</b></li>
        {u.gender && <li><span>{t.health.genderLabel}</span><b>{t.health.genders[u.gender]}</b></li>}
        {u.age ? <li><span>{t.health.ageLabel}</span><b>{u.age}</b></li> : null}
        {u.address && <li><span>{t.health.addressLabel}</span><b>{u.address}</b></li>}
        {u.role === "member" && (
          <li>
            <span>{t.lights.title}</span>
            <b><i className={`light light-${clientActivityLight(u.id, data)}`} /> {t.lights[clientActivityLight(u.id, data)]}</b>
          </li>
        )}
        {u.role === "member" && (
          <li>
            <span>{t.approvals.hasPassLabel}</span>
            <b>
              {u.hasPass
                ? t.approvals.hasPassYes
                : (() => {
                    const d = trialDaysLeft(u);
                    return d === null ? "-" : d > 0 ? t.approvals.trialLeft(d) : t.approvals.trialOver;
                  })()}
            </b>
          </li>
        )}
        <li>
          <span>{t.approvals.lastLoginLabel}</span>
          <b>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("he-IL") : t.approvals.neverLoggedIn}</b>
        </li>
        {u.role === "member" && (
          <li>
            <span>{t.favoriteCat}</span>
            <b>
              {st.favorite
                ? `${CATEGORY_META[st.favorite as keyof typeof CATEGORY_META].emoji} ${CATEGORY_META[st.favorite as keyof typeof CATEGORY_META].label}`
                : t.notYet}
            </b>
          </li>
        )}
      </ul>

      {/* #8 live transaction records for this member - derived from the payments
          collection, read-only (no manual override of these metrics). */}
      {u.role === "member" && (() => {
        const txns = data.payments
          .filter((p) => p.userId === u.id)
          .sort((a, b) => b.date - a.date);
        return (
          <div style={{ marginBottom: 4 }}>
            <div className="row gap-2" style={{ marginBottom: 8 }}>
              <h3 className="h2">{t.memberTxns}</h3>
              <span className="chip count-chip">{txns.length}</span>
            </div>
            {txns.length === 0 ? (
              <p className="muted">{t.memberTxnsNone}</p>
            ) : (
              <ul className="member-details">
                {txns.slice(0, 8).map((p) => (
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

      {isNewClient(u) && (
        <div style={{ padding: "8px 14px", borderRadius: 12, margin: "0 0 4px", fontWeight: 700, background: "#e7efff", color: "#1550a8" }}>
          ⭐ {t.approvals.newClient}
        </div>
      )}

      {isAdmin ? (
        <p className="admin-locked" role="note">🔒 {t.approvals.adminLocked}</p>
      ) : (
        <>
          {/* role management (plan.md §4.1 - staff assigns roles; not admin) */}
          <div className="field">
            <label>{t.changeRole}</label>
            <div className="filterbar" style={{ margin: 0 }}>
              {roles.map((r) => (
                <button
                  key={r}
                  className={`filter-chip ${u.role === r ? "on" : ""}`}
                  onClick={async () => {
                    try {
                      await updateUser(u.id, { role: r });
                      // Keep the staff custom claim in sync so security rules let
                      // a promoted instructor/manager actually manage - and revoke
                      // it on demotion to member.
                      await setStaffClaim(u.id, r !== "member");
                      toast(`${u.name} · ${t.roles[r]}`, "ok");
                    } catch {
                      toast("שינוי התפקיד נכשל - נסו שוב", "err");
                    }
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

          {/* trial → pass: Omer records a punch-card purchase (stops the 7-day
              auto-disconnect and clears the trial clock) */}
          {u.role === "member" && !u.hasPass && (
            <button
              className="btn btn-lime"
              style={{ marginTop: 10 }}
              onClick={() => {
                updateUser(u.id, { hasPass: true });
                toast(t.approvals.passMarkedToast(u.name), "ok");
              }}
            >
              {t.approvals.markPass}
            </button>
          )}

          {/* sports-therapist injury notes + exercise adaptations */}
          {u.role === "member" && (
            <div className="field" style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <label>🩺 {t.injury.title}</label>
              <p className="muted" style={{ fontSize: ".8rem", margin: "0 0 8px" }}>{t.injury.hint}</p>
              <div className="filterbar" style={{ margin: "0 0 8px", flexWrap: "wrap", gap: 6 }}>
                {t.injury.items.map((it) => (
                  <button
                    key={it.label}
                    className="filter-chip"
                    onClick={() => setNotes((n) => (n.trim() ? n.trimEnd() + "\n" : "") + it.text)}
                  >
                    + {it.label}
                  </button>
                ))}
              </div>
              <textarea
                className="input"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.injury.placeholder}
              />
              <button
                className="btn btn-lime"
                style={{ marginTop: 8 }}
                onClick={() => {
                  updateUser(u.id, { trainerNotes: notes.trim() });
                  toast(t.injury.saved, "ok");
                }}
              >
                {t.injury.save}
              </button>
            </div>
          )}

          {/* enrol into the monthly 1-on-1 coaching tier (surfaces in the
              Coaching dashboard) */}
          {u.role === "member" && (
            <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <div className="pref-row" style={{ borderTop: "none", borderBottom: "none", padding: 0 }}>
                <div className="pr-main">
                  <b>🎯 {t.coaching.enroll}</b>
                  <small>{t.coaching.enrollHint}</small>
                </div>
                <button
                  className={`switch ${u.coaching?.active ? "on" : ""}`}
                  role="switch"
                  aria-checked={!!u.coaching?.active}
                  aria-label={t.coaching.enroll}
                  onClick={() => {
                    const active = !u.coaching?.active;
                    updateUser(u.id, { coaching: { ...(u.coaching ?? {}), active, startedAt: u.coaching?.startedAt ?? Date.now() } });
                    toast(active ? t.coaching.enrolled : t.coaching.unenrolled, "info");
                  }}
                />
              </div>
              {u.coaching?.active && (
                <textarea
                  className="input"
                  rows={2}
                  style={{ marginTop: 8 }}
                  defaultValue={u.coaching?.goals ?? ""}
                  placeholder={t.coaching.goalsPlaceholder}
                  onBlur={(e) => updateUser(u.id, { coaching: { ...(u.coaching ?? { active: true }), goals: e.target.value.trim() } })}
                />
              )}
            </div>
          )}
        </>
      )}

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

      {deleteZone}
    </Sheet>
  );
}

/** Prominent health review for a member: the trainee's own notes (highlighted so
 *  Omer sees them at a glance), the flagged medical answers, and a one-tap view of
 *  the health-declaration PDF they filled. */
function HealthReview({ u }: { u: User }) {
  const hf = u.healthForm;
  const [busy, setBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // No declaration yet → say so clearly (don't show a dead "view PDF" button).
  if (!hf) {
    return (
      <div className="health-review">
        <div className="health-missing" role="note">📋 {t.approvals.noHealthFormYet}</div>
      </div>
    );
  }
  const note = hf.notes?.trim();
  const flagged = HEALTH_GROUPS.flatMap((g) => g.items)
    .filter((it) => (hf as unknown as Record<string, boolean>)[it.key] === true)
    .map((it) => it.label);

  async function viewPdf() {
    setBusy(true);
    try {
      // Render → blob URL → show in an in-app modal. (window.open after an await
      // is blocked by iOS Safari's popup blocker, so the old button did nothing.)
      const { buildHealthPdfDataUrl } = await import("../lib/healthPdf");
      const dataUrl = await buildHealthPdfDataUrl(u, hf!);
      const blob = await (await fetch(dataUrl)).blob();
      setPdfUrl(URL.createObjectURL(blob));
    } catch {
      toast(t.approvals.pdfErr, "err");
    } finally {
      setBusy(false);
    }
  }
  function closePdf() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
  }

  return (
    <div className="health-review">
      {note && (
        <div className="health-note-alert" role="note">
          <span className="hna-ico" aria-hidden="true">📝</span>
          <div className="hna-body">
            <b>{t.approvals.trainerNote}</b>
            <p>{note}</p>
          </div>
        </div>
      )}
      {flagged.length > 0 && (
        <div className="health-flag-list">
          <b>🩺 {t.approvals.medicalFlagged(flagged.length)}</b>
          <span>{flagged.join(" · ")}</span>
        </div>
      )}
      <button className="btn btn-ghost btn-block" onClick={viewPdf} disabled={busy} style={{ marginTop: 10 }}>
        📄 {busy ? t.approvals.pdfLoading : t.approvals.viewPdf}
      </button>

      {pdfUrl && (
        <div className="pdf-viewer" role="dialog" aria-label={t.approvals.healthPdfTitle}>
          <header className="pdf-viewer-top">
            <strong>{t.approvals.healthPdfTitle}</strong>
            <span className="row gap-2">
              {/* Direct tap → opens on iOS too (where the inline iframe may not render). */}
              <a className="btn btn-sm btn-lime" href={pdfUrl} target="_blank" rel="noreferrer">{t.approvals.pdfOpen}</a>
              <button className="iconbtn" onClick={closePdf} aria-label={t.close}><IcClose /></button>
            </span>
          </header>
          <iframe title={t.approvals.healthPdfTitle} src={pdfUrl} className="pdf-viewer-frame" />
        </div>
      )}
    </div>
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

function StepRow({
  ok, n, title, warn, sub, action,
}: {
  ok: boolean;
  n: number;
  title: string;
  warn?: string;
  sub?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={`lead-step ${ok ? "ok" : "todo"}`}>
      <span className="lead-step-dot" aria-hidden="true">{ok ? "✓" : n}</span>
      <div className="lead-step-body">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
        {warn && <small className="lead-step-warn">{warn}</small>}
        {action && (
          <button type="button" className="btn btn-ink btn-sm" style={{ marginTop: 6 }} onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
