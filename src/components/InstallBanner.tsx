import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { IcClose, IcShare } from "./icons";
import { Sheet } from "./Sheet";

// Captures the beforeinstallprompt event (Android/desktop Chrome) and offers a
// one-tap install. On iOS there is no such event and the OS forbids triggering
// "Add to Home Screen" programmatically, so the button opens a step-by-step
// guide instead (previously it did nothing on iOS, which felt broken).
export function InstallBanner() {
  const [deferred, setDeferred] = useState<any>(null);
  const [guide, setGuide] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("omixfit:install-dismissed") === "1",
  );
  const isIOS =
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (dismissed || standalone) return null;
  if (!deferred && !isIOS) return null;

  function dismiss() {
    setDismissed(true);
    localStorage.setItem("omixfit:install-dismissed", "1");
  }
  async function install() {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      dismiss();
    } else {
      // iOS: can't auto-install → show the manual steps.
      setGuide(true);
    }
  }

  return (
    <>
      <div className="install-banner">
        <button className="ib-ico" onClick={install} aria-label={isIOS ? t.pwa.howTo : t.installApp}>
          <IcShare width={22} height={22} />
        </button>
        <button className="ib-txt" onClick={install} type="button">
          <b>{t.installApp}</b>
          <small>{isIOS ? t.pwa.iosBannerHint : t.installHint}</small>
        </button>
        <button className="iconbtn" onClick={dismiss} aria-label={t.close}
          style={{ background: "rgba(255,255,255,.1)", color: "#fff" }}>
          <IcClose />
        </button>
      </div>

      {guide && (
        <Sheet title={t.pwa.iosTitle} onClose={() => setGuide(false)}>
          <p className="muted" style={{ marginTop: 0 }}>{t.pwa.chooseHint}</p>
          <ol className="pwa-ios-steps">
            {t.pwa.iosSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Sheet>
      )}
    </>
  );
}
