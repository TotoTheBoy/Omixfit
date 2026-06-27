// Edge-case content regression guard: inject worst-case long Hebrew strings,
// then assert no surface develops horizontal overflow at mobile + desktop.
// Long content is a classic source of overflow/truncation bugs.
import puppeteer from "puppeteer-core";
import { signInAs, emailForUser, freshContext } from "./_auth.mjs";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:4173";
const KEY = "omixfit:v1";
const LONG_CLASS = "אימון פונקציונלי משולב לכל הגוף עם דגש על ליבה ויציבה — קבוצה מתקדמת";
const LONG_NAME = "אלכסנדרה־מרי כהן־לוי בן־אברהם השלישית";

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${n}${extra}`); };

async function inject(page) {
  await page.evaluate((key, longClass, longName) => {
    const d = JSON.parse(localStorage.getItem(key));
    d.currentUserId = "u-dana";
    d.classTypes.forEach((c, i) => { if (i % 2 === 0) c.name = longClass; });
    const m = d.users.find((u) => u.id === "u-avi");
    m.name = longName; m.initials = "אכ";
    localStorage.setItem(key, JSON.stringify(d));
  }, KEY, LONG_CLASS, LONG_NAME);
}

async function check(label, w, { hash = "", userId, seg } = {}) {
  const { context, page: p } = await freshContext(b);
  await p.setViewport({ width: w, height: 800, deviceScaleFactor: 1 });
  await p.goto(BASE + "/?x=" + Math.random(), { waitUntil: "networkidle2" });
  await signInAs(p, emailForUser(userId));
  await inject(p); // long-content overrides (auth keeps the signed-in user)
  await p.goto(BASE + "/?x=" + Math.random() + "#" + hash, { waitUntil: "networkidle2" });
  await p.waitForSelector(".appbar");
  await new Promise((r) => setTimeout(r, 400));
  if (hash === "") {
    await p.evaluate(() => { const c = [...document.querySelectorAll(".daycol")].find((x) => /,\s*[1-9]\d*\s*שיעורים/.test(x.textContent || "")); c?.click(); });
    await new Promise((r) => setTimeout(r, 400));
  }
  if (seg) { await p.click(`.seg button:nth-child(${seg})`).catch(() => {}); await new Promise((r) => setTimeout(r, 400)); }
  const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${label} @${w}: no horizontal overflow`, o <= 2, o > 2 ? `  (+${o}px)` : "");
  await context.close();
}

console.log("Long-content stress (no-overflow guard)…");
for (const w of [390, 1280]) {
  await check("schedule", w);
  await check("manage grid", w, { hash: "manage", userId: "u-noa" });
  await check("catalog", w, { hash: "manage", userId: "u-noa", seg: 2 });
  await check("members", w, { hash: "manage", userId: "u-noa", seg: 4 });
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
