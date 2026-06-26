import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/theme.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Register the PWA service worker (production builds only — the file is served
// from /public). Safe no-op in dev.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // BASE_URL is "/" at root, "/Omixfit/" on GitHub Pages — keep SW + scope
    // aligned with the deployed path.
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      /* offline shell is a progressive enhancement */
    });
  });
}
