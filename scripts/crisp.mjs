// Card sharpness at iPhone density (402x874 @3x), read from the screenshot's device pixels, WebKit and Chromium,
// Comfort off and on. Cards are inline SVG: a blurred card means a layer rastered at the wrong scale or an off-pixel transform.
//   node scripts/crisp.mjs              table: browser x comfort -> worst card edge and index glyph (device px, 10-90%)
//   node scripts/crisp.mjs --check 2    exit 1 if any measured edge is wider than 2 device px (CI gate)
// Per card: the left edge (several rows at mid-height, where the card itself is on top) and the corner index (rows through
// the rank); each takes its sharpest strong row, then the worst card counts. Haze, transitions and animations are off.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { inflateSync } from "node:zlib";
import { webkit, chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const f = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0);
const check = process.argv.includes("--check") ? +process.argv[process.argv.indexOf("--check") + 1] : null;

// 8-bit RGB/RGBA non-interlaced PNG (what Playwright writes) -> luminance per device pixel
function lumaOf(buf) {
  let i = 8, w, h, ct; const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString("latin1", i + 4, i + 8), d = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } else if (type === "IDAT") idat.push(d);
    i += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, st = w * bpp, raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(st * h), L = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], o = y * st, r0 = y * (st + 1) + 1;
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - st + x] : 0, c = x >= bpp && y ? px[o - st + x - bpp] : 0, p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      px[o + x] = raw[r0 + x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
    }
    for (let x = 0; x < w; x++) L[y * w + x] = 0.2126 * px[o + x * bpp] + 0.7152 * px[o + x * bpp + 1] + 0.0722 * px[o + x * bpp + 2];
  }
  return { w, h, L };
}
// same as Glimmerwood's crisp.mjs: the steepest step, widened while neighbouring steps are >10% of it; 10-90 width (+1)
const widthOf = (p) => {
  let k = 0; for (let i = 1; i < p.length - 1; i++) if (Math.abs(p[i + 1] - p[i]) > Math.abs(p[k + 1] - p[k])) k = i;
  const up = p[k + 1] > p[k], min = Math.max(1, Math.abs(p[k + 1] - p[k]) * 0.1), rise = (i, j) => (up ? p[j] - p[i] : p[i] - p[j]) > min;
  let a = k, z = k + 1;
  while (a > 0 && rise(a - 1, a)) a--; while (z < p.length - 1 && rise(z, z + 1)) z++;
  const lo = p[a] + (p[z] - p[a]) * 0.1, hi = p[a] + (p[z] - p[a]) * 0.9; let n = 0;
  for (let i = a; i <= z; i++) if (p[i] > Math.min(lo, hi) && p[i] < Math.max(lo, hi)) n++;
  return { w: n + 1, step: Math.abs(p[z] - p[a]), prof: [...p.slice(Math.max(0, a - 3), z + 4)].map(Math.round).join(" ") };
};

// in the page: for each card on the table and in the hand, the rows (CSS px) to scan for its left edge and its corner index
const PROBES = () => {
  const out = [];
  for (const el of document.querySelectorAll("#trick .card, #hand .card")) {
    const q = el.getBoundingClientRect(), m = new DOMMatrix(getComputedStyle(el).transform), t = Math.atan2(m.b, m.a);
    const w = el.offsetWidth, h = el.offsetHeight, cx = q.left + q.width / 2, cy = q.top + q.height / 2;
    const at = (u, v) => [cx + (u - 0.5) * w * Math.cos(t) - (v - 0.5) * h * Math.sin(t), cy + (u - 0.5) * w * Math.sin(t) + (v - 0.5) * h * Math.cos(t)];
    const mine = ([x, y]) => document.elementFromPoint(x, y)?.closest(".card") === el;
    const edge = [], glyph = [];
    for (let v = 0.3; v <= 0.7; v += 0.02) { const p = at(0, v), inside = at(0.06, v); if (mine(inside)) edge.push([p[0] - 6, p[0] + 6, p[1]]); }
    for (let v = 0.1; v <= 0.22; v += 0.01) { const a = at(0.04, v), b = at(0.32, v); if (mine(at(0.18, v))) glyph.push([a[0], b[0], (a[1] + b[1]) / 2]); }
    out.push({ card: (el.closest("#trick") ? "table " : "hand ") + el.dataset.card, edge, glyph });
  }
  return out;
};

async function measure(bt, comfort) {
  const b = await bt.launch();
  const page = await b.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, reducedMotion: "reduce" });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((comfort) => { // the same deal every run, and the save we want
    let a = 7; const r = () => (a = (a * 16807) % 2147483647);
    Math.random = () => r() / 2147483647; crypto.getRandomValues = (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = r(); return arr; };
    localStorage.setItem("kt.save", JSON.stringify({ reset: 1, opt: { comfort } }));
  }, comfort);
  await page.goto(`http://localhost:${server.address().port}/proto/index.html?debug&fast`);
  await page.waitForFunction(() => window.kt, null, { timeout: 15000 });
  // play seat 0 by hand until it is asked for a card with three cards already on the table. Whoever deals first (it comes from the
  // seed) and however the cards fall, a hand can pass with seat 0 never playing last, so finished hands deal the next one
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    kt.newGame("hearts");
    for (let t = 0; t < 6000; t++) {
      const p = kt.pending;
      if (p && p.kind === "play" && kt.G.st.trick.length === 3) return;
      if (p) p.resolve(p.kind === "pass" ? p.legal.slice(0, 3) : p.legal[0]);
      else if (kt.screen === "sheet") kt.ACT.next();
      else if (kt.screen === "results") kt.newGame("hearts");
      await sleep(10);
    }
    throw new Error("never reached a full trick on seat 0's turn");
  });
  await page.addStyleTag({ content: "#haze { display: none !important } *, *::before, *::after { transition: none !important; animation: none !important }" });
  await page.evaluate(async () => { document.getAnimations().forEach((a) => a.finish()); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
  const probes = await page.evaluate(PROBES), { w, L } = lumaOf(await page.screenshot());
  await b.close();
  const dpr = w / 402, row = (x0, x1, y) => { const Y = Math.round(y * dpr), X0 = Math.round(x0 * dpr), X1 = Math.round(x1 * dpr); return L.subarray(Y * w + X0, Y * w + X1); };
  const sharpest = (rows, minStep) => rows.map((r) => widthOf(row(...r))).filter((r) => r.step > minStep).sort((x, y) => x.w - y.w)[0];
  let edge = { w: 0 }, glyph = { w: 0 }, n = 0;
  for (const p of probes) {
    const e = sharpest(p.edge, 30), g = sharpest(p.glyph, 80); // the card stroke against felt or another card; ink on cream
    if (e) { n++; if (e.w > edge.w) edge = { ...e, card: p.card }; }
    if (g) { n++; if (g.w > glyph.w) glyph = { ...g, card: p.card }; }
  }
  return { dpr, cards: probes.length, n, edge, glyph, errors };
}

let fail = false;
console.log("browser   comfort  dpr  cards  edge  index   (device px, 10-90%; crisp <= 2)");
for (const [name, bt] of [["webkit", webkit], ["chromium", chromium]]) for (const comfort of [false, true]) {
  const r = await measure(bt, comfort);
  console.log(`${name.padEnd(9)} ${(comfort ? "on" : "off").padEnd(8)} ${r.dpr}    ${String(r.cards).padStart(3)}  ${String(r.edge.w).padStart(4)}  ${String(r.glyph.w).padStart(5)}` + (r.errors.length ? `   errors: ${r.errors.join(" | ")}` : ""));
  const bad = check != null && (r.edge.w > check || r.glyph.w > check || !r.edge.card || !r.glyph.card || r.errors.length);
  if (bad || check == null) console.log(`  worst edge ${r.edge.card}: ${r.edge.prof}\n  worst index ${r.glyph.card}: ${r.glyph.prof}`);
  if (bad) fail = true;
}
server.close();
if (fail) { console.log(`FAIL: a card edge or index is wider than ${check} device px, nothing was measured, or the page threw`); process.exit(1); }
