// Visual QA: drive system Chrome headlessly to screenshot the running app.
// Usage: node scripts/shots.mjs   (preview server must be on :4173)
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signInAs, emailForUser, freshContext } from "./_auth.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "screenshots");
mkdirSync(OUT, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:4173";

let navSeq = 0; // cache-buster so every (re)load is a real full navigation
const desktop = { width: 1280, height: 900, deviceScaleFactor: 2 };
const mobile = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--force-color-profile=srgb"],
});

async function shot(name, { viewport, hash = "", userId, click, then, wait = 700, fullPage = false }) {
  const { context, page } = await freshContext(browser);
  await page.setViewport(viewport);
  const url = (h) => `${BASE}/?r=${navSeq++}#${h}`;
  // Sign in (or switch role) first, then navigate to the screenshotted route.
  await page.goto(url(""), { waitUntil: "networkidle2" });
  await signInAs(page, emailForUser(userId));
  await page.goto(url(hash), { waitUntil: "networkidle2" });
  await page.waitForSelector(".appbar", { timeout: 8000 });
  await new Promise((r) => setTimeout(r, wait));
  // On the schedule, land on a day that has classes (today may be Shabbat).
  if (hash === "") {
    await page.evaluate(() => {
      const col = [...document.querySelectorAll(".daycol")].find((c) =>
        /,\s*[1-9]\d*\s*שיעורים/.test(c.textContent || ""),
      );
      col?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
  }
  if (click) {
    await page.click(click).catch(() => console.log(`  (no ${click} to click)`));
    await new Promise((r) => setTimeout(r, 600));
  }
  if (then) {
    await page.click(then).catch(() => console.log(`  (no ${then} to click)`));
    await new Promise((r) => setTimeout(r, 600));
  }
  const file = join(OUT, name + ".png");
  await page.screenshot({ path: file, fullPage });
  console.log("  ✓ " + name);
  await context.close();
}

console.log("Capturing screenshots…");
await shot("01-schedule-desktop", { viewport: desktop });
await shot("02-schedule-mobile", { viewport: mobile });
await shot("03-detail-desktop", { viewport: desktop, click: ".class-card" });
await shot("04-bookings-desktop", { viewport: desktop, hash: "bookings" });
await shot("05-profile-desktop", { viewport: desktop, hash: "profile", userId: "u-avi" });
await shot("06-manage-desktop", { viewport: desktop, hash: "manage", userId: "u-noa" });
await shot("07-catalog-desktop", {
  viewport: desktop,
  hash: "manage",
  userId: "u-noa",
  click: ".seg button:last-child",
});
await shot("08-manage-mobile", { viewport: mobile, hash: "manage", userId: "u-noa" });
await shot("09-reports-desktop", {
  viewport: desktop,
  hash: "manage",
  userId: "u-noa",
  click: ".seg button:nth-child(3)",
  fullPage: true,
});
await shot("10-members-desktop", {
  viewport: desktop,
  hash: "manage",
  userId: "u-noa",
  click: ".seg button:nth-child(4)",
});
await shot("11-member-detail", {
  viewport: desktop,
  hash: "manage",
  userId: "u-noa",
  click: ".seg button:nth-child(4)",
  then: ".member-row",
});

await browser.close();
console.log("Done → screenshots/");
