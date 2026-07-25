// ---------------------------------------------------------------------------
// Dev-only render harness. The store is firebase-free, so we can hydrate it with
// seed data and render any logged-in screen directly - no auth, no Firestore, no
// App Check. Lets the QA scripts screenshot admin/member surfaces that App Check
// otherwise blocks headlessly. Never shipped: only reachable via harness.html in
// `vite` dev.
// ---------------------------------------------------------------------------
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
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
import { Login } from "./screens/Login";
import { VerifyEmail, Onboarding } from "./screens/Onboarding";
import type { User } from "./lib/types";

const seed = buildSeed();
// demo pending registrant with a note + a flagged answer, to preview the review UI
seed.users.push({
  id: "u-pending-demo", name: "ארתור ק.", firstName: "ארתור", lastName: "ק.",
  phone: "050-7654321", email: "artur@example.com", role: "member",
  approvalStatus: "pending", emailVerified: true, membershipActive: false,
  age: 30, idNumber: "039285017", dob: "1995-01-01", address: "דיזנגוף 5, תל אביב-יפו",
  healthForm: {
    heartDisease: false, chestPainRest: false, chestPainDaily: false, chestPainExercise: false,
    dizziness: true, lostConsciousness: false, asthmaMeds: false, asthmaBreath: false,
    familyHeartDeath: false, familySuddenDeath: false, medicalSupervision: false,
    chronicIllness: false, pregnant: false, notes: "משתין במיטה", termsAccepted: true,
    signedName: "ארתור ק.", submittedAt: Date.now(),
  },
} as unknown as User);
hydrate(seed);

const q = new URLSearchParams(location.search);
const screen = q.get("screen") || "overview";
const asUser = q.get("as") || "u-admin";
setCurrentUser(asUser);

const noop = () => {};

function PdfTest() {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const user = {
      id: "u", name: "דנה כהן", firstName: "דנה", lastName: "כהן", idNumber: "039285017",
      dob: "1992-04-15", age: 33, gender: "female", phone: "050-1234567", email: "dana@example.com",
      address: "הרצל 12, תל אביב-יפו", role: "member", membershipActive: false,
    } as unknown as User;
    const form = {
      heartDisease: true, chestPainRest: false, chestPainDaily: false, chestPainExercise: true,
      dizziness: false, lostConsciousness: false, asthmaMeds: false, asthmaBreath: false,
      familyHeartDeath: false, familySuddenDeath: false, medicalSupervision: false,
      chronicIllness: false, pregnant: false, notes: "כאב גב תחתון מדי פעם, נוטלת ויטמין D",
      termsAccepted: true, signedName: "דנה כהן", submittedAt: Date.now(),
    } as never;
    import("./lib/healthPdf").then(({ buildHealthPdfDataUrl }) =>
      buildHealthPdfDataUrl(user, form).then(setSrc),
    );
  }, []);
  return src
    ? <iframe title="pdf" src={src} style={{ width: "100%", height: "100vh", border: "none" }} />
    : <div style={{ padding: 40 }}>generating…</div>;
}

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
  login: <Login onBack={noop} />,
  pdftest: <PdfTest />,
  verify: <VerifyEmail email="name@example.com" onVerified={noop} />,
  onboard: (
    <Onboarding
      user={{
        id: "u-mock", name: "דנה כהן", firstName: "דנה", lastName: "כהן",
        phone: "050-1234567", email: "dana@example.com", role: "member",
        approvalStatus: "pending", membershipActive: false,
      } as User}
    />
  ),
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
