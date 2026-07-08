import { useCallback, useEffect, useRef, useState } from "react";

// The (non-standard) install-prompt event, captured so the user can trigger the
// install wizard on demand instead of losing the browser's one-shot bar.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop the browser's auto bar; we trigger it ourselves
      deferred.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
      deferred.current = null;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);

  /** Android/Chromium → native prompt; iOS Safari → "ios" (show the guide). */
  const promptInstall = useCallback(async (): Promise<
    "accepted" | "dismissed" | "ios" | "unavailable"
  > => {
    if (deferred.current) {
      await deferred.current.prompt();
      const choice = await deferred.current.userChoice;
      deferred.current = null;
      setCanInstall(false);
      return choice.outcome;
    }
    return isIOS ? "ios" : "unavailable";
  }, [isIOS]);

  return { canInstall, installed, isIOS, promptInstall };
}
