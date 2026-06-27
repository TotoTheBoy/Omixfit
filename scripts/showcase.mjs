// Generate curated showcase screenshots for the README (committed to docs/media).
// Picks good, populated, *bookable* states so the repo shows the app at its best.
import puppeteer from "puppeteer-core";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { signInAs, emailForUser, freshContext } from "./_auth.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "media");
mkdirSync(OUT, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:4173";
const VP = { width: 1240, height: 860, deviceScaleFactor: 1.5 };

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--force-color-profile=srgb"] });
let nav = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(userId) {
  // Each screenshot user gets an isolated context (clean Firebase session).
  const { context, page: p } = await freshContext(b);
  p._ctx = context;
  await p.setViewport(VP);
  await p.goto(`${BASE}/?s=${nav++}`, { waitUntil: "networkidle2" });
  await signInAs(p, emailForUser(userId));
  return p;
}
async function nextWeekWithClasses(p) {
  // jump forward a week so classes are future + bookable (lime CTAs), then pick
  // a populated day.
  await p.click(".weekbar .weeknav-btn:last-child");
  await sleep(500);
  await p.evaluate(() => {
    const c = [...document.querySelectorAll(".daycol")].find((x) => /,\s*[1-9]\d*\s*שיעורים/.test(x.textContent || ""));
    c?.click();
  });
  await sleep(500);
}

// 1. trainee schedule (bookable week)
let p = await page("u-dana");
await p.goto(`${BASE}/?s=${nav++}#schedule`, { waitUntil: "networkidle2" });
await p.waitForSelector(".appbar");
await nextWeekWithClasses(p);
await p.screenshot({ path: join(OUT, "schedule.png") });
console.log("  ✓ schedule.png");
// 2. booking detail (open a bookable class)
await p.evaluate(() => {
  for (const btn of document.querySelectorAll(".cc-action .btn-lime")) { btn.closest(".class-card")?.querySelector(".cc-cover")?.click(); return; }
  document.querySelector(".class-card .cc-cover")?.click();
});
await p.waitForSelector(".sheet"); await sleep(500);
await p.screenshot({ path: join(OUT, "booking.png") });
console.log("  ✓ booking.png");
await p._ctx.close();

// 3. manager week grid
p = await page("u-noa");
await p.goto(`${BASE}/?s=${nav++}#manage`, { waitUntil: "networkidle2" });
await p.waitForSelector(".mgr-grid"); await sleep(500);
await p.screenshot({ path: join(OUT, "manage.png") });
console.log("  ✓ manage.png");
// 4. manager reports
await p.click(".seg button:nth-child(3)"); await sleep(600);
await p.screenshot({ path: join(OUT, "reports.png") });
console.log("  ✓ reports.png");
await p._ctx.close();

// 5. member profile (populated)
p = await page("u-avi");
await p.goto(`${BASE}/?s=${nav++}#profile`, { waitUntil: "networkidle2" });
await p.waitForSelector(".member-card"); await sleep(400);
await p.screenshot({ path: join(OUT, "profile.png") });
console.log("  ✓ profile.png");
await p._ctx.close();

await b.close();
console.log("Done → docs/media/");
