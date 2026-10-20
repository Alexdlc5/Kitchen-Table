// Every card face, checked in a real browser: nothing in the middle of a card may touch either corner index (rank + suit),
// so the card reads cleanly however much of it shows in a fanned hand. Writes a contact sheet with --sheet <file.png>.
//   node scripts/check-cards.mjs [--sheet cards.png] [--four]
import { readFileSync } from "node:fs";
import { webkit } from "playwright";
import { face } from "../proto/art.js";

const four = process.argv.includes("--four"), sheet = process.argv.includes("--sheet") ? process.argv[process.argv.indexOf("--sheet") + 1] : null;
const cards = [..."SHDC"].flatMap((s) => [..."23456789TJQKA"].map((r) => r + s)).concat(["BJ", "LJ"]);
const b = await webkit.launch(), page = await b.newPage({ viewport: { width: 1400, height: 1200 } });
// the faces in the fonts the app ships (build-web.mjs bundles them), not whatever the machine falls back to: a wider fallback
// on a CI runner puts the "10" and the Q's letter on the index when the real Alegreya never would
const font = (pkg, fam, w) => `@font-face{font-family:"${fam}";font-weight:${w};src:url(data:font/woff2;base64,${readFileSync(new URL(`../node_modules/@fontsource/${pkg}/files/${pkg}-latin-${w}-normal.woff2`, import.meta.url)).toString("base64")}) format("woff2")}`;
await page.setContent(`<style>${font("alegreya-sans", "Alegreya Sans", 700)}${font("alegreya", "Alegreya", 700)}body{margin:8px;background:#6e4426;display:flex;flex-wrap:wrap;gap:6px}svg{width:100px;height:140px}</style>` +
  cards.map((c) => `<div data-c="${c}">${face(c, { four })}</div>`).join(""));
if (!(await page.evaluate(async () => { await Promise.all([document.fonts.load('700 30px "Alegreya Sans"'), document.fonts.load('700 30px "Alegreya"')]); await document.fonts.ready; return document.fonts.check('700 30px "Alegreya Sans"') && document.fonts.check('700 30px "Alegreya"'); }))) throw new Error("the card fonts didn't load");
const bad = await page.evaluate(() => {
  const out = [], hit = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;
  for (const d of document.querySelectorAll("[data-c]")) {
    const svg = d.querySelector("svg"), kids = [...svg.children].slice(1); // [0] is the card stock
    const box = (e) => { const q = e.getBoundingClientRect(), o = svg.getBoundingClientRect(); return { x: q.x - o.x, y: q.y - o.y, width: q.width, height: q.height }; };
    const idx = kids.filter((e) => e.matches("[data-idx]")), mid = kids.filter((e) => !e.matches("[data-idx]"));
    for (const i of idx) for (const m of mid) if (hit(box(i), box(m))) out.push(`${d.dataset.c}: ${m.tagName} overlaps the corner index`);
    for (const e of kids) { const q = box(e); if (q.x < 0 || q.y < 0 || q.x + q.width > 100.5 || q.y + q.height > 140.5) out.push(`${d.dataset.c}: ${e.tagName} runs off the card`); }
  }
  return out;
});
if (sheet) await page.screenshot({ path: sheet, fullPage: true });
await b.close();
if (bad.length) { console.log(bad.join("\n")); console.log(`${bad.length} card problem(s)`); process.exit(1); }
console.log(`cards ok: ${cards.length} faces, nothing overlaps an index`);
