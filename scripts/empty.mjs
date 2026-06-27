// Empty-state probe: a brand-new facility (no sessions/bookings/audit) and an
// empty catalog. Screenshots the surfaces most likely to break with no data
// (Reports division-by-zero/NaN, blank grids with no messaging).
import puppeteer from "puppeteer-core";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { signInAs, emailForUser, freshContext } from "./_auth.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "screenshots", "empty");
mkdirSync(OUT, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:4173";
const KEY = "omixfit:v1";

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--force-color-profile=srgb"] });

const nanFound = [];
async function go(name, { hash, userId, seg, emptyTypes = false }) {
  const { context, page: p } = await freshContext(b);
  await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  p.on("console", (m) => { if (/NaN|undefined|Infinity/.test(m.text())) nanFound.push(`[${name}] ${m.text()}`); });
  // Sign in first, then empty the data (auth only sets currentUserId, so the
  // injected empty state survives the reload).
  await p.goto(BASE + "/?e=" + Math.random(), { waitUntil: "networkidle2" });
  await signInAs(p, emailForUser(userId));
  await p.evaluate((k, et) => {
    const d = JSON.parse(localStorage.getItem(k));
    d.sessions = []; d.bookings = []; d.audit = [];
    if (et) d.classTypes = [];
    localStorage.setItem(k, JSON.stringify(d));
  }, KEY, emptyTypes);
  await p.goto(BASE + "/?e=" + Math.random() + "#" + (hash || ""), { waitUntil: "networkidle2" });
  await p.waitForSelector(".appbar");
  await new Promise((r) => setTimeout(r, 400));
  if (seg) { await p.click(`.seg button:nth-child(${seg})`).catch(() => {}); await new Promise((r) => setTimeout(r, 400)); }
  // scan rendered text for NaN / undefined leaking into the UI
  const badText = await p.evaluate(() => {
    const t = document.body.innerText;
    const hits = [];
    if (/NaN/.test(t)) hits.push("NaN");
    if (/undefined/.test(t)) hits.push("undefined");
    if (/\bInfinity\b/.test(t)) hits.push("Infinity");
    return hits;
  });
  if (badText.length) nanFound.push(`[${name}] visible text: ${badText.join(", ")}`);
  await p.screenshot({ path: join(OUT, name + ".png"), fullPage: true });
  console.log(`  ✓ ${name}${badText.length ? "  ⚠ " + badText.join(",") : ""}`);
  await context.close();
}

console.log("Empty-state probe…");
await go("manage-grid-empty", { hash: "manage", userId: "u-noa" });
await go("reports-empty", { hash: "manage", userId: "u-noa", seg: 3 });
await go("members-empty-ok", { hash: "manage", userId: "u-noa", seg: 4 });
await go("catalog-empty", { hash: "manage", userId: "u-noa", seg: 2, emptyTypes: true });
await go("schedule-empty", { hash: "", userId: "u-dana" });

await b.close();
console.log(nanFound.length ? `\n⚠ ${nanFound.length} NaN/undefined issue(s):\n  ${nanFound.join("\n  ")}` : "\nNo NaN/undefined/Infinity leaked into any view.");
process.exit(nanFound.length ? 1 : 0);
