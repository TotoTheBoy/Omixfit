import { useEffect, useState } from "react";
import { t } from "./lib/i18n";
import { logout, onAuthIdentity, useStore } from "./lib/store";
import { Schedule } from "./screens/Schedule";
import { MyBookings } from "./screens/MyBookings";
import { Manage } from "./screens/Manage";
import { Profile } from "./screens/Profile";
import { Login } from "./screens/Login";
import { Landing } from "./screens/Landing";
import { Onboarding } from "./screens/Onboarding";
import { Members } from "./components/Members";
import { Finance } from "./components/Finance";
import { UserSwitcher } from "./components/UserSwitcher";
import { OmixLogo, OmixMark, IsraelClock } from "./components/Brand";
import { IntervalTimer } from "./components/IntervalTimer";
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

type View = "schedule" | "bookings" | "manage" | "clients" | "finance" | "profile";
const VIEWS = ["bookings", "manage", "clients", "finance", "profile"];

function readHash(): View {
  const h = location.hash.replace("#", "");
  return (VIEWS.includes(h) ? h : "schedule") as View;
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
  const [switcher, setSwitcher] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
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
        if (identity) onAuthIdentity(identity.uid, identity.email, identity.displayName);
        else logout();
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    const onHash = () => setView(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // If a staff-only/member-only view doesn't fit the current role, fall back.
  useEffect(() => {
    if (!me) return;
    if ((view === "manage" || view === "clients") && !isStaff) go("schedule");
    if (view === "finance" && !canFinance) go("schedule");
    if (view === "bookings" && isStaff) go("schedule");
  }, [me, isStaff, canFinance, view]);

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

  const nav: { id: View; label: string; icon: JSX.Element; badge?: number }[] = isStaff
    ? [
        { id: "schedule", label: t.nav.schedule, icon: <IcCalendar /> },
        { id: "manage", label: t.nav.manage, icon: <IcGrid /> },
        { id: "clients", label: t.nav.members, icon: <IcUsers />, badge: pendingCount },
        ...(canFinance
          ? [{ id: "finance" as View, label: t.finance.tab, icon: <IcCoins /> }]
          : []),
        { id: "profile", label: t.nav.profile, icon: <IcUser /> },
      ]
    : [
        { id: "schedule", label: t.nav.schedule, icon: <IcCalendar /> },
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

        <IsraelClock />

        {isStaff && (
          <button
            className="timer-launch"
            onClick={() => setTimerOpen(true)}
            aria-label={t.timer.launch}
          >
            <span aria-hidden="true">⏱</span>
            <span className="tl-label">{t.timer.launch}</span>
          </button>
        )}

        <button className="userswitch" onClick={() => setSwitcher(true)}>
          <span className="who">
            <span>{me.name}</span>
            <small>{t.roles[me.role]}</small>
          </span>
          <Avatar user={me} size={32} />
          <IcChevR width={16} height={16} style={{ opacity: 0.6 }} />
        </button>
      </header>

      <main id="main" tabIndex={-1}>
        {view === "schedule" && <Schedule />}
        {view === "bookings" && <MyBookings onGoSchedule={() => go("schedule")} />}
        {view === "manage" && <Manage />}
        {view === "clients" && isStaff && (
          <div className="page">
            <div className="page-head">
              <div>
                <h1 className="h1">{t.membersTitle}</h1>
                <div className="sub">{data.locations[0]?.name}</div>
              </div>
            </div>
            <Members />
          </div>
        )}
        {view === "finance" && canFinance && (
          <div className="page">
            <Finance />
          </div>
        )}
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
            {n.label}
          </a>
        ))}
      </nav>

      {timerOpen && <IntervalTimer onClose={() => setTimerOpen(false)} />}
      {switcher && <UserSwitcher onClose={() => setSwitcher(false)} />}
      <Toaster />
      <Celebration />
    </div>
  );
}
