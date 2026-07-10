import { useState } from "react";
import { t } from "../lib/i18n";
import { IcClose } from "./icons";

// Terms / Privacy / EULA / Waiver overlay (template content; see disclaimer).
// The same documents are also served as standalone pages at /legal/<slug>
// (see screens/LegalPage.tsx) — this modal is the in-app quick view.
export function Legal({ onClose }: { onClose: () => void }) {
  const L = t.legal;
  const [active, setActive] = useState(L.docs[0].slug);
  const doc = L.docs.find((d) => d.slug === active) ?? L.docs[0];
  return (
    <div className="legal-screen" role="dialog" aria-label={L.open}>
      <header className="legal-top">
        <strong>{L.open}</strong>
        <button className="iconbtn" onClick={onClose} aria-label={L.close}><IcClose /></button>
      </header>
      <div className="legal-body">
        <div className="seg legal-tabs" style={{ marginBottom: 18 }}>
          {L.docs.map((d) => (
            <button
              key={d.slug}
              className={active === d.slug ? "on" : ""}
              onClick={() => setActive(d.slug)}
            >
              {d.title}
            </button>
          ))}
        </div>
        <h2 className="legal-h">{doc.title}</h2>
        <p className="legal-updated">{L.updated}</p>
        {doc.sections.map((it) => (
          <section className="legal-item" key={it.h}>
            <h3>{it.h}</h3>
            <p>{it.p}</p>
          </section>
        ))}
        <p className="legal-disclaimer">{L.disclaimer}</p>
      </div>
    </div>
  );
}
