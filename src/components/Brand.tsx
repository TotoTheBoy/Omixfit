import { useEffect, useState } from "react";
import { t } from "../lib/i18n";

// The real OMIX emblem (the studio's logo - gold spine + olive leaf), cropped
// from the artwork in /public. Square dark tile that sits well on both the dark
// chrome and the light cards.
export function OmixMark({ size = 30 }: { size?: number }) {
  return (
    <img
      className="omix-mark"
      src={`${import.meta.env.BASE_URL}omix-mark.png`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}

/** Full OMIX lockup - emblem + wordmark - for the app bar and landing. */
export function OmixLogo({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`omix-logo ${className}`}>
      <OmixMark size={size} />
      <span className="omix-word">{t.appName}</span>
    </span>
  );
}

/** Live Israel (Asia/Jerusalem) wall clock - time only. */
export function IsraelClock({ className = "" }: { className?: string }) {
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
    <time className={`jclock ${className}`} dir="ltr" title={t.jerusalem}>
      {time}
    </time>
  );
}
