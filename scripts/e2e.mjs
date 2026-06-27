// End-to-end UI test: drives the real rendered booking journey through Chrome
// (book -> appears in My Bookings -> cancel), exercising store+UI+nav wiring
// that the store-only smoke test can't reach.
import puppeteer from "puppeteer-core";
import { signInAs, EMAIL } from "./_auth.mjs";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:4173";

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });

let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fresh member (dana), no seeded bookings
await p.goto(BASE + "/#schedule", { waitUntil: "networkidle2" });
await signInAs(p, EMAIL.member);

// jump to next week (all of today's classes are in the past) and find a
// bookable class (one whose card action is the lime "book" button).
await p.click(".weekbar .weeknav-btn:last-child");
await sleep(500);
const foundBookable = await p.evaluate(() => {
  for (const btn of document.querySelectorAll(".cc-action .btn-lime")) {
    const cover = btn.closest(".class-card")?.querySelector(".cc-cover");
    if (cover) { cover.click(); return true; }
  }
  return false;
});
ok("found a bookable class and opened it", foundBookable);
await p.waitForSelector(".sheet", { timeout: 4000 });
await sleep(300);

const className = await p.$eval(".detail-hero h2", (el) => el.textContent.trim()).catch(() => "");
const hasBookBtn = await p.evaluate(() => {
  const btn = document.querySelector(".sheet-foot .btn-lime");
  if (btn) { btn.click(); return true; }
  return false;
});
ok("booked from the detail footer", hasBookBtn);
await sleep(500);

// after booking, the footer becomes a cancel button and a toast appears
ok("footer switches to cancel after booking", await p.$(".sheet-foot .btn-danger") !== null);
const toastShown = await p.evaluate(() => !!document.querySelector(".toast.ok"));
ok("a success toast is shown", toastShown);

// close sheet, go to My Bookings
await p.keyboard.press("Escape");
await sleep(300);
await p.goto(BASE + "/#bookings", { waitUntil: "networkidle2" });
await p.waitForSelector(".appbar");
await sleep(400);
const bookingsCount = await p.$$eval(".class-card", (els) => els.length);
ok("the booking appears in My Bookings (upcoming)", bookingsCount >= 1);
const sameClass = await p.evaluate((name) =>
  [...document.querySelectorAll(".cc-title")].some((e) => e.textContent.includes(name)),
  className,
);
ok("My Bookings shows the booked class by name", sameClass);

// open it and cancel
await p.click(".class-card .cc-cover");
await p.waitForSelector(".sheet");
await sleep(300);
await p.click(".sheet-foot .btn-danger"); // cancel
await sleep(500);
const afterCancel = await p.$$eval(".class-card", (els) => els.length);
ok("booking is removed from upcoming after cancel", afterCancel === bookingsCount - 1);

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
