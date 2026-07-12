import { useEffect, useState } from "react";
import { t } from "./lib/i18n";
import { logout, onAuthIdentity, useStore } from "./lib/store";
import { Schedule } from "./screens/Schedule";
import { MyBookings } from "./screens/MyBookings";
import { Manage } from "./screens/Manage";
import { Trainees } from "./screens/Trainees";
import { Zone } from "./screens/Zone";
import { Profile } from "./screens/Profile";
import { Login } from "./screens/Login";
import { Landing } from "./screens/Landing";
import { Onboarding, VerifyEmail } from "./screens/Onboarding";
import { AdminOverview } from "./components/AdminOverview";
import { Finance } from "./components/Finance";
import { PublicEvents } from "./screens/PublicEvents";
import { LegalPage } from "./screens/LegalPage";
import { UserSwitcher } from "./components/UserSwitcher";
import { OmixLogo, OmixMark } from "./components/Brand";
import { Toaster } from "./components/Toast";
import { Celebration } from "./components/Celebration";
import { Avatar } from "./components/common";
import {
  IcBookmark,
  IcCalendar,
  IcChevR,
  IcGrid,
  IcUser,
  IcUsers,
} from "./components/icons";

const IcCoins = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" width={24} height={24} {...p}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </svg>
);

type View = "overview" | "calendar" | "trainees" | "finance" | "zone" | "schedule" | "bookings" | "profile";
const VIEWS = ["overview", "calendar", "trainees", "finance", "zone", "schedule", "bookings", "profile"];

function readHash(): View {
  const h = location.hash.replace("#", "");
  return (VIEWS.includes(h) ? h : "overview") as View;
}

export default function App() {
  const data = useStore((s) => s);
  const me = data.users.find((u) => u.id === data.currentUserId);
  const isStaff = !!me && me.role !== "member";
  const canFinance = me?.role === "admin" || me?.role === "manager";
  const pendingCount = isStaff
    ? data.users.filter((u) => u.approvalStatus === "pending").length
    : 0;
  const [view, setView] = useState<View>(readHash);
  const [publicRoute, setPublicRoute] = useState(() => location.hash.replace(/^#\/?/, "").split("/")[0]);
  const [switcher, setSwitcher] = useState(false);
  const [zonePresenting, setZonePresenting] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  // Logged-out flow: marketing landing first, then the email/password sign-in.
  const [authView, setAuthView] = useState<"landing" | "login">("landing");

  // Firebase Auth (code-split, loaded off the critical path) decides the
  // session. On a resolved identity, onAuthIdentity maps it to a Firestore user
  // and starts the live data listeners; the mirror then hydrates and `me`
  // resolves. `authResolved`/`signedIn` drive a loading state so we don't flash
  // the logged-out screens while the session resolves or the cloud data streams in.
  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    import("./lib/firebase").then(({ watchAuth }) => {
      if (cancelled) return;
      unsub = watchAuth((identity) => {
        setAuthResolved(true);
        setSignedIn(!!identity);
        setEmailVerified(!!identity?.emailVerified);
        if (identity) onAuthIdentity(identity.uid, identity.email, identity.displayName, identity.emailVerified);
        else logout();
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    const onHash = () => {
      setView(readHash());
      setPublicRoute(location.hash.replace(/^#\/?/, "").split("/")[0]);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // If a staff-only/member-only view doesn't fit the current role, fall back.
  useEffect(() => {
    if (!me) return;
    const staffViews = ["overview", "calendar", "trainees", "finance", "zone", "profile"];
    const memberViews = ["schedule", "bookings", "profile"];
    if (isStaff) {
      if (!staffViews.includes(view)) go("overview");
      else if (view === "finance" && !canFinance) go("overview");
    } else if (!memberViews.includes(view)) {
      go("schedule");
    }
  }, [me, isStaff, canFinance, view]);

  // Public retreat/event signup page — no login required, so it renders before
  // the auth gate.
  if (publicRoute === "events") return <PublicEvents />;
  // Public, path-based legal documents at real URLs (/legal, /legal/eula, …).
  // The SPA rewrite serves index.html for these paths; we read location.pathname
  // and render the matching document before the auth gate (no login required).
  const legalSlug = (() => {
    const base = import.meta.env.BASE_URL;
    const rel = location.pathname.startsWith(base)
      ? location.pathname.slice(base.length)
      : location.pathname.replace(/^\//, "");
    return rel === "legal" || rel.startsWith("legal/") ? rel.replace(/^legal\/?/, "") : null;
  })();
  if (legalSlug !== null) return <LegalPage slug={legalSlug} />;

  // Resolving the session, or signed in but cloud data still streaming in →
  // show a splash rather than flashing the logged-out screens.
  if (!me) {
    if (!authResolved || signedIn) {
      return (
        <div className="app-splash" role="status" aria-label="טוען">
          <OmixMark size={64} />
        </div>
      );
    }
    // Resolved + signed out → marketing landing first, then the sign-in form.
    return authView === "login" ? (
      <Login onBack={() => setAuthView("landing")} />
    ) : (
      <Landing onEnter={() => setAuthView("login")} />
    );
  }

  // A fresh member (pending approval) must first prove they own the email address
  // (a made-up address never receives the link, so it can't reach the app). Only
  // the "pending" flow is gated — seeded/legacy members (no approvalStatus) and
  // approved members / staff are grandfathered so we never lock anyone out.
  if (me.role === "member" && me.approvalStatus === "pending" && !emailVerified) {
    return <VerifyEmail email={me.email ?? ""} onVerified={() => setEmailVerified(true)} />;
  }

  // Only members go through approval (health form → "awaiting approval"). Staff
  // (instructor/manager/admin) are provisioned by trusted parties, so they skip
  // it. Approval flips a member into the app live via the Firestore listener.
  if (me.role === "member" && me.approvalStatus && me.approvalStatus !== "approved") {
    return <Onboarding user={me} />;
  }

  function go(v: View) {
    setView(v);
    history.replaceState(null, "", `#${v}`);
  }

  // Omix Zone presentation mode: a contained, client-safe environment. All
  // navigation is hidden so a handed-off device can't reach admin controls —
  // exiting back to admin requires the passcode (handled inside <Zone />).
  if (isStaff && zonePresenting) {
    return (
      <div className="app app-presenting">
        <main id="main" tabIndex={-1}>
          <Zone presenting onSetPresenting={setZonePresenting} />
        </main>
        <Toaster />
      </div>
    );
  }

  const nav: { id: View; label: string; icon: JSX.Element; badge?: number }[] = isStaff
    ? [
        { id: "overview", label: t.nav.overview, icon: <IcGrid /> },
        { id: "calendar", label: t.nav.calendar, icon: <IcCalendar /> },
        { id: "trainees", label: t.nav.trainees, icon: <IcUsers />, badge: pendingCount },
        ...(canFinance ? [{ id: "finance" as View, label: t.nav.financeReports, icon: <IcCoins /> }] : []),
        { id: "zone", label: t.nav.zone, icon: <span aria-hidden="true">⚡</span> },
      ]
    : [
        { id: "schedule", label: t.nav.calendarShort, icon: <IcCalendar /> },
        { id: "bookings", label: t.nav.myBookings, icon: <IcBookmark /> },
        { id: "profile", label: t.nav.profile, icon: <IcUser /> },
      ];

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        דלג לתוכן הראשי
      </a>
      <header className="appbar">
        <div className="brand">
          <OmixLogo size={34} />
        </div>

        <nav className="appbar-nav" aria-label="ניווט ראשי">
          {nav.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className={view === n.id ? "active" : ""}
              aria-current={view === n.id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go(n.id);
              }}
            >
              {n.icon}
              {n.label}
              {n.badge ? <span className="nav-badge">{n.badge}</span> : null}
            </a>
          ))}
        </nav>

        <div className="appbar-spacer" />

        <button className="userswitch" onClick={() => go("profile")} aria-label={t.nav.profile}>
          <span className="who">
            <span>{[me.firstName, me.lastName].filter(Boolean).join(" ") || me.name}</span>
            <small>{isStaff ? t.nav.studioMgmt : t.roles[me.role]}</small>
          </span>
          <Avatar user={me} size={32} tone="#3b4436" />
          <IcChevR width={16} height={16} style={{ opacity: 0.6 }} />
        </button>
      </header>

      <main id="main" tabIndex={-1}>
        {view === "overview" && isStaff && (
          <div className="page">
            <AdminOverview />
          </div>
        )}
        {view === "calendar" && isStaff && <Manage />}
        {view === "trainees" && isStaff && <Trainees />}
        {view === "finance" && canFinance && (
          <div className="page">
            <Finance />
          </div>
        )}
        {view === "zone" && isStaff && <Zone presenting={false} onSetPresenting={setZonePresenting} />}
        {view === "schedule" && <Schedule />}
        {view === "bookings" && !isStaff && <MyBookings onGoSchedule={() => go("schedule")} />}
        {view === "profile" && <Profile onSwitchUser={() => setSwitcher(true)} />}
      </main>

      <nav className="tabbar" aria-label="ניווט תחתון">
        {nav.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            className={view === n.id ? "active" : ""}
            aria-current={view === n.id ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              go(n.id);
            }}
          >
            <span className="tab-ico">
              {n.icon}
              {n.badge ? <span className="nav-badge">{n.badge}</span> : null}
            </span>
            <span className="tab-label">{n.label}</span>
          </a>
        ))}
      </nav>

      {switcher && <UserSwitcher onClose={() => setSwitcher(false)} />}
      <Toaster />
      <Celebration />
    </div>
  );
}
