import { useEffect } from "react";
import { t } from "../lib/i18n";
import { VersionTag } from "../components/common";
import { OmixLogo, OmixMark } from "../components/Brand";

// Contact targets. Email pending (business address being set up).
const WHATSAPP = "https://wa.me/972507954902";
const INSTAGRAM = "https://instagram.com/omer_lifshitz";
const EMAIL = "mailto:office@omixfit.com";

// Reveal-on-scroll: fade sections up as they enter the viewport.
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// Premium, motion-light marketing landing for new visitors (logged-out state).
// Dark cinematic hero with a glowing Omix emblem; CTAs hand off to sign-in.
export function Landing({ onEnter }: { onEnter: () => void }) {
  const L = t.landing;
  useReveal();

  return (
    <div className="lp">
      {/* ---- hero ---- */}
      <section className="lp-hero">
        <span className="lp-aurora" aria-hidden="true" />
        <header className="lp-bar">
          <OmixLogo size={30} />
          <button className="lp-link" onClick={onEnter}>{L.signIn}</button>
        </header>

        <div className="lp-hero-inner">
          <div className="lp-emblem" aria-hidden="true">
            <span className="lp-ring" />
            <span className="lp-glow" />
            <OmixMark size={86} />
          </div>
          <span className="lp-kicker reveal">{L.kicker}</span>
          <h1 className="lp-title reveal">
            <span>{L.title1}</span> <span>{L.title2}</span> <span>{L.title3}</span>
          </h1>
          <p className="lp-sub reveal">{L.subtitle}</p>
          <div className="lp-cta reveal">
            <button className="btn btn-lime btn-lg" onClick={onEnter}>{L.ctaEnter}</button>
            <a className="btn btn-ghost-ink btn-lg" href="#lp-contact">{L.ctaContact}</a>
          </div>
        </div>
      </section>

      {/* ---- about ---- */}
      <section className="lp-section lp-about reveal">
        <span className="lp-eyebrow">{L.aboutKicker}</span>
        <h2 className="lp-h2">{L.aboutTitle}</h2>
        <p className="lp-lead">{L.aboutBody}</p>
      </section>

      {/* ---- services ---- */}
      <section className="lp-section">
        <div className="lp-head reveal">
          <span className="lp-eyebrow">{L.servicesKicker}</span>
          <h2 className="lp-h2">{L.servicesTitle}</h2>
        </div>
        <div className="lp-services">
          {L.services.map((s, i) => (
            <article className="lp-svc reveal" key={s.t} style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="lp-svc-num">{`0${i + 1}`}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---- why ---- */}
      <section className="lp-section">
        <div className="lp-head reveal">
          <span className="lp-eyebrow">{L.whyKicker}</span>
          <h2 className="lp-h2">{L.whyTitle}</h2>
        </div>
        <div className="lp-why">
          {L.why.map((w, i) => (
            <div className="lp-why-item reveal" key={w.t} style={{ transitionDelay: `${i * 70}ms` }}>
              <h3>{w.t}</h3>
              <p>{w.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- final + contact ---- */}
      <section className="lp-final" id="lp-contact">
        <span className="lp-aurora soft" aria-hidden="true" />
        <div className="lp-final-inner reveal">
          <OmixMark size={52} />
          <h2 className="lp-final-title">{L.finalTitle}</h2>
          <p className="lp-sub">{L.finalSub}</p>
          <div className="lp-cta">
            <button className="btn btn-lime btn-lg" onClick={onEnter}>{L.ctaEnter}</button>
          </div>
          <div className="lp-contact">
            <span className="lp-contact-h">{L.contactTitle}</span>
            <div className="lp-contact-links">
              <a className="lp-contact-link" href={WHATSAPP} target="_blank" rel="noreferrer">{L.whatsapp}</a>
              <a className="lp-contact-link" href={INSTAGRAM} target="_blank" rel="noreferrer">{L.instagram}</a>
              {EMAIL && <a className="lp-contact-link" href={EMAIL}>{L.email}</a>}
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <OmixLogo size={22} />
        <VersionTag />
      </footer>
    </div>
  );
}
