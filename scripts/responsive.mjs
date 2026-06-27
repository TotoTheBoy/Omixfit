import puppeteer from "puppeteer-core";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signInAs, emailForUser, freshContext } from "./_auth.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "screenshots", "responsive");
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:4173";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--force-color-profile=srgb"] });
let n = 0;
async function shot(name, w, { hash = "", userId } = {}) {
  const { context, page: p } = await freshContext(b);
  await p.setViewport({ width: w, height: 800, deviceScaleFactor: 1 });
  await p.goto(`${BASE}/?w=${n++}`, { waitUntil: "networkidle2" });
  await signInAs(p, emailForUser(userId));
  await p.goto(`${BASE}/?w=${n++}#${hash}`, { waitUntil: "networkidle2" });
  await p.waitForSelector(".appbar");
  await new Promise((r) => setTimeout(r, 500));
  // detect horizontal overflow (a common responsive bug)
  const overflow = await p.evaluate(() => {
    const de = document.documentElement;
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, overflow: de.scrollWidth - de.clientWidth };
  });
  await p.screenshot({ path: join(OUT, `${name}-${w}.png`) });
  const flag = overflow.overflow > 2 ? `  ⚠ H-OVERFLOW +${overflow.overflow}px` : "";
  console.log(`  ${name} @${w}: scrollW=${overflow.scrollW} clientW=${overflow.clientW}${flag}`);
  await context.close();
}
for (const w of [320, 768, 1920]) {
  await shot("schedule", w);
  await shot("manage", w, { hash: "manage", userId: "u-noa" });
  await shot("profile", w, { hash: "profile", userId: "u-avi" });
}
await b.close();
console.log("Done → screenshots/responsive/");
