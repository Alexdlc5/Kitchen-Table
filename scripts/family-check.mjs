// The family-table protocol (proto/family.js) in two browser tabs: the web stand-in for Game Center is a BroadcastChannel.
// Two "devices" sit down at Hearts with two bots: two full hands must end with the same score on both and no desync, then
// the guest closes its tab mid-hand and the host finishes the hand with a bot in that seat.
//   node scripts/family-check.mjs
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
const server = createServer((req, res) => {
  const f = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0);
const url = `http://localhost:${server.address().port}/proto/index.html?debug&fast`;
const fail = (msg) => { console.error("FAIL: " + msg); process.exit(1); };

const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
const errors = [], open = async () => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(url); await p.waitForFunction(() => window.kt?.screen === "title");
  await p.click("[data-act=family]");
  return p;
};
const [a, b] = [await open(), await open()];
// whoever is the guest, answer every prompt with the first legal choice; the host's bots do the rest
const autoplay = (p) => p.evaluate(() => { window.kt.iv = setInterval(() => { const q = window.kt.pending; if (q) q.resolve(q.kind === "pass" ? q.legal.slice(0, 3) : q.kind === "moon" ? "add" : q.legal[0]); }, 20); });
await Promise.all([a, b].map(autoplay));
const hand = async () => {
  for (const p of [a, b]) await p.waitForFunction(() => window.kt.screen === "sheet", null, { timeout: 60000 }).catch(() => fail("a hand did not finish: " + errors.join("; ")));
  const [x, y] = await Promise.all([a, b].map((p) => p.evaluate(() => ({ score: window.kt.G.totals.score.join(","), host: window.kt.net?.host, desyncs: window.kt.net?.desyncs }))));
  if (x.score !== y.score) fail(`scores differ: ${x.score} / ${y.score}`);
  if (x.host === y.host) fail("both tabs think they are the " + (x.host ? "host" : "guest"));
  if (x.desyncs || y.desyncs) fail("desync");
  console.log(`hand: both tabs score ${x.score}`);
  return x.host ? [a, b] : [b, a];
};
let [host, guest] = await hand();
for (const p of [guest, host]) await p.click("[data-act=next]"); // the guest waits for the host's deal
[host, guest] = await hand();
for (const p of [guest, host]) await p.click("[data-act=next]");
await host.waitForFunction(() => window.kt.G.st.history.length >= 8);
await guest.close({ runBeforeUnload: true });
await host.waitForFunction(() => window.kt.screen === "sheet", null, { timeout: 60000 }).catch(() => fail("the host did not finish the hand after the guest left"));
console.log("guest left mid-hand: a bot took the seat and the hand finished");
if (errors.length) fail(errors.join("; "));
await browser.close(); server.close();
console.log("family table: ok");
