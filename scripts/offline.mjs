// PWA offline-shell test (plan.md §5.2): load the app so the service worker
// installs + caches the shell, then go offline and reload — the app must still
// render from cache (booking still works thanks to localStorage state).
import puppeteer from "puppeteer-core";
import { signInAs, EMAIL } from "./_auth.mjs";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:4173";

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. first load: sign in (online), register SW + warm the cache. Firebase Auth
// persists the session, so the later offline reload restores it without network.
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await signInAs(p, EMAIL.member);

const swReady = await p.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.ready;
  return !!reg.active;
});
ok("service worker registered + active", swReady);

// give the SW a moment to finish caching the shell + assets, and re-fetch
// assets once so the runtime cache-first handler stores them
await sleep(1500);
await p.reload({ waitUntil: "networkidle2" });
await p.waitForSelector(".appbar");
await sleep(800);

// 2. go offline and reload
await p.setOfflineMode(true);
let offlineRendered = false;
let errored = "";
try {
  await p.reload({ waitUntil: "domcontentloaded", timeout: 8000 });
  await p.waitForSelector(".appbar", { timeout: 6000 });
  offlineRendered = true;
} catch (e) {
  errored = e.message;
}
ok("app shell renders while offline" + (errored ? ` (${errored.split("\n")[0]})` : ""), offlineRendered);

if (offlineRendered) {
  // the schedule should still hydrate from localStorage (seeded data)
  const hasContent = await p.evaluate(() => !!document.querySelector(".daystrip") || !!document.querySelector(".page"));
  ok("schedule content renders offline (state from localStorage)", hasContent);
  // navigate to another in-app view offline (client-side routing)
  await p.evaluate(() => { location.hash = "bookings"; });
  await sleep(400);
  const navWorks = await p.evaluate(() => location.hash.includes("bookings") && !!document.querySelector(".page"));
  ok("client-side navigation works offline", navWorks);
}

await p.setOfflineMode(false);
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
