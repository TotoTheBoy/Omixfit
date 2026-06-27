import { useEffect, useState } from "react";
import { t } from "./lib/i18n";
import { logout, onAuthIdentity, useStore } from "./lib/store";
import { Schedule } from "./screens/Schedule";
import { MyBookings } from "./screens/MyBookings";
import { Manage } from "./screens/Manage";
import { Profile } from "./screens/Profile";
import { Login } from "./screens/Login";
import { UserSwitcher } from "./components/UserSwitcher";
import { Toaster } from "./components/Toast";
import { Celebration } from "./components/Celebration";
import { Avatar } from "./components/common";
import {
  IcBolt,
  IcBookmark,
  IcCalendar,
  IcChevR,
  IcGrid,
  IcUser,
} from "./components/icons";

type View = "schedule" | "bookings" | "manage" | "profile";

function readHash(): View {
  const h = location.hash.replace("#", "");
  return h === "bookings" || h === "manage" || h === "profile" ? h : "schedule";
}

export default function App() {
  const data = useStore((s) => s);
  const me = data.users.find((u) => u.id === data.currentUserId);
  const isStaff = !!me && me.role !== "member";
  const [view, setView] = useState<View>(readHash);
  const [switcher, setSwitcher] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  // Firebase Auth (code-split, loaded off the critical path) decides the
  // session. On a resolved identity, onAuthIdentity maps it to a Firestore user
  // and starts the live data listeners; the mirror then hydrates and `me`
  // resolves. `authResolved`/`signedIn` drive a loading state so we don't flash
  // the login screen while the session resolves or the cloud data streams in.
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
    if (view === "manage" && !isStaff) go("schedule");
    if (view === "bookings" && isStaff) go("schedule");
  }, [me, isStaff, view]);

  // Resolving the session, or signed in but cloud data still streaming in →
  // show a splash rather than flashing the login screen.
  if (!me) {
    if (!authResolved || signedIn) {
      return (
        <div className="app-splash" role="status" aria-label="טוען">
          <span className="app-splash-logo">
            <IcBolt width={30} height={30} style={{ color: "var(--ink-900)" }} />
          </span>
        </div>
      );
    }
    // Resolved and signed out → the login screen.
    return <Login />;
  }

  function go(v: View) {
    setView(v);
    history.replaceState(null, "", `#${v}`);
  }

  const nav: { id: View; label: string; icon: JSX.Element }[] = isStaff
    ? [
        { id: "schedule", label: t.nav.schedule, icon: <IcCalendar /> },
        { id: "manage", label: t.nav.manage, icon: <IcGrid /> },
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
          <span className="logo">
            <IcBolt width={22} height={22} style={{ color: "var(--ink-900)" }} />
          </span>
          <span>
            {t.appName}
          </span>
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
            </a>
          ))}
        </nav>

        <div className="appbar-spacer" />

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
            {n.icon}
            {n.label}
          </a>
        ))}
      </nav>

      {switcher && <UserSwitcher onClose={() => setSwitcher(false)} />}
      <Toaster />
      <Celebration />
    </div>
  );
}
