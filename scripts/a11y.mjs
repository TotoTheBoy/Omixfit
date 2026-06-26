// Automated accessibility audit (WCAG 2.0/2.1 A + AA) via axe-core, run against
// the live app on each key screen. plan.md §5.5 (IS 5568 / WCAG 2.0 AA).
import puppeteer from "puppeteer-core";
import { AxePuppeteer } from "@axe-core/puppeteer";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:4173";
const STORAGE_KEY = "omixfit:v1";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

let nav = 0;
async function audit(label, { hash = "", userId, open, then } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/?r=${nav++}#${hash}`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".appbar");
  if (userId) {
    await page.evaluate(
      (key, id) => {
        const raw = localStorage.getItem(key);
        if (raw) {
          const d = JSON.parse(raw);
          d.currentUserId = id;
          localStorage.setItem(key, JSON.stringify(d));
        }
      },
      STORAGE_KEY,
      userId,
    );
    await page.goto(`${BASE}/?r=${nav++}#${hash}`, { waitUntil: "networkidle2" });
    await page.waitForSelector(".appbar");
  }
  await new Promise((r) => setTimeout(r, 500));
  // If we need a class card, select a day that actually has classes (today may
  // be Shabbat / an empty day) so the test is date-independent.
  if (open && open.includes("class-card")) {
    await page.evaluate(() => {
      const col = [...document.querySelectorAll(".daycol")].find((c) =>
        /,\s*[1-9]\d*\s*שיעורים/.test(c.getAttribute("aria-label") || ""),
      );
      col?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
  }
  // Open a modal/sheet before auditing (and optionally a 2nd click).
  if (open) {
    await page.click(open);
    await page.waitForSelector(".sheet, .scrim", { timeout: 4000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
  }
  if (then) {
    await page.click(then);
    await new Promise((r) => setTimeout(r, 400));
  }

  const results = await new AxePuppeteer(page)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const minor = results.violations.filter(
    (v) => v.impact !== "serious" && v.impact !== "critical",
  );
  const tag = serious.length ? "✗" : "✓";
  console.log(`${tag} ${label}: ${serious.length} serious/critical, ${minor.length} minor`);
  for (const v of serious) {
    console.log(`    ! [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} nodes)`);
    console.log(`      ${v.nodes[0]?.target?.join(" ")}`);
  }
  await page.close();
  return serious.length;
}

console.log("axe-core audit (WCAG 2.1 AA)…");
let totalSerious = 0;
totalSerious += await audit("schedule (member)");
totalSerious += await audit("my bookings", { hash: "bookings" });
totalSerious += await audit("profile", { hash: "profile", userId: "u-avi" });
totalSerious += await audit("manage / grid", { hash: "manage", userId: "u-noa" });
// Modal / sheet states — the interactive surfaces not covered above.
totalSerious += await audit("sheet: session detail", { open: ".class-card .cc-cover" });
totalSerious += await audit("sheet: user switcher", { open: ".userswitch" });
totalSerious += await audit("sheet: profile editor", {
  hash: "profile",
  userId: "u-avi",
  open: ".page-head .btn-ghost",
});
totalSerious += await audit("sheet: session editor", {
  hash: "manage",
  userId: "u-noa",
  open: ".page-head .btn-lime",
});
totalSerious += await audit("sheet: member detail", {
  hash: "manage",
  userId: "u-noa",
  open: ".seg button:nth-child(4)",
  then: ".member-row",
});

await browser.close();
console.log(`\n${totalSerious === 0 ? "PASS" : "FAIL"} — ${totalSerious} serious/critical violations`);
process.exit(totalSerious === 0 ? 0 : 1);
