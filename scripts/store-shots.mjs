// App Store screenshots from staged game states, each under a painted caption band in the app's own look (walnut, brass,
// Alegreya). Builds www/ first, so it always shoots the current game; re-run it after any change to the table.
//   node scripts/store-shots.mjs [--size 6.1 | --size ipad]      default: both
// 6.1: 1206x2622 into docs/store/screens/ (App Store Connect's "iPhone with Dynamic Island, medium display" slot).
// ipad: 2064x2752 into docs/store/screens/ipad/ (13" iPad; the app runs on iPad, so App Store Connect asks for it).
// Deals and bots run from a fixed random seed per shot, so a re-run gives the same hands unless the game changed.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const SIZES = { "6.1": { w: 402, h: 874, dpr: 3, dir: "docs/store/screens" }, ipad: { w: 1032, h: 1376, dpr: 2, dir: "docs/store/screens/ipad" } };
const want = arg("--size") ? [arg("--size")] : Object.keys(SIZES);
if (want.some((s) => !SIZES[s])) throw new Error(`--size is one of ${Object.keys(SIZES).join(", ")}`);

// Captions: no prices or store wording in screenshots (App Review 2.3.7); the price lives in the description.
export const SHOTS = [
  { id: "1-title", head: "Pull up a chair", sub: "Classic card games. No ads, ever.", screen: "title" },
  { id: "2-hearts", head: "Hearts is free, for good", sub: "No trial, no timer, no catch.", game: "hearts", seed: 7, left: 8 },
  { id: "3-cupboard", head: "Five classics, one unlock", sub: "Buy once, keep it for good.", screen: "picker", css: ".box { width: min(29%, 136px); } .shelf { margin-bottom: 3.2em; }" /* all five boxes in view */ },
  { id: "4-comfort", head: "Big cards, big print", sub: "Comfort mode, large text, read aloud.", game: "spades", seed: 3, left: 9, opt: { comfort: true, text: "large", theme: "green" } },
  { id: "5-fair", head: "Deals you can check", sub: "Seed and cut on every score sheet.", game: "spades", seed: 11, sheet: true },
  { id: "6-themes", head: "Set the table your way", sub: "Gingham, leather, marble and more.", game: "euchre", seed: 5, left: 4, trick: 1, opt: { theme: "parlor" } },
];

// ---------------------------------------------------------------- serve www/ (plus the frame page we paint captions on)
export function serve() {
  execFileSync(process.execPath, ["scripts/build-web.mjs"], { stdio: "inherit" });
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
  const pages = new Map();
  const server = createServer((req, res) => {
    const p = decodeURIComponent(req.url.split("?")[0]);
    if (pages.has(p)) { res.writeHead(200, { "content-type": "text/html" }); return res.end(pages.get(p)); }
    const f = join("www", p);
    if (!existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
  }).listen(0);
  return { server, pages, base: () => `http://localhost:${server.address().port}` };
}

// the app's own fonts and walnut table, for frames painted around the screenshots
export const FRAME_CSS = `
@font-face { font-family: Alegreya; font-weight: 700; src: url(/fonts/alegreya-700-normal.woff2); }
@font-face { font-family: Alegreya; font-weight: 400; font-style: italic; src: url(/fonts/alegreya-400-italic.woff2); }
@font-face { font-family: "Alegreya Sans"; font-weight: 500; src: url(/fonts/alegreya-sans-500-normal.woff2); }
@font-face { font-family: "Alegreya Sans"; font-weight: 700; src: url(/fonts/alegreya-sans-700-normal.woff2); }
* { box-sizing: border-box; margin: 0; font-variant-numeric: lining-nums; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { position: relative; color: #f7eedc;
  background: radial-gradient(ellipse at 50% 18%, rgba(255,222,170,.30), transparent 62%), radial-gradient(ellipse at 50% 110%, rgba(20,10,4,.55), transparent 60%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012 .5' numOctaves='3' seed='4'/%3E%3CfeColorMatrix values='0 0 0 0 .227 0 0 0 0 .118 0 0 0 0 .047 0 0 0 .9 -.22'/%3E%3C/filter%3E%3Crect width='600' height='600' filter='url(%23g)'/%3E%3C/svg%3E"),
    linear-gradient(180deg, #83563a, #6e4426); }
.rule { display: block; margin: 0 auto; height: 2px; background: linear-gradient(90deg, transparent, #c9a45c 20%, #e8cf94 50%, #c9a45c 80%, transparent); }
h1 { font: 700 1em/1.08 Alegreya, Georgia, serif; text-align: center; text-shadow: 0 2px 0 rgba(40,20,6,.55), 0 6px 18px rgba(20,10,4,.45); }
p { font: 500 1em/1.3 "Alegreya Sans", sans-serif; color: #e8cf94; text-align: center; text-shadow: 0 1px 0 rgba(40,20,6,.6); }
.device { position: absolute; left: 50%; transform: translateX(-50%); background: #1b120b; box-shadow: 0 0 0 1.5px #8a6f3e, 0 30px 60px -18px rgba(10,5,2,.8), 0 10px 22px rgba(10,5,2,.45); }
.device img { display: block; width: 100%; height: 100%; }`;

// a phone or iPad screen, framed: band of text on top, the screen below
const frame = (img, head, sub, S) => {
  const u = S.w / 402, ipad = S.w > 700; // layout in phone points, scaled for the iPad
  const band = ipad ? 270 : 178, top = ipad ? 286 : 190, sw = ipad ? 770 : 300, sh = sw * S.h / S.w, bez = ipad ? 12 : 7, rad = ipad ? 30 : 38;
  return `<!doctype html><meta charset="utf-8"><style>${FRAME_CSS}
  .band { position: absolute; left: 0; right: 0; top: 0; height: ${band}px; display: flex; flex-direction: column; justify-content: center; gap: ${ipad ? 16 : 10}px; padding: 0 ${24 * u}px; }
  h1 { font-size: ${ipad ? 76 : 35}px; } p { font-size: ${ipad ? 38 : 19}px; } .rule { width: ${ipad ? 300 : 150}px; }
  .device { top: ${top}px; width: ${sw + 2 * bez}px; height: ${sh + 2 * bez}px; padding: ${bez}px; border-radius: ${rad + bez}px; }
  .device img { border-radius: ${rad}px; }</style>
  <div class="band"><h1>${head}</h1><span class="rule"></span><p>${sub}</p></div>
  <div class="device"><img src="${img}"></div>`;
};

// a fixed random stream in the page: the same seed gives the same deal, the same bot choices, the same cut
const seeded = (seed) => {
  let s = seed * 0x9e3779b9;
  const r = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t ^ (t >>> 14)) >>> 0; };
  Math.random = () => r() / 4294967296;
  crypto.getRandomValues = (a) => { for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
};

// stage one state in a fresh page and return its PNG: a menu screen, or a hand stopped on the player's turn mid-trick
export async function stage(browser, base, shot, S) { // a seed whose hand never reaches the moment moves on to the next seed
  for (let k = 0; ; k++) try { return await stageOnce(browser, base, { ...shot, seed: (shot.seed || 1) + k }, S); }
  catch (e) { if (k >= 20 || !/staged moment/.test(e.message)) throw e; }
}
async function stageOnce(browser, base, shot, S) {
  const page = await browser.newPage({ viewport: { width: S.w, height: S.h }, deviceScaleFactor: S.dpr });
  try { return await shoot(page, base, shot, S); } finally { await page.close(); }
}
async function shoot(page, base, shot, S) {
  const RESET = +readFileSync("www/main.js", "utf8").match(/RESET = (\d+)/)[1];
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(seeded, shot.seed || 1);
  await page.addInitScript(([reset, opt]) => { if (!localStorage.getItem("kt.save")) localStorage.setItem("kt.save", JSON.stringify({ reset, consentAsked: true, opt: { analytics: false, ...opt } })); }, [RESET, shot.opt || {}]);
  await page.goto(`${base}/index.html?debug&fast`);
  await page.waitForFunction(() => window.kt, null, { timeout: 15000 });
  await page.addStyleTag({ content: "[data-act=family] { display: none !important; }" + (shot.css || "") }); // the debug-only family test button
  if (shot.screen) await page.evaluate((s) => kt.go(s), shot.screen);
  else {
    await page.evaluate((g) => kt.newGame(g), shot.game);
    await page.waitForFunction(({ sheet, left, trick }) => {
      if (sheet) { // a hand the player's side made: a "SET" stamp is the wrong first impression
        if (kt.screen === "sheet") { if (/set/i.test(document.querySelector("#sheet .stamp")?.textContent || "")) throw new Error("not the staged moment: set"); return true; }
        if (kt.pending) kt.autoplay(); return false;
      }
      if (kt.screen === "sheet") throw new Error("the hand ended before the staged moment: try another seed");
      const p = kt.pending, st = kt.G?.st;
      if (!p || p.seat !== 0) return false;
      if (st.phase === "play" && st.hands[0].length <= left && st.trick.length >= trick) return true;
      kt.autoplay(); kt.G.seats[0].kind = "human"; // the bot plays this turn for the player; the next one waits again
      return false;
    }, { sheet: !!shot.sheet, left: shot.left ?? 13, trick: shot.trick ?? 2 }, { timeout: 60000, polling: 50 });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900); // the last card settles, the screen cross-fade ends
  if (errors.length) throw new Error(`${shot.id}: ${errors.join(" | ")}`);
  return page.screenshot();
}

export async function paint(browser, srv, html, w, h, dpr) {
  srv.pages.set("/_frame.html", html);
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await page.goto(`${srv.base()}/_frame.html`);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode())); });
  const png = await page.screenshot();
  await page.close();
  return png;
}

if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const srv = serve(), browser = await chromium.launch();
  for (const size of want) {
    const S = SIZES[size];
    mkdirSync(S.dir, { recursive: true });
    for (const shot of SHOTS) {
      const app = await stage(browser, srv.base(), shot, S);
      const png = await paint(browser, srv, frame(`data:image/png;base64,${app.toString("base64")}`, shot.head, shot.sub, S), S.w, S.h, S.dpr);
      writeFileSync(`${S.dir}/${shot.id}.png`, png);
      console.log(`${S.dir}/${shot.id}.png  ${S.w * S.dpr}x${S.h * S.dpr}`);
    }
  }
  await browser.close(); srv.server.close();
}
