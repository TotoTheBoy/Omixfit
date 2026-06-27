// Visual QA for the waitlist flow. Fills next week's sessions to capacity so a
// member sees "join waitlist", then exercises the join. Writes screenshots.
import puppeteer from "puppeteer-core";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signInAs, EMAIL } from "./_auth.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "screenshots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:4173";
const KEY = "omixfit:v1";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--force-color-profile=srgb"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
await page.goto(BASE + "/#schedule", { waitUntil: "networkidle2" });
await signInAs(page, EMAIL.member);

// Fill every session 6–13 days out to capacity (other members), as member dana.
await page.evaluate((key) => {
  const d = JSON.parse(localStorage.getItem(key));
  const now = Date.now();
  for (const s of d.sessions) {
    const [y, mo, da] = s.date.split("-").map(Number);
    const dt = new Date(y, mo - 1, da, 0, 0);
    dt.setMinutes(s.startMin);
    const ts = dt.getTime();
    // future sessions only (booking open, not past)
    if (ts < now + 864e5 || s.cancelled) continue;
    const confirmed = d.bookings.filter((b) => b.sessionId === s.id && b.state === "confirmed").length;
    // Make it full by shrinking capacity to the current booking count (we have
    // more capacity than seeded members, so this is the simplest full state).
    if (confirmed > 0) s.capacity = confirmed;
  }
  localStorage.setItem(key, JSON.stringify(d));
}, KEY);

await page.goto(BASE + "/?w=1#schedule", { waitUntil: "networkidle2" });
await page.waitForSelector(".appbar");
// jump one week forward (onNext = later in time = 2nd weeknav button)
await page.click(".weekbar .weeknav-btn:last-child");
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: join(OUT, "12-waitlist-schedule.png") });
console.log("  ✓ 12-waitlist-schedule (full classes show join-waitlist)");

// open the first class → detail with join-waitlist button
await page.click(".class-card .cc-cover");
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: join(OUT, "13-waitlist-detail.png") });
console.log("  ✓ 13-waitlist-detail");

// join the waitlist
await page.click(".sheet-foot .btn-wait");
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: join(OUT, "14-waitlist-joined.png") });
console.log("  ✓ 14-waitlist-joined (position + toast)");

await browser.close();
console.log("Done → screenshots/");
