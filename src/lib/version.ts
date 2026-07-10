// ---------------------------------------------------------------------------
// Deployed-build identity. Values are stamped at build time by Vite `define`
// (see vite.config.ts) so the running site can show exactly which commit is
// live - useful when verifying a GitHub Pages deploy went out.
// ---------------------------------------------------------------------------

export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

export const BUILD_SHA: string =
  typeof __BUILD_SHA__ === "string" ? __BUILD_SHA__ : "dev";

export const BUILD_TIME: string =
  typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "";

/** Clean short label for the UI, e.g. "v0.1.0". The commit SHA is intentionally
    kept out of the visible footer (it moves to the hover tooltip) — see the
    footer cleanup in VersionTag. */
export const VERSION_LABEL = `v${APP_VERSION}`;

/** Localized build date (or empty if unknown) for a tooltip. */
export function buildTimeLabel(): string {
  if (!BUILD_TIME) return "";
  try {
    return new Date(BUILD_TIME).toLocaleString("he-IL");
  } catch {
    return BUILD_TIME;
  }
}
