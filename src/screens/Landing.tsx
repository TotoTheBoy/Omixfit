import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { VersionTag } from "../components/common";
import { OmixLogo, OmixMark } from "../components/Brand";
import { Legal } from "../components/Legal";
import { LeadForm } from "../components/LeadForm";
import { fetchPublishedEvents } from "../lib/store";
import type { SpecialEvent } from "../lib/types";

// Contact targets.
const WHATSAPP = "https://wa.me/972507954902";
const INSTAGRAM = "https://instagram.com/omer_lifshitz";
const EMAIL = "mailto:office@omixfit.com";

const CREDS = [
  "מאמנת כושר מוסמכת",
  "לימודי ספורטתרפיה (B.Sc) · הקריה האקדמית אונו",
  "מניעת פציעות ושיקום ספורטיבי",
];

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
  const [certs, setCerts] = useState(false);
  // Live events slider — reads the same published events as the public page, so
  // newly created/published events propagate here automatically (#12c).
  const [events, setEvents] = useState<SpecialEvent[] | null>(null);
  useEffect(() => {
    fetchPublishedEvents().then(setEvents).catch(() => setEvents([]));
  }, []);
  useReveal();

  return (
    <div className="lux">
      <header className="lux-bar">
        <OmixLogo size={56} className="lux-logo-lg" />
        <button className="lux-link" onClick={onEnter}>{L.signIn}</button>
      </header>

      {/* ---- hero: Omer front & centre ---- */}
      <section className="lux-hero-band">
        <img className="lux-hero-watermark" src={`${import.meta.env.BASE_URL}omix-mark.png`} alt="" aria-hidden="true" />
        <div className="lux-hero-split">
        <div className="lux-hero-text">
          <span className="lux-rule reveal" aria-hidden="true" />
          <span className="lux-eyebrow reveal">{L.kicker}</span>
          <h1 className="lux-title reveal">
            {L.title1} {L.title2} <em>{L.title3}</em>
          </h1>
          <p className="lux-lead reveal">{L.subtitle}</p>
          <div className="lux-cta reveal">
            <a className="lux-btn gold" href={WHATSAPP} target="_blank" rel="noreferrer">{L.ctaContact}</a>
            <button className="lux-btn ghost" onClick={() => setLead(true)}>{t.lead.cta}</button>
            <button className="lux-btn ghost" onClick={onEnter}>{L.ctaEnter}</button>
          </div>
          <ul className="lux-creds reveal">
            {CREDS.map((c) => (
              <li key={c}><span aria-hidden="true">✦</span> {c}</li>
            ))}
          </ul>
        </div>
        <div className="lux-hero-media reveal">
          <img
            className="lux-hero-img"
            src={`${import.meta.env.BASE_URL}omer-hero.jpg`}
            alt={`${L.heroName} · ${L.heroRole}`}
            width={1067}
            height={1600}
            loading="eager"
          />
          <span className="lux-hero-tag">
            <b>{L.heroName}</b>
            <small>{L.heroRole}</small>
          </span>
        </div>
        </div>
      </section>

      {/* ---- about (dark band) ---- */}
      <section className="lux-about">
        <div className="lux-about-inner reveal">
          <span className="lux-eyebrow gold">{L.aboutKicker}</span>
          <h2 className="lux-h2 light">{L.aboutTitle}</h2>
          <p className="lux-about-body">{L.aboutBody}</p>
        </div>
      </section>

      {/* ---- certificates ---- */}
      <section className="lux-sec lux-certs">
        <div className="lux-head reveal">
          <span className="lux-eyebrow green">{L.certsKicker}</span>
          <h2 className="lux-h2">{L.certsTitle}</h2>
          <p className="lux-sub">{L.certsSub}</p>
        </div>
        <div className="lux-cert-badges reveal">
          {CREDS.map((c) => (
            <div className="lux-cert-badge" key={c}><span aria-hidden="true">🎓</span> {c}</div>
          ))}
        </div>
        <div className="lux-events-cta reveal">
          <button className="lux-btn gold" onClick={() => setCerts(true)}>{L.certsCta}</button>
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

      {/* ---- gallery (image placeholders — filled later) ---- */}
      <section className="lux-sec lux-gallery">
        <div className="lux-head reveal">
          <span className="lux-eyebrow green">{L.galleryKicker}</span>
          <h2 className="lux-h2">{L.galleryTitle}</h2>
        </div>
        <div className="lux-gallery-grid reveal">
          {[0, 1, 2].map((i) => (
            <div className="lux-img-slot" key={i}>
              <span className="lux-img-slot-ico" aria-hidden="true">📷</span>
              <span className="lux-img-slot-txt">{L.imgSoon}</span>
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

      {/* ---- events (live, synced with published events) ---- */}
      <section className="lux-sec alt">
        <div className="lux-head reveal">
          <span className="lux-eyebrow">{t.events.tab}</span>
          <h2 className="lux-h2">{t.events.publicTitle}</h2>
          <p className="lux-sub">{t.events.publicSubtitle}</p>
        </div>
        {events && events.length > 0 && (
          <div className="lux-events-rail reveal">
            {events.map((ev) => (
              <a className="lux-event-card" key={ev.id} href={`#/events/${ev.id}`}>
                <span className="lux-event-date">
                  {ev.date}{ev.time ? ` · ${ev.time}` : ""}
                </span>
                <h3>{ev.title}</h3>
                {ev.location && <span className="lux-event-loc">{ev.location}</span>}
                <span className="lux-event-foot">
                  <span className="lux-event-price">₪{ev.price}</span>
                  <span className="lux-event-go" aria-hidden="true">{t.events.signup} ←</span>
                </span>
              </a>
            ))}
          </div>
        )}
        <div className="lux-events-cta reveal">
          <a className="lux-btn gold" href="#events">{t.events.seeAll}</a>
        </div>
      </section>

      {/* ---- final + contact (dark band) ---- */}
      <section className="lux-final">
        <div className="lux-final-inner reveal">
          <OmixMark size={92} />
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
        <OmixLogo size={30} />
        <div className="lux-foot-links">
          <a className="lux-foot-link" href="#events">{t.events.tab}</a>
          <button className="lux-foot-link" onClick={() => setLegal(true)}>{t.legal.open}</button>
          <VersionTag />
        </div>
      </footer>

      {certs && (
        <div className="legal-screen" role="dialog" aria-label={L.certsModalTitle}>
          <header className="legal-top">
            <strong>{L.certsModalTitle}</strong>
            <button className="iconbtn" onClick={() => setCerts(false)} aria-label={t.legal.close}>✕</button>
          </header>
          <div className="legal-body">
            <div className="lux-cert-badges" style={{ marginBottom: 22 }}>
              {CREDS.map((c) => (
                <div className="lux-cert-badge" key={c}><span aria-hidden="true">🎓</span> {c}</div>
              ))}
            </div>
            <div className="empty">
              <div className="ico">🎓</div>
              <p>{L.certsEmpty}</p>
            </div>
          </div>
        </div>
      )}
      {legal && <Legal onClose={() => setLegal(false)} />}
      {lead && <LeadForm onClose={() => setLead(false)} />}
    </div>
  );
}
