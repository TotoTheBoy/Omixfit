import { t } from "../lib/i18n";
import { OmixMark } from "../components/Brand";

// Standalone, path-based legal documents served at real URLs:
//   /legal            → index of all documents
//   /legal/eula       → End-User License Agreement
//   /legal/terms      → Terms of Service
//   /legal/privacy    → Privacy Policy
//   /legal/waiver     → Health declaration / liability waiver
//
// These are public (rendered before the auth gate in App.tsx). Firebase Hosting
// rewrites every path to index.html, and Vite's SPA fallback does the same in
// dev/preview, so the app boots and reads location.pathname to pick the doc.
// Links use real <a href> full-path navigation so the URLs are shareable and
// indexable (no hash).

// BASE_URL is "/" at root (Firebase Hosting) or "/<subpath>/" under a subpath.
const BASE = import.meta.env.BASE_URL;

export function LegalPage({ slug }: { slug: string }) {
  const L = t.legal;
  const doc = L.docs.find((d) => d.slug === slug);

  // /legal (or an unknown slug) → the document index.
  if (!doc) {
    return (
      <main className="legal-screen legal-page" dir="rtl">
        <header className="legal-top">
          <a className="legal-brand" href={BASE} aria-label="Omixfit"><OmixMark size={30} /></a>
          <strong>{L.indexTitle}</strong>
          <a className="link-btn" href={BASE}>{L.backToApp}</a>
        </header>
        <div className="legal-body">
          <p className="legal-updated">{L.indexSub}</p>
          <ul className="legal-index">
            {L.docs.map((d) => (
              <li key={d.slug}>
                <a href={`${BASE}legal/${d.slug}`}>
                  <span className="legal-index-title">{d.title}</span>
                  <span className="legal-index-go" aria-hidden="true">←</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="legal-disclaimer">{L.disclaimer}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="legal-screen legal-page" dir="rtl">
      <header className="legal-top">
        <a className="legal-brand" href={BASE} aria-label="Omixfit"><OmixMark size={30} /></a>
        <strong>{doc.title}</strong>
        <a className="link-btn" href={`${BASE}legal`}>{L.open}</a>
      </header>
      <div className="legal-body">
        <p className="legal-updated">{L.updated}</p>
        {doc.sections.map((it) => (
          <section className="legal-item" key={it.h}>
            <h3>{it.h}</h3>
            <p>{it.p}</p>
          </section>
        ))}
        <p className="legal-disclaimer">{L.disclaimer}</p>
        <p style={{ marginTop: 20 }}>
          <a className="link-btn" href={BASE}>{L.backToApp}</a>
        </p>
      </div>
    </main>
  );
}
