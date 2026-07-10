import { useState } from "react";
import { t } from "../lib/i18n";
import { usePWAInstall } from "../lib/usePWAInstall";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";

/** "Add Omixfit to your home screen" (#4). Opens a selection modal with two
 *  paths: a one-click automatic install (wherever the browser supports the
 *  native prompt) and a platform-aware step-by-step manual guide. Hidden once
 *  the app is already installed. */
export function PWAInstallAction() {
  const { canInstall, installed, isIOS, promptInstall } = usePWAInstall();
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  if (installed) return null;

  const steps = isIOS ? t.pwa.iosSteps : t.pwa.androidSteps;

  async function autoInstall() {
    const r = await promptInstall();
    if (r === "accepted") {
      toast(t.pwa.installedToast, "ok");
      close();
    } else if (r === "ios" || r === "unavailable") {
      // No native prompt here → fall back to the manual guide.
      setGuide(true);
    }
    // "dismissed" → leave the modal open so they can try the guide instead.
  }

  function close() {
    setOpen(false);
    setGuide(false);
  }

  return (
    <div className="pwa-install-section">
      <button className="btn btn-ghost pwa-install-btn" onClick={() => setOpen(true)}>
        {t.pwa.install}
      </button>

      {open && (
        <Sheet title={t.pwa.title} onClose={close}>
          {!guide ? (
            <div className="pwa-options">
              <p className="muted pwa-choose">{t.pwa.chooseHint}</p>
              {canInstall && (
                <button className="pwa-option pwa-option-primary" onClick={autoInstall}>
                  <span className="pwa-option-ic" aria-hidden="true">⚡</span>
                  <span className="pwa-option-main">
                    <b>{t.pwa.autoTitle}</b>
                    <small>{t.pwa.autoSub}</small>
                  </span>
                </button>
              )}
              <button className="pwa-option" onClick={() => setGuide(true)}>
                <span className="pwa-option-ic" aria-hidden="true">📖</span>
                <span className="pwa-option-main">
                  <b>{t.pwa.manualTitle}</b>
                  <small>{t.pwa.manualSub}</small>
                </span>
              </button>
            </div>
          ) : (
            <div className="pwa-guide">
              <h3 className="h2" style={{ marginTop: 0 }}>{isIOS ? t.pwa.iosTitle : t.pwa.androidTitle}</h3>
              <ol className="pwa-ios-steps">
                {steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              {canInstall && (
                <button className="btn btn-lime btn-block" style={{ marginTop: 12 }} onClick={autoInstall}>
                  ⚡ {t.pwa.autoTitle}
                </button>
              )}
              <button className="link-btn" style={{ marginTop: 12 }} onClick={() => setGuide(false)}>
                ← {t.back}
              </button>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
