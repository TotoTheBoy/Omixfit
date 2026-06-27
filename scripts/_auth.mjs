// ---------------------------------------------------------------------------
// Shared Firebase sign-in for the headless QA scripts.
//
// Real auth now gates the app, so a script must sign in before the app shell
// (`.appbar`) renders. Two requirements to actually run these:
//   1. The preview build must embed a valid Firebase config — create `.env.local`
//      from `.env.example`, then `npm run build` before `npm run preview`.
//   2. The demo accounts must exist in the Firebase project. Create them once
//      (sign up through the app, or in the console) with the password below.
//
// Seeded users map to app roles by email (see src/lib/seed.ts), so:
//   noa@omixfit.app → manager · yael@omixfit.app → instructor · dana@… → member
// ---------------------------------------------------------------------------

export const TEST_PASSWORD = process.env.OMIXFIT_TEST_PASSWORD || "Omixfit-demo-1";

export const EMAIL = {
  manager: "noa@omixfit.app",
  instructor: "yael@omixfit.app",
  member: "dana@omixfit.app",
  member2: "avi@omixfit.app",
};

// The seeded user ids the QA scripts used to switch into → their demo emails.
// Unknown / undefined falls back to the default member, so scripts can call
// `signInAs(page, emailForUser(userId))` whether or not a role was requested.
const EMAIL_FOR = {
  "u-noa": EMAIL.manager,
  "u-yael": EMAIL.instructor,
  "u-tom": EMAIL.instructor,
  "u-dana": EMAIL.member,
  "u-avi": EMAIL.member2,
};
export function emailForUser(userId) {
  return EMAIL_FOR[userId] || EMAIL.member;
}

const STORAGE_KEY = "omixfit:v1";

/**
 * Open a fresh, isolated browser context + page. Firebase persists the auth
 * session per browser profile, so scripts that switch roles should give each
 * page its own context — then `signInAs` is always a clean login (no sign-out
 * dance). Remember to `await context.close()` when done.
 */
export async function freshContext(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  return { context, page };
}

/** Email of the currently signed-in app user (from the persisted store), or null. */
async function currentEmail(page) {
  return page.evaluate((key) => {
    try {
      const d = JSON.parse(localStorage.getItem(key) || "null");
      return d?.users?.find((u) => u.id === d.currentUserId)?.email ?? null;
    } catch {
      return null;
    }
  }, STORAGE_KEY);
}

/** Sign out through the real account sheet, leaving the login form on screen. */
export async function signOut(page) {
  if (!(await page.$(".appbar"))) return;
  await page.click(".userswitch"); // app-bar avatar → account sheet
  await page.waitForSelector(".sheet .btn-danger", { timeout: 8000 });
  await page.click(".sheet .btn-danger"); // sign out
  await page.waitForSelector(".auth-form", { timeout: 15000 });
}

/**
 * Ensure the page is signed in as `email`. No-op if already that user; switches
 * accounts (sign out → sign in) if signed in as someone else. Resolves once the
 * app shell is rendered.
 */
export async function signInAs(page, email, password = TEST_PASSWORD) {
  if (await page.$(".appbar")) {
    if ((await currentEmail(page)) === email) return;
    await signOut(page);
  }
  // Logged-out shows the marketing landing first — click a CTA to reach the form.
  if (await page.$(".landing")) {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".landing .btn")].find((b) =>
        /כניסה|התחל/.test(b.textContent || ""),
      );
      btn?.click();
    });
  }
  await page.waitForSelector(".auth-form", { timeout: 15000 });
  // The sign-in tab is the first/default one.
  await page.evaluate(() => {
    const tab = document.querySelector(".auth-tabs button");
    if (tab && !tab.classList.contains("active")) tab.click();
  });
  await page.click("#auth-email", { clickCount: 3 });
  await page.type("#auth-email", email);
  await page.click("#auth-password", { clickCount: 3 });
  await page.type("#auth-password", password);
  await page.click(".auth-form .btn-lime");
  await page.waitForSelector(".appbar", { timeout: 20000 });
}
