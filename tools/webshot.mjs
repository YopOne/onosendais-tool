// Headless Chromium check for Onosendai's Tool (Windows / macOS / Linux; Playwright).
// Loads a page, runs optional JS, prints JS errors / console.error / failed requests, saves a PNG.
// Setup (once):  npm i -D playwright && npx playwright install chromium
// Run:  node tools/webshot.mjs <url|#/route> <out.png> [width] [height] [js] [--full] [--touch]
//   node tools/webshot.mjs "#/runes" out.png 1400 1000 "document.title"
//   node tools/webshot.mjs "#/sandbox" phone.png 390 844 --touch --full
//   node tools/webshot.mjs "http://localhost:8000/#/skills" out.png
// A url starting with "#" or "/" is served from the repo root by a built-in server
// (Cache-Control: no-store, so edits to app.js / style.css always show), no
// python http.server needed. Each run is a fresh browser profile, so nothing is cached.
// The js arg runs after the page settles; if it returns a Promise it is awaited and the
// result printed as PREJS. Exit code 1 if the page threw a JS error.

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith("--")));
const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
if (args.length < 2) {
  console.error("usage: node tools/webshot.mjs <url|#/route> <out.png> [width] [height] [js] [--full] [--touch]");
  process.exit(2);
}
const [target, out, w = "1400", h = "1000", preJS = ""] = args;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function serve() {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(buf);
    });
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv)));
}

let srv = null;
let url = target;
if (!/^https?:/i.test(target)) {
  srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  url = target.startsWith("#") ? `${base}/${target}` : base + target;
}

const browser = await chromium.launch();
const touch = flags.has("--touch");
const ctx = await browser.newContext({
  viewport: { width: +w, height: +h },
  hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1,
});
const page = await ctx.newPage();
let jsErrors = 0;
page.on("pageerror", e => { jsErrors++; console.log(`ERROR ${e.message}`); });
page.on("console", m => { if (m.type() === "error") console.log(`console.error ${m.text()}`); });
page.on("requestfailed", r => console.log(`REQFAIL ${r.url()} ${r.failure()?.errorText}`));
page.on("response", r => { if (r.status() >= 400) console.log(`HTTP ${r.status()} ${r.url()}`); });

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(500);
  if (preJS) {
    try {
      const r = await page.evaluate(src => Promise.resolve((0, eval)(src)), preJS);
      console.log(`PREJS: ${typeof r === "string" ? r : JSON.stringify(r)}`);
    } catch (e) { console.log(`PREJS ERROR: ${e.message.split("\n")[0]}`); }
    await page.waitForTimeout(800);
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: out, fullPage: flags.has("--full") });
  console.log(`saved ${out}`);
} catch (e) {
  console.log(`FAILED ${e.message.split("\n")[0]}`);
  jsErrors++;
} finally {
  await browser.close();
  srv?.close();
}
process.exit(jsErrors ? 1 : 0);
