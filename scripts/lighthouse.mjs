// Lighthouse audit against the production preview. Reports category scores and
// lists any failing audits in performance / a11y / best-practices / SEO so real
// issues (manifest, tap targets, meta, console errors) surface.
import { launch } from "puppeteer-core";
import lighthouse from "lighthouse";
import { signInAs, EMAIL } from "./_auth.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAGE_URL = "http://localhost:4173/";

const browser = await launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

// Warm a signed-in session first — Firebase Auth persists it in the browser
// profile, so Lighthouse's fresh navigation audits the real app, not the login
// screen.
const warm = await browser.newPage();
await warm.goto(PAGE_URL, { waitUntil: "networkidle2" });
await signInAs(warm, EMAIL.member);
await warm.close();

const port = Number(new URL(browser.wsEndpoint()).port);

const result = await lighthouse(
  PAGE_URL,
  {
    port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    // emulate a mid-tier mobile (the primary target)
    formFactor: "mobile",
    screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2 },
  },
);

const lhr = result.lhr;
console.log("Lighthouse (mobile) — category scores:");
let lowCat = 0;
for (const [id, cat] of Object.entries(lhr.categories)) {
  const score = Math.round((cat.score ?? 0) * 100);
  if (score < 90) lowCat++;
  console.log(`  ${score >= 90 ? "✓" : "✗"} ${cat.title}: ${score}`);
}

console.log("\nFailing / flagged audits (score < 0.9, scored only):");
let flagged = 0;
for (const cat of Object.values(lhr.categories)) {
  for (const ref of cat.auditRefs) {
    const a = lhr.audits[ref.id];
    if (a && a.scoreDisplayMode === "binary" || a?.scoreDisplayMode === "numeric") {
      if (a.score !== null && a.score < 0.9) {
        flagged++;
        console.log(`  ✗ [${cat.title}] ${a.title}${a.displayValue ? " — " + a.displayValue : ""}`);
      }
    }
  }
}
if (!flagged) console.log("  (none)");

await browser.close();
console.log(`\n${lowCat === 0 ? "PASS" : "REVIEW"} — ${lowCat} category(ies) below 90`);
