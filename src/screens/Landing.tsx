import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { VersionTag } from "../components/common";
import { OmixLogo, OmixMark } from "../components/Brand";
import { Legal } from "../components/Legal";
import { LeadForm } from "../components/LeadForm";

// Contact targets.
const WHATSAPP = "https://wa.me/972507954902";
const INSTAGRAM = "https://instagram.com/omer_lifshitz";
const EMAIL = "mailto:office@omixfit.com";

const CREDS = ["מאמנת כושר וריצה מוסמכת", "רצת מרתון פעילה", "תואר בטיפול בספורט"];

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
      { threshold: 0.14 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// Luxury, content-rich marketing landing — ivory + gold, elegant editorial
// layout, no WebGL. Reveals on scroll.
export function Landing({ onEnter }: { onEnter: () => void }) {
  const L = t.landing;
  const S = t.spine;
  const [legal, setLegal] = useState(false);
  const [lead, setLead] = useState(false);
  useReveal();

  return (
    <div className="lux">
      <header className="lux-bar">
        <OmixLogo size={32} />
        <button className="lux-link" onClick={onEnter}>{L.signIn}</button>
      </header>

      {/* ---- hero ---- */}
      <section className="lux-hero">
        <span className="lux-rule reveal" aria-hidden="true" />
        <span className="lux-eyebrow reveal">{L.kicker}</span>
        <h1 className="lux-title reveal">
          {L.title1} {L.title2} <em>{L.title3}</em>
        </h1>
        <p className="lux-lead reveal">{L.subtitle}</p>
        <div className="lux-cta reveal">
          <button className="lux-btn gold" onClick={onEnter}>{L.ctaEnter}</button>
          <button className="lux-btn ghost" onClick={() => setLead(true)}>{t.lead.cta}</button>
          <a className="lux-btn ghost" href={WHATSAPP} target="_blank" rel="noreferrer">{L.ctaContact}</a>
        </div>
        <ul className="lux-creds reveal">
          {CREDS.map((c) => (
            <li key={c}><span aria-hidden="true">✦</span> {c}</li>
          ))}
        </ul>
      </section>

      {/* ---- about (dark band) ---- */}
      <section className="lux-about">
        <div className="lux-about-inner reveal">
          <span className="lux-eyebrow gold">{L.aboutKicker}</span>
          <h2 className="lux-h2 light">{L.aboutTitle}</h2>
          <p className="lux-about-body">{L.aboutBody}</p>
        </div>
      </section>

      {/* ---- services ---- */}
      <section className="lux-sec">
        <div className="lux-head reveal">
          <span className="lux-eyebrow">{L.servicesKicker}</span>
          <h2 className="lux-h2">{L.servicesTitle}</h2>
        </div>
        <div className="lux-services">
          {L.services.map((s, i) => (
            <article className="lux-svc reveal" key={s.t} style={{ transitionDelay: `${i * 50}ms` }}>
              <span className="lux-svc-num">{String(i + 1).padStart(2, "0")}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---- why (alt band) ---- */}
      <section className="lux-sec alt">
        <div className="lux-head reveal">
          <span className="lux-eyebrow">{L.whyKicker}</span>
          <h2 className="lux-h2">{L.whyTitle}</h2>
        </div>
        <div className="lux-why">
          {L.why.map((w, i) => (
            <div className="lux-why-item reveal" key={w.t} style={{ transitionDelay: `${i * 60}ms` }}>
              <span className="lux-why-mark">{`0${i + 1}`}</span>
              <h3>{w.t}</h3>
              <p>{w.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- packages ---- */}
      <section className="lux-sec">
        <div className="lux-head reveal">
          <span className="lux-eyebrow">{S.packagesTitle}</span>
          <h2 className="lux-h2">{S.packagesTitle}</h2>
          <p className="lux-sub">{S.packagesSub}</p>
        </div>
        <div className="lux-packages">
          {S.packages.map((p, i) => (
            <div className={`lux-pack reveal ${i === 1 ? "feat" : ""}`} key={p.n} style={{ transitionDelay: `${i * 50}ms` }}>
              {i === 1 && <span className="lux-pack-tag">הכי פופולרי</span>}
              <span className="lux-pack-num">{p.n}</span>
              <span className="lux-pack-unit">{S.sessionsWord}</span>
              <span className="lux-pack-d">{p.d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- events ---- */}
      <section className="lux-sec alt">
        <div className="lux-head reveal">
          <span className="lux-eyebrow">{t.events.tab}</span>
          <h2 className="lux-h2">{t.events.publicTitle}</h2>
          <p className="lux-sub">{t.events.publicSubtitle}</p>
          <a className="lux-btn gold" href="#events" style={{ marginTop: 18 }}>{t.events.seeAll}</a>
        </div>
      </section>

      {/* ---- final + contact (dark band) ---- */}
      <section className="lux-final">
        <div className="lux-final-inner reveal">
          <OmixMark size={46} />
          <h2>{L.finalTitle}</h2>
          <p>{L.finalSub}</p>
          <button className="lux-btn gold lg" onClick={onEnter}>{L.ctaEnter}</button>
          <div className="lux-contact">
            <a href={WHATSAPP} target="_blank" rel="noreferrer">{L.whatsapp}</a>
            <a href={INSTAGRAM} target="_blank" rel="noreferrer">{L.instagram}</a>
            <a href={EMAIL}>{L.email}</a>
          </div>
        </div>
      </section>

      <footer className="lux-foot">
        <OmixLogo size={22} />
        <div className="lux-foot-links">
          <a className="lux-foot-link" href="#events">{t.events.tab}</a>
          <button className="lux-foot-link" onClick={() => setLegal(true)}>{t.legal.open}</button>
          <VersionTag />
        </div>
      </footer>

      {legal && <Legal onClose={() => setLegal(false)} />}
      {lead && <LeadForm onClose={() => setLead(false)} />}
    </div>
  );
}
