// ---------------------------------------------------------------------------
// Dev-only render harness. The store is firebase-free, so we can hydrate it with
// seed data and render any logged-in screen directly — no auth, no Firestore, no
// App Check. Lets the QA scripts screenshot admin/member surfaces that App Check
// otherwise blocks headlessly. Never shipped: only reachable via harness.html in
// `vite` dev.
// ---------------------------------------------------------------------------
import { createRoot } from "react-dom/client";
import "./styles/fonts.css";
import "./styles/theme.css";
import "./styles/app.css";
import { hydrate, setCurrentUser } from "./lib/store";
import { buildSeed } from "./lib/seed";
import { OmixLogo } from "./components/Brand";
import { AdminOverview } from "./components/AdminOverview";
import { Finance } from "./components/Finance";
import { Manage } from "./screens/Manage";
import { Trainees } from "./screens/Trainees";
import { Zone } from "./screens/Zone";
import { Home } from "./screens/Home";
import { Profile } from "./screens/Profile";
import { Schedule } from "./screens/Schedule";
import { MyBookings } from "./screens/MyBookings";

hydrate(buildSeed());

const q = new URLSearchParams(location.search);
const screen = q.get("screen") || "overview";
const asUser = q.get("as") || "u-admin";
setCurrentUser(asUser);

const noop = () => {};

// Screens that carry their own `.page` wrapper vs. those App wraps in `.page`.
const inPage = new Set(["overview", "finance", "home"]);
const MAP: Record<string, JSX.Element> = {
  overview: <AdminOverview />,
  finance: <Finance />,
  calendar: <Manage />,
  trainees: <Trainees />,
  zone: <Zone presenting={false} onSetPresenting={noop} />,
  "zone-present": <Zone presenting onSetPresenting={noop} />,
  home: <Home onGo={noop} />,
  schedule: <Schedule />,
  bookings: <MyBookings onGoSchedule={noop} />,
  profile: <Profile onSwitchUser={noop} />,
};

const body = MAP[screen] ?? <div style={{ padding: 40 }}>unknown screen: {screen}</div>;

createRoot(document.getElementById("root")!).render(
  <div className="app">
    <header className="appbar">
      <div className="brand"><OmixLogo size={34} /></div>
      <div className="appbar-spacer" />
      <span className="chip" style={{ background: "var(--surface-2)" }}>harness · {screen}</span>
    </header>
    <main id="main" tabIndex={-1}>
      {inPage.has(screen) ? <div className="page">{body}</div> : body}
    </main>
  </div>,
);
