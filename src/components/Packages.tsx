import { PACKAGES, PACKAGE_TRACKS } from "../lib/packages";
import type { PackageTier } from "../lib/packages";
import { t } from "../lib/i18n";

// Per-session price of a tier (a single/trial's total IS its per-session price).
const perOf = (p: PackageTier) => p.perSession ?? Math.round(p.total / p.sessions);

/** Trainee-facing pricing tiers. Each card leads with the PER-SESSION price and
 *  shows the saving vs a single session, so the value/relationship is obvious.
 *  Buying opens the Bit/PayBox modal via `onBuy`. */
export function Packages({ onBuy }: { onBuy: () => void }) {
  return (
    <div className="packages">
      <h2 className="h2" style={{ marginBottom: 4 }}>{t.packages.title}</h2>
      <p className="muted" style={{ fontSize: ".82rem", margin: "0 0 12px" }}>{t.packages.hint}</p>
      {PACKAGE_TRACKS.map((tr) => {
        const tiers = PACKAGES.filter((p) => p.track === tr.id);
        // Baseline for "savings" = the single-session price if the track has one,
        // otherwise the most expensive per-session tier.
        const single = tiers.find((p) => p.sessions === 1);
        const baseline = single ? single.total : Math.max(...tiers.map(perOf));
        return (
          <div key={tr.id} className="pkg-track">
            <div className="pkg-track-label">{tr.label}</div>
            <div className="pkg-grid">
              {tiers.map((p) => {
                const per = perOf(p);
                const isSingle = p.sessions === 1;
                const savePct =
                  !isSingle && baseline > 0 && per < baseline
                    ? Math.round((1 - per / baseline) * 100)
                    : 0;
                return (
                  <button
                    key={p.id}
                    className={`pkg-card ${p.featured ? "featured" : ""}`}
                    onClick={onBuy}
                  >
                    {p.featured && <span className="pkg-badge">{t.packages.popular}</span>}
                    {!p.featured && savePct >= 5 && (
                      <span className="pkg-save-chip">{savePct}%-</span>
                    )}
                    <span className="pkg-title">{p.title}</span>
                    <span className="pkg-per-big">
                      ₪{per.toLocaleString("he-IL")}
                      <small>{t.packages.perLabel}</small>
                    </span>
                    <span className="pkg-total-sub">
                      {isSingle ? t.packages.singleLine(p.total) : t.packages.totalLine(p.sessions, p.total)}
                    </span>
                    {savePct >= 5 ? (
                      <span className="pkg-save-txt">{t.packages.saveLine(savePct)}</span>
                    ) : (
                      <span className="pkg-save-txt" />
                    )}
                    <span className="pkg-buy">{t.packages.buy}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
