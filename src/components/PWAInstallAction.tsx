import { useState } from "react";
import { t } from "../lib/i18n";
import { usePWAInstall } from "../lib/usePWAInstall";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";

/** "Add Omixfit to your home screen" — proactive, user-triggered install
 *  (docs/refactor-spec.md batch-2 D5). Android fires the native prompt; iOS
 *  Safari opens a guided bottom-sheet. Hidden once already installed. */
export function PWAInstallAction() {
  const { installed, promptInstall } = usePWAInstall();
  const [iosOpen, setIosOpen] = useState(false);
  if (installed) return null;

  async function onClick() {
    const r = await promptInstall();
    if (r === "ios") setIosOpen(true);
    else if (r === "unavailable") toast(t.pwa.useMenu, "info");
  }

  return (
    <div className="pwa-install-section">
      <button className="btn btn-ghost pwa-install-btn" onClick={onClick}>
        {t.pwa.install}
      </button>
      {iosOpen && (
        <Sheet title={t.pwa.iosTitle} onClose={() => setIosOpen(false)}>
          <ol className="pwa-ios-steps">
            <li>{t.pwa.iosStep1}</li>
            <li>{t.pwa.iosStep2}</li>
          </ol>
        </Sheet>
      )}
    </div>
  );
}
