// ---------------------------------------------------------------------------
// "Invite a friend" - uses the native OS share sheet (Web Share API) so the user
// picks WhatsApp / Messages / etc. themselves. Falls back to opening WhatsApp's
// share when the browser has no share sheet (most desktops).
// ---------------------------------------------------------------------------
const INVITE_URL = "https://omixfit.com/";

export async function shareInvite(message?: string): Promise<void> {
  const text = message ?? "בוא/י להתאמן איתי ב-Omix - הסטודיו של עומר 💪 הרשמה כאן:";
  const data = { title: "Omix · הסטודיו של עומר", text, url: INVITE_URL };
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav && typeof nav.share === "function") {
    try {
      await nav.share(data);
      return;
    } catch (e) {
      // User dismissed the share sheet → do nothing (don't fall back).
      if ((e as { name?: string })?.name === "AbortError") return;
    }
  }
  // No share sheet → open WhatsApp with the message prefilled.
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${INVITE_URL}`)}`, "_blank", "noreferrer");
}
