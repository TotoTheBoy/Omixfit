import { useEffect, useState } from "react";
import { t } from "../lib/i18n";

// OMIX emblem — an approximation of the brand mark (a gold beaded strand crossed
// by an olive leaf). Recolors via CSS vars. Swap for the exact artwork by
// dropping a file in /public and pointing this at an <img>.
export function OmixMark({ size = 30 }: { size?: number }) {
  const ticks = [16, 23, 30, 37, 44];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="omix-mark">
      {/* olive leaf sweep */}
      <path
        d="M18 10 C 36 22, 36 42, 46 54"
        fill="none"
        stroke="var(--olive, #6e8b4e)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      {/* gold spine/strand */}
      <path
        d="M46 10 C 28 22, 28 42, 18 54"
        fill="none"
        stroke="var(--gold, #c8a24a)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      {/* vertebrae beads along the gold strand */}
      {ticks.map((y, i) => (
        <rect
          key={y}
          x={32 - 6 + (i - 2) * 1.2}
          y={y}
          width="12"
          height="3.2"
          rx="1.6"
          fill="var(--gold, #c8a24a)"
          transform={`rotate(${(i - 2) * 10} 32 ${y + 1.6})`}
        />
      ))}
    </svg>
  );
}

/** Full OMIX lockup — emblem + wordmark — for the app bar and landing. */
export function OmixLogo({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`omix-logo ${className}`}>
      <OmixMark size={size} />
      <span className="omix-word">{t.appName}</span>
    </span>
  );
}

/** Live Jerusalem (Asia/Jerusalem) wall clock for the trainer. */
export function JerusalemClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <div className="jclock" title={t.jerusalem}>
      <span className="jclock-city">{t.jerusalem}</span>
      <time dir="ltr">{time}</time>
    </div>
  );
}
