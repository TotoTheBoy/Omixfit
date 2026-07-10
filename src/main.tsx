import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/fonts.css";
import "./styles/theme.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Register the PWA service worker (production builds only - the file is served
// from /public). Safe no-op in dev.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // BASE_URL is "/" at root, "/Omixfit/" on GitHub Pages - keep SW + scope
    // aligned with the deployed path.
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((reg) => {
        // Auto-update: when a newly deployed SW finishes installing while an old
        // one still controls the page, reload once so an already-open tab runs
        // the fresh build instead of stale code (fixes "the deploy didn't take").
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
        // Check for a new version now and whenever the tab regains focus.
        reg.update();
        window.addEventListener("focus", () => reg.update());
      })
      .catch(() => {
        /* offline shell is a progressive enhancement */
      });
  });
}
