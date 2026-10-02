// Launches one headless Chrome tab on the harness URL. Reads commands on stdin:
//   reload  -> page.reload() (fires pagehide, like F5)
// Usage: node player.mjs <url> [secureOrigin]
import { chromium } from "playwright-core";
import readline from "node:readline";

const [url, secureOrigin] = process.argv.slice(2);
// Default: Playwright's bundled Chromium (npx playwright-core install chromium-headless-shell).
// A system Chrome with a WebRtcIPHandling policy may gather no ICE candidates.
const executablePath = process.env.CHROME_PATH || undefined;
const args = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
  "--no-sandbox",
];
if (secureOrigin) args.push(`--unsafely-treat-insecure-origin-as-secure=${secureOrigin}`);
const browser = await chromium.launch({ executablePath, headless: true, args });
const context = await browser.newContext();
const page = await context.newPage();
page.on("console", (m) => { if (process.env.E2E_VERBOSE && /WebRTC/.test(m.text())) console.log(`[${process.env.E2E_NAME ?? "page"}] ${m.text()}`); });
page.on("pageerror", (e) => console.log(`[${process.env.E2E_NAME ?? "page"}] pageerror ${e.message}`));
await page.goto(url);
console.log("READY");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (line.trim() === "reload") { await page.reload(); console.log("RELOADED"); }
  if (line.trim() === "force-ice-failure") { console.log("FORCED", await page.evaluate(() => window.__forceIceFailure())); }
  if (line.trim() === "quit") { await browser.close(); process.exit(0); }
});
process.on("SIGTERM", async () => { await browser.close().catch(() => {}); process.exit(0); });
