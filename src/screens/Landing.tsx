import { t } from "../lib/i18n";
import { VersionTag } from "../components/common";
import { IcBolt, IcCalendar, IcCheck, IcGrid, IcUser } from "../components/icons";

// Marketing landing page for new / unregistered visitors. Shown by <App /> in the
// logged-out state; the CTAs hand off to the sign-in picker (onEnter). Real
// registration is phone + SMS OTP (plan.md §4.1) — not built in the demo.
export function Landing({ onEnter }: { onEnter: () => void }) {
  const L = t.landing;
  const features = [
    { icon: <IcBolt width={22} height={22} />, title: L.f1Title, body: L.f1Body },
    { icon: <IcCalendar width={22} height={22} />, title: L.f2Title, body: L.f2Body },
    { icon: <IcCheck width={22} height={22} />, title: L.f3Title, body: L.f3Body },
    { icon: <IcGrid width={22} height={22} />, title: L.f4Title, body: L.f4Body },
  ];

  return (
    <div className="landing">
      <section className="landing-hero">
        <header className="landing-bar">
          <span className="brand">
            <span className="logo">
              <IcBolt width={20} height={20} style={{ color: "var(--ink-900)" }} />
            </span>
            <span>{t.appName}</span>
          </span>
          <button className="btn btn-sm btn-ghost-ink" onClick={onEnter}>
            {L.signIn}
          </button>
        </header>

        <div className="landing-hero-body">
          <span className="landing-kicker">{L.kicker}</span>
          <h1>{L.title}</h1>
          <p className="landing-sub">{L.subtitle}</p>
          <div className="landing-cta-row">
            <button className="btn btn-lime btn-lg" onClick={onEnter}>
              {L.cta}
            </button>
            <button className="btn btn-ghost-ink btn-lg" onClick={onEnter}>
              {L.secondary}
            </button>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-h2">{L.featuresTitle}</h2>
        <div className="landing-features">
          {features.map((f) => (
            <article className="landing-feature" key={f.title}>
              <span className="lf-ico">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-h2">{L.audienceTitle}</h2>
        <div className="landing-audience">
          <article className="aud-card">
            <span className="aud-ico"><IcUser width={20} height={20} /></span>
            <div>
              <h3>{L.traineeTitle}</h3>
              <p>{L.traineeBody}</p>
            </div>
          </article>
          <article className="aud-card">
            <span className="aud-ico"><IcGrid width={20} height={20} /></span>
            <div>
              <h3>{L.staffTitle}</h3>
              <p>{L.staffBody}</p>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-final">
        <h2>{L.finalTitle}</h2>
        <p>{L.finalSub}</p>
        <button className="btn btn-lime btn-lg" onClick={onEnter}>
          {L.cta}
        </button>
      </section>

      <footer className="landing-foot">
        <VersionTag />
      </footer>
    </div>
  );
}
