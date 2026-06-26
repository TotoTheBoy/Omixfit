import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:4173";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.goto(BASE + "/#schedule", { waitUntil: "networkidle2" });
await p.waitForSelector(".daycol");
// Select a day that has classes (today may be Shabbat / empty) — date-robust.
await p.evaluate(() => {
  const col = [...document.querySelectorAll(".daycol")].find((c) =>
    /,\s*[1-9]\d*\s*שיעורים/.test(c.getAttribute("aria-label") || ""),
  );
  col?.click();
});
await p.waitForSelector(".class-card .cc-cover");

let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${n}`); };

const inSheet = () => p.evaluate(() => {
  const sheet = document.querySelector(".sheet");
  return !!sheet && sheet.contains(document.activeElement);
});

// remember the trigger, open the sheet
await p.evaluate(() => { window.__trigger = document.querySelector(".class-card .cc-cover"); window.__trigger.focus(); });
await p.click(".class-card .cc-cover");
await p.waitForSelector(".sheet");
await new Promise((r) => setTimeout(r, 300));

ok("focus moves into the sheet on open", await inSheet());

// Tab 25 times — focus must never leave the sheet
let escaped = false;
for (let i = 0; i < 25; i++) { await p.keyboard.press("Tab"); if (!(await inSheet())) { escaped = true; break; } }
ok("Tab is trapped inside the sheet (25 presses)", !escaped);

// Shift+Tab a few times — still trapped
for (let i = 0; i < 6; i++) await p.keyboard.down("Shift"), await p.keyboard.press("Tab"), await p.keyboard.up("Shift");
ok("Shift+Tab is trapped inside the sheet", await inSheet());

// Escape closes and restores focus to the trigger
await p.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 300));
const closed = await p.evaluate(() => !document.querySelector(".sheet"));
ok("Escape closes the sheet", closed);
const restored = await p.evaluate(() => document.activeElement === window.__trigger);
ok("focus is restored to the trigger on close", restored);

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
