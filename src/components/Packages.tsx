import { PACKAGES, PACKAGE_TRACKS } from "../lib/packages";
import { t } from "../lib/i18n";

/** Trainee-facing pricing tiers (docs/refactor-spec.md §7). Buying opens the
 *  Bit/PayBox modal via `onBuy`. */
export function Packages({ onBuy }: { onBuy: () => void }) {
  return (
    <div className="packages">
      <h2 className="h2" style={{ marginBottom: 4 }}>{t.packages.title}</h2>
      <p className="muted" style={{ fontSize: ".82rem", margin: "0 0 12px" }}>{t.packages.hint}</p>
      {PACKAGE_TRACKS.map((tr) => (
        <div key={tr.id} style={{ marginBottom: 8 }}>
          <div className="pkg-track-label">{tr.label}</div>
          <div className="pkg-grid">
            {PACKAGES.filter((p) => p.track === tr.id).map((p) => (
              <button
                key={p.id}
                className={`pkg-card ${p.featured ? "featured" : ""}`}
                onClick={onBuy}
              >
                {p.featured && <span className="pkg-badge">{t.packages.popular}</span>}
                <span className="pkg-title">{p.title}</span>
                <span className="pkg-total">₪{p.total.toLocaleString("he-IL")}</span>
                {p.perSession ? (
                  <span className="pkg-per">{t.packages.perSession(p.perSession)}</span>
                ) : (
                  <span className="pkg-per" />
                )}
                <span className="pkg-buy">{t.packages.buy}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
