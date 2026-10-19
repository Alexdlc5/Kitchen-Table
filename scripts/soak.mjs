// Soak: N minutes of auto-played hands at 402x874 @3x in Chromium (?debug&fast): Hearts and Spades games back to back,
// Comfort on for every other pair of games, a free theme change every 45 s. Per minute: main-thread work per rendered frame
// (p50/p95/p99/max, ms, from 15 s of Chromium trace), the JS heap after a forced GC, DOM nodes.
// Frame work = the main-thread task that renders a frame plus the longest task in the 16.7 ms before it (one play's DOM
// update). Not the sum: ?fast squeezes several plays into one vsync, which real play (190 ms or more apart) never does.
// This is desktop CPU time, not an iPhone: it catches regressions and leaks; the device run (Instruments) is the truth.
//   node scripts/soak.mjs [--minutes 10] [--check]   --check: exit 1 on a page error, frame work p95 > 8.3 ms (120 Hz),
//                                                    heap growth > 25% from minute 1, or fewer than 10 hands a minute
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const MIN = +arg("--minutes", 10), check = process.argv.includes("--check"), SAMPLE = 15000, BUDGET = 1000 / 120;
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const f = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0);

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:${server.address().port}/proto/index.html?debug&fast`);
await page.waitForFunction(() => window.kt, null, { timeout: 15000 });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
// the player: a finished hand deals the next; a finished game starts the other game; seat 0 is a bot too
await page.evaluate(async () => {
  const { THEMES } = await import("./themes.js"), free = Object.keys(THEMES).filter((k) => THEMES[k].tier === "free");
  window.played = { games: 0, themes: 0 };
  const start = () => { const n = played.games++; kt.S.opt.comfort = !!((n >> 1) & 1); kt.applyLook(); kt.newGame(["hearts", "spades", "euchre", "ohhell", "whist"][n % 5]); kt.autoplay(); };
  start();
  setInterval(() => { if (kt.screen === "sheet") kt.ACT.next(); else if (kt.screen !== "table") start(); }, 250);
  setInterval(() => { kt.S.opt.theme = free[++played.themes % free.length]; kt.applyLook(); }, 45000);
});

// ms of main-thread work per frame in a Chromium trace
function frames(trace) {
  const ev = JSON.parse(trace).traceEvents, main = ev.find((e) => e.name === "thread_name" && e.args.name === "CrRendererMain");
  const on = (e) => e.pid === main.pid && e.tid === main.tid;
  const tasks = ev.filter((e) => on(e) && e.ph === "X" && e.name === "ThreadControllerImpl::RunTask").sort((x, y) => x.ts - y.ts);
  const starts = ev.filter((e) => on(e) && e.name === "BeginMainThreadFrame").map((e) => e.ts).sort((x, y) => x - y);
  const out = []; let k = 0, prev = -Infinity;
  for (const f of starts) {
    let render = 0, longest = 0;
    while (k < tasks.length && tasks[k].ts <= f) {
      const t = tasks[k++];
      if (t.ts + t.dur >= f) render = t.dur; else if (t.ts > Math.max(prev, f - 16667)) longest = Math.max(longest, t.dur);
    }
    out.push((render + longest) / 1000); prev = f;
  }
  return out.sort((x, y) => x - y);
}
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
const rows = [];
console.log(`chromium, ${MIN} min   min  frames   p50    p95    p99    max  (ms of work)   heap MB  DOM nodes  hands`);
for (let m = 1; m <= MIN; m++) {
  await page.waitForTimeout(60000 - SAMPLE);
  await b.startTracing(page, { categories: ["toplevel", "disabled-by-default-devtools.timeline.frame"] });
  await page.waitForTimeout(SAMPLE);
  const ms = frames(await b.stopTracing());
  await cdp.send("HeapProfiler.collectGarbage");
  const heap = (await cdp.send("Performance.getMetrics")).metrics.find((x) => x.name === "JSHeapUsedSize").value / 1048576;
  const [dom, hands] = await page.evaluate(() => [document.getElementsByTagName("*").length, kt.S.hands]);
  const row = { m, n: ms.length, p50: pct(ms, 0.5), p95: pct(ms, 0.95), p99: pct(ms, 0.99), max: ms.at(-1) ?? 0, heap, dom, hands };
  rows.push(row);
  console.log(`${" ".repeat(21)}${String(m).padStart(3)} ${String(row.n).padStart(7)} ${row.p50.toFixed(2).padStart(6)} ${row.p95.toFixed(2).padStart(6)} ${row.p99.toFixed(2).padStart(6)} ${row.max.toFixed(1).padStart(6)}   ${heap.toFixed(1).padStart(8)}  ${String(dom).padStart(9)}  ${String(hands).padStart(5)}`);
}
const played = await page.evaluate(() => window.played), hands = rows.at(-1).hands;
await b.close(); server.close();
const all95 = Math.max(...rows.map((r) => r.p95)), grow = rows.at(-1).heap / rows[0].heap - 1;
console.log(`worst p95 ${all95.toFixed(2)} ms (120 Hz budget ${BUDGET.toFixed(1)}) · heap ${(grow * 100).toFixed(0)}% from minute 1 · ${hands} hands over ${played.games} games, ${played.themes} theme changes · page errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join("\n"));
if (check && (all95 > BUDGET || grow > 0.25 || errors.length || hands < MIN * 10)) { console.log("FAIL"); process.exit(1); } // and it must really have played
