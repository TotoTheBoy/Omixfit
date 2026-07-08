import type { ReactNode } from "react";
import { t } from "../lib/i18n";
import { useStore } from "../lib/store";

// Recognisable brand marks as inline SVG (no image assets, no bundle bloat).
const BitLogo = () => (
  <svg width="44" height="30" viewBox="0 0 44 30" aria-hidden="true">
    <rect width="44" height="30" rx="8" fill="#00b3b8" />
    <text x="22" y="21" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="15" fontWeight="800" fill="#fff">bit</text>
  </svg>
);
const PayBoxLogo = () => (
  <svg width="62" height="30" viewBox="0 0 62 30" aria-hidden="true">
    <rect width="62" height="30" rx="8" fill="#6b2ff0" />
    <text x="31" y="20" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="800" fill="#fff">PayBox</text>
  </svg>
);

/** The two checkout rows (Bit / PayBox) inside the purchase modal. */
export function PayOptions({ onDone }: { onDone: () => void }) {
  const fac = useStore((s) => s.facility);
  return (
    <div className="pay-options">
      <PayRow brand="bit" logo={<BitLogo />} name={t.pay.bit} link={fac.bitLink} onDone={onDone} />
      <PayRow brand="paybox" logo={<PayBoxLogo />} name={t.pay.paybox} link={fac.payboxLink} onDone={onDone} />
      <small className="pay-hint" style={{ display: "block", marginTop: 12 }}>{t.pay.hint}</small>
    </div>
  );
}

function PayRow({
  brand, logo, name, link, onDone,
}: { brand: string; logo: ReactNode; name: string; link?: string; onDone: () => void }) {
  if (link) {
    return (
      <a className={`pay-row pay-${brand}`} href={link} target="_blank" rel="noreferrer" onClick={onDone}>
        {logo}
        <span className="pay-row-name">{name}</span>
        <span className="pay-row-arrow" aria-hidden="true">←</span>
      </a>
    );
  }
  return (
    <div className={`pay-row pay-${brand} disabled`} aria-disabled="true">
      {logo}
      <span className="pay-row-name">{name}</span>
      <span className="pay-row-soon">{t.pay.soon}</span>
    </div>
  );
}
