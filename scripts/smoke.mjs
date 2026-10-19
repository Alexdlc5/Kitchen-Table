// Smoke test: every screen in WebKit and Chromium at iPhone size, plus a whole hand of each game (Hearts, Spades, Euchre).
// Fails on a page error, a screen that doesn't show, a button off screen or smaller than a tap target (44pt; 64pt in
// Comfort), a hand card whose visible strip is smaller than a tap target, any overlay between the deal and the last
// trick (DESIGN R2), or a human seat that gets played for them while they think (R10).
//   node scripts/smoke.mjs [--se | --ipad] [--comfort] [--lang xx] [--shots dir]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { webkit, chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const f = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0);
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const shots = arg("--shots"), LANG = arg("--lang"), SE = process.argv.includes("--se"), COMFORT = process.argv.includes("--comfort"), IPAD = process.argv.includes("--ipad");
if (shots) mkdirSync(shots, { recursive: true });
const VW = IPAD ? 820 : SE ? 375 : 402, VH = IPAD ? 1180 : SE ? 667 : 874, DPR = SE || IPAD ? 2 : 3;
const SCREENS = ["title", "picker", "setup", "stats", "options", "caregiver", "unlock", "howto", "shop", "boards"];

// in the page: buttons on the current screen that are off screen or too small to tap
const AUDIT = (id) => {
  const T = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tap"));
  const root = document.getElementById(id), out = [];
  for (const b of root.querySelectorAll("button, select")) {
    if (b.closest("#hand, #trick, .hero, [aria-hidden=true]") || b.offsetParent === null) continue;
    const q = b.getBoundingClientRect(), name = (b.getAttribute("aria-label") || b.textContent).trim().slice(0, 24);
    if (q.left < -1 || q.right > innerWidth + 1) out.push(`off screen: ${name}`);
    if (q.height < T - 0.5 || q.width < T - 0.5) out.push(`small (${q.width | 0}x${q.height | 0} < ${T}): ${name}`);
  }
  // no two controls on top of each other (hand cards overlap on purpose); an open dialog is checked on its own
  const open = !document.getElementById("dialog").hidden;
  const ctl = [...document.querySelectorAll(open ? "#dialog button" : `#${id} button, #${id} select`)].filter((e) => e.offsetParent && !e.closest("#hand, #trick, .hero, #handoff"));
  const label = (e) => (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 20);
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++)
    if (!ctl[i].contains(ctl[j]) && !ctl[j].contains(ctl[i]) && hit(ctl[i].getBoundingClientRect(), ctl[j].getBoundingClientRect())) out.push(`overlap: ${label(ctl[i])} / ${label(ctl[j])}`);
  // at the table, nothing sits on your hand or on the cards in the middle
  if (id === "table" && !open) {
    const hand = document.getElementById("hand").getBoundingClientRect(), trick = [...document.querySelectorAll("#trick .card")].map((e) => e.getBoundingClientRect());
    for (const e of document.querySelectorAll("#seats .seat, #center > *")) {
      const q = e.getBoundingClientRect();
      if (hand.height && hit(q, hand)) out.push(`covers the hand: ${label(e)}`);
      if (trick.some((t) => hit(q, t))) out.push(`covers the trick: ${label(e)}`);
    }
  }
  return out;
};
// every playable card in the hand must show a full tap-target square that is really that card
const HAND = () => {
  const T = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tap")), out = [];
  for (const c of document.querySelectorAll("#hand .card")) { // you can always read your own cards: nothing covers a card's corner
    const q = c.getBoundingClientRect();
    if (document.elementFromPoint(q.left + 8, q.top + 10)?.closest(".card") !== c) out.push(`hand card ${c.dataset.card} is covered`);
  }
  for (const c of document.querySelectorAll("#hand .card:not([disabled])")) {
    const q = c.getBoundingClientRect(), pts = [[2, 2], [T - 2, 2], [2, T - 2], [T - 2, T - 2], [T / 2, T / 2]];
    if (pts.some(([x, y]) => document.elementFromPoint(q.left + x, q.top + y)?.closest(".card") !== c)) out.push(`hand card ${c.dataset.card} has no ${T}pt square of its own`);
  }
  return out;
};

let failed = 0;
for (const [name, bt] of [["webkit", webkit], ["chromium", chromium]]) {
  const b = await bt.launch();
  const page = await b.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  if (COMFORT) await page.addInitScript(() => localStorage.setItem("kt.save", JSON.stringify({ reset: 1, opt: { comfort: true } })));
  await page.goto(`http://localhost:${server.address().port}/proto/index.html?debug&fast${LANG ? "&lang=" + LANG : ""}`);
  await page.waitForFunction(() => window.kt, null, { timeout: 15000 });
  const report = async (id, bad) => {
    bad = [...bad, ...errors.splice(0)].filter(Boolean);
    console.log(`${name.padEnd(9)} ${id.padEnd(14)} ${bad.length ? "FAIL " + bad.join(" | ") : "ok"}`);
    if (bad.length) failed++;
    if (shots) await page.screenshot({ path: join(shots, `${name}-${id}${COMFORT ? "-comfort" : ""}${SE ? "-se" : ""}.png`) });
  };
  for (const id of SCREENS) {
    await page.evaluate(async (id) => { await kt.go(id); }, id);
    await page.waitForTimeout(300);
    const shown = await page.evaluate((id) => document.getElementById(id).classList.contains("on") && document.getElementById(id).innerHTML.length > 50, id);
    await report(id, [!shown && "not shown", ...(await page.evaluate(AUDIT, id))]);
  }
  for (const game of ["hearts", "spades", "euchre", "ohhell", "whist"]) {
    await page.evaluate((g) => kt.newGame(g), game);
    // R10: the human's turn waits as long as they need
    await page.waitForFunction(() => kt.G && kt.pending && kt.pending.seat === 0, null, { timeout: 20000 }); // the game is asking the player
    const before = await page.evaluate(() => JSON.stringify([kt.G.st.phase, kt.G.st.history.length, kt.G.st.bids]));
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => JSON.stringify([kt.G.st.phase, kt.G.st.history.length, kt.G.st.bids]));
    await report(`${game}-table`, [before !== after && "the table moved on while the player was thinking", ...(await page.evaluate(AUDIT, "table")), ...(await page.evaluate(HAND))]);
    // R2: a whole hand, watched every 50 ms for anything popping up between the deal and the last trick
    const overlays = await page.evaluate(async () => {
      const seen = new Set(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      kt.autoplay();
      for (let t = 0; t < 600 && kt.screen === "table"; t++) {
        if (!document.getElementById("dialog").hidden) seen.add("dialog");
        if (document.querySelector(".screen.on #consentCard")) seen.add("consent card");
        await sleep(50);
      }
      return [...seen, ...kt.blocked.map((b) => "blocked: " + b), ...(kt.screen === "sheet" ? [] : ["the hand never finished"])];
    });
    await report(`${game}-hand`, overlays.map((o) => `overlay during the hand: ${o}`));
    await report(`${game}-sheet`, await page.evaluate(AUDIT, "sheet"));
    await page.evaluate(() => { kt.G.over = 0; kt.ACT.next(); });
    await page.waitForTimeout(300);
    await report(`${game}-results`, await page.evaluate(AUDIT, "results"));
  }
  await b.close();
}
server.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log("smoke ok");
