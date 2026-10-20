// Smoke test: every screen in WebKit and Chromium at iPhone size, plus a whole hand of each game (Hearts, Spades, Euchre,
// Oh Hell, Whist). Fails on a page error, a screen that doesn't show, a button off screen or smaller than a tap target (44pt;
// 64pt in Comfort), a hand card whose visible strip is smaller than a tap target, any overlay between the deal and the last
// trick (DESIGN R2), or a human seat that gets played for them while they think (R10). Accessibility (docs/OVERHAUL.md W3):
// focus lands on each new screen and in each dialog and comes back; every choice row is a named radio group and every
// select has a label; Comfort's small print is 7:1; no seat is read as just a name; the live region never replaces a
// sentence before it could be read; during every hand no trick card covers a seat and no hand card's corner is covered;
// the pass-the-phone cover hides the hand; End this game asks first; blind nil deals your cards face down.
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
  // no two controls on top of each other (hand cards overlap on purpose; the pinned Deal bar floats over the page on purpose);
  // an open dialog is checked on its own
  const open = !document.getElementById("dialog").hidden;
  const ctl = [...document.querySelectorAll(open ? "#dialog button" : `#${id} button, #${id} select`)].filter((e) => e.offsetParent && !e.closest("#hand, #trick, .hero, #handoff, .dealbar"));
  const label = (e) => (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 20);
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++)
    if (!ctl[i].contains(ctl[j]) && !ctl[j].contains(ctl[i]) && hit(ctl[i].getBoundingClientRect(), ctl[j].getBoundingClientRect())) out.push(`overlap: ${label(ctl[i])} / ${label(ctl[j])}`);
  // at the table, nothing sits on your hand or on the cards in the middle
  if (id === "table" && !open) {
    const hand = document.getElementById("hand").getBoundingClientRect(), trick = [...document.querySelectorAll("#trick .card")].map((e) => e.getBoundingClientRect());
    for (const e of document.querySelectorAll("#seats .seat, #center > *, #say > *")) {
      const q = e.getBoundingClientRect();
      if (hand.height && hit(q, hand)) out.push(`covers the hand: ${label(e)}`);
      if (trick.some((t) => hit(q, t))) out.push(`covers the trick: ${label(e)}`);
    }
  }
  return out;
};
// VoiceOver: each row of choices is a named radio group, each select has a label, each switch has a name; on a new screen the
// focus is on that screen (its heading), not on a button of the screen that went away
const A11Y = (id) => {
  const root = document.getElementById(id), out = [], name = (e) => e.getAttribute("aria-label") || (e.getAttribute("aria-labelledby") && document.getElementById(e.getAttribute("aria-labelledby"))?.textContent.trim());
  for (const s of root.querySelectorAll(".seg")) if (s.getAttribute("role") !== "radiogroup" || (!name(s) && id !== "howto")) out.push(`choice row without a group name: ${s.textContent.slice(0, 30)}`);
  for (const s of root.querySelectorAll(".seg button")) if (s.getAttribute("role") !== "radio" || !s.hasAttribute("aria-checked")) out.push(`choice not a radio: ${s.textContent}`);
  for (const s of root.querySelectorAll("select")) if (!s.id || !root.querySelector(`label[for="${s.id}"]`)) out.push(`select without a label: ${s.options[0]?.text}`);
  for (const s of root.querySelectorAll("[role=switch]")) if (!s.getAttribute("aria-label")) out.push("switch without a name");
  if (!root.contains(document.activeElement)) out.push(`focus left on ${document.activeElement?.tagName} "${(document.activeElement?.textContent || "").trim().slice(0, 20)}"`);
  // Comfort's 7:1 floor (DESIGN §6.1) for the small print on paper; 4.5:1 otherwise
  const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const probe = document.createElement("i"); probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--paper"); document.body.appendChild(probe);
  const paper = lum(getComputedStyle(probe).color); probe.remove();
  const floor = document.documentElement.classList.contains("comfort") ? 7 : 4.5;
  for (const e of root.querySelectorAll(".paper .muted")) { const L = lum(getComputedStyle(e).color), k = (Math.max(L, paper) + 0.05) / (Math.min(L, paper) + 0.05); if (k < floor) { out.push(`small print ${k.toFixed(1)}:1 < ${floor}:1: ${e.textContent.slice(0, 24)}`); break; } }
  return out;
};
// the table for VoiceOver: no seat is just its name; the score chip says the score; trick cards say who played them
const TABLE_A11Y = () => {
  const out = [];
  for (const s of document.querySelectorAll("#seats .seat")) { const said = s.querySelector(".vh")?.textContent || "", nm = s.querySelector("b").textContent; if (said.replace(/[.\s]/g, "") === nm.replace(/\s/g, "") || said.length < nm.length + 6) out.push(`seat read as just "${said}"`); }
  if (!/^Score: .*\d/.test(document.getElementById("scoreChip").getAttribute("aria-label") || "")) out.push("score chip doesn't say the score");
  for (const c of document.querySelectorAll("#trick .card")) if (c.getAttribute("role") !== "img" || !/^.+: .+ of /.test(c.getAttribute("aria-label"))) out.push(`trick card label "${c.getAttribute("aria-label")}"`);
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
  // every sentence the live region shows, with when it showed (P0-3: none may be replaced before it could be read)
  await page.evaluate(() => { window.saidLog = []; new MutationObserver(() => saidLog.push([performance.now(), document.getElementById("announce").textContent])).observe(document.getElementById("announce"), { childList: true, characterData: true, subtree: true }); });
  const report = async (id, bad) => {
    bad = [...bad, ...errors.splice(0)].filter(Boolean);
    console.log(`${name.padEnd(9)} ${id.padEnd(14)} ${bad.length ? "FAIL " + bad.join(" | ") : "ok"}`);
    if (bad.length) failed++;
    if (shots) await page.screenshot({ path: join(shots, `${name}-${id}${COMFORT ? "-comfort" : ""}${SE ? "-se" : ""}.png`) });
  };
  // a keyboard walk: Enter on "Games and rules" lands the focus on the cupboard's heading, not on a button that's gone
  await page.evaluate(() => kt.go("title"));
  await page.waitForTimeout(300);
  await page.focus("[data-to=picker]"); await page.keyboard.press("Enter"); await page.waitForTimeout(400);
  await report("keyboard", [await page.evaluate(() => (document.getElementById("picker").contains(document.activeElement) && document.activeElement.matches("h1") ? null : `focus on ${document.activeElement.outerHTML.slice(0, 50)} after opening the cupboard`))]);
  for (const id of SCREENS) {
    await page.evaluate(async (id) => { await kt.go(id); }, id);
    await page.waitForTimeout(300);
    const shown = await page.evaluate((id) => document.getElementById(id).classList.contains("on") && document.getElementById(id).innerHTML.length > 50, id);
    await report(id, [!shown && "not shown", ...(await page.evaluate(AUDIT, id)), ...(await page.evaluate(A11Y, id))]);
  }
  // a dialog takes the focus, is named by its heading, closes with Escape and gives the focus back
  await page.evaluate(() => kt.go("title")); await page.waitForTimeout(300);
  await page.focus("[data-act=restore]"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  const inDialog = await page.evaluate(() => [document.getElementById("dialog").contains(document.activeElement), document.getElementById("dialog").getAttribute("aria-labelledby") === "dialogTitle" && !!document.getElementById("dialogTitle"), document.querySelector("main").inert]);
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  const back = await page.evaluate(() => document.activeElement?.dataset.act === "restore" && !document.querySelector("main").inert);
  await report("dialog-focus", [!inDialog[0] && "focus not in the dialog", !inDialog[1] && "dialog not labelled by its heading", !inDialog[2] && "the page behind the dialog isn't inert", !back && "focus not back on the button that opened it"]);
  for (const game of ["hearts", "spades", "euchre", "ohhell", "whist"]) {
    await page.evaluate((g) => kt.newGame(g), game);
    // R10: the human's turn waits as long as they need
    await page.waitForFunction(() => kt.G && kt.pending && kt.pending.seat === 0, null, { timeout: 20000 }); // the game is asking the player
    const before = await page.evaluate(() => JSON.stringify([kt.G.st.phase, kt.G.st.history.length, kt.G.st.bids]));
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => JSON.stringify([kt.G.st.phase, kt.G.st.history.length, kt.G.st.bids]));
    await report(`${game}-table`, [before !== after && "the table moved on while the player was thinking", ...(await page.evaluate(AUDIT, "table")), ...(await page.evaluate(HAND)), ...(await page.evaluate(TABLE_A11Y))]);
    // R2: a whole hand, watched every 50 ms for anything popping up between the deal and the last trick; P1-1: no trick card
    // on a seat and no hand card's corner covered at any moment; P1-4: the score sheet opened from the chip near the end of the
    // hand closes itself when the hand ends
    const seen = await page.evaluate(async () => {
      const seen = new Set(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      kt.autoplay();
      let peeked = false;
      for (let t = 0; t < 600 && kt.screen === "table"; t++) {
        if (!peeked && kt.G.st.hands[0].length <= 1) { peeked = true; kt.ACT.peek(); }
        if (t > 2 && !document.getElementById("dialog").hidden && !kt.peekOpen) seen.add("overlay: dialog");
        if (document.querySelector(".screen.on #consentCard")) seen.add("overlay: consent card");
        const tr = [...document.querySelectorAll("#trick .card")].filter((e) => !e.getAnimations().length).map((e) => e.getBoundingClientRect()); // a card flying in or swept to the winner passes over plates
        for (const s of document.querySelectorAll("#seats .seat")) if (tr.some((q) => hit(q, s.getBoundingClientRect()))) seen.add(`a trick card covers ${s.querySelector("b").textContent}`);
        for (const c of document.querySelectorAll("#hand .card")) { const q = c.getBoundingClientRect(); if (document.elementFromPoint(q.left + 8, q.top + 10)?.closest(".card") !== c && !document.querySelector("#dialog:not([hidden])")) seen.add(`hand card ${c.dataset.card}'s corner is covered`); }
        await sleep(50);
      }
      if (!document.getElementById("dialog").hidden) seen.add("the score sheet stayed open after the hand");
      return [...seen, ...kt.blocked.map((b) => "overlay: blocked: " + b), ...(kt.screen === "sheet" ? [] : ["the hand never finished"])];
    });
    await report(`${game}-hand`, seen);
    await report(`${game}-sheet`, await page.evaluate(AUDIT, "sheet"));
    await page.evaluate(() => { kt.G.over = 0; kt.ACT.next(); });
    await page.waitForTimeout(300);
    await report(`${game}-results`, await page.evaluate(AUDIT, "results"));
  }
  // P0-3: over all those hands, the live region never replaced a sentence before it could be read
  await report("announce", await page.evaluate(() => { const out = []; for (let i = 1; i < saidLog.length; i++) { const [t0, s] = saidLog[i - 1], dt = saidLog[i][0] - t0; if (s && dt < kt.readMs(s) - 60) out.push(`"${s.slice(0, 40)}" replaced after ${dt | 0} ms`); } return out.length ? out.slice(0, 3).concat(`${out.length} of ${saidLog.length}`) : saidLog.length < 5 ? ["almost nothing was announced"] : []; }));
  // P0-1: pass and play: with the cover up, the hand is gone, the cover is what's under a finger, and the table can't be reached
  const cover = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), out = [];
    kt.S.last.seats = ["you", "human", "bot", "bot"]; kt.newGame("hearts");
    for (let t = 0; t < 200 && !(kt.pending?.seat === 0); t++) await sleep(50);
    const hand = document.getElementById("hand").getBoundingClientRect();
    kt.pending.resolve(kt.pending.kind === "pass" ? kt.pending.legal.slice(0, 3) : kt.pending.legal[0]);
    for (let t = 0; t < 200 && document.getElementById("handoff").hidden; t++) await sleep(50);
    if (document.getElementById("handoff").hidden) return ["the cover never came up"];
    let at = null; // past the screens' cross-fade: the last screen fades out over the table for a moment
    for (let t = 0; t < 40 && !at?.closest("#table"); t++) { await sleep(100); at = document.elementFromPoint(hand.left + hand.width - 20, hand.top + 20); }
    if (!at?.closest("#handoff")) out.push(`over the hand is ${at?.outerHTML.slice(0, 40)}`);
    if (document.querySelectorAll("#hand .card").length) out.push("hand cards still in the page under the cover");
    if (!document.getElementById("seats").inert || !document.getElementById("hand").inert) out.push("the table isn't inert under the cover");
    if (!document.getElementById("handoff").contains(document.activeElement)) out.push("focus isn't on the cover");
    document.querySelector("[data-act=handoff]").click(); await sleep(200);
    if (kt.G.viewer !== 1 || !document.querySelectorAll("#hand .card").length) out.push("Player 2's cards didn't show after the cover");
    kt.S.last.seats = ["you", "bot", "bot", "bot"];
    return out;
  });
  await report("pass-and-play", cover);
  // P1-7: End this game asks first; R2: with blind nil open to you, your cards are dealt face down
  const asks = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), out = [];
    kt.S.last.preset = "kitchen"; kt.newGame("spades");
    kt.G.totals = { score: [0, 150], bags: [0, 0] }; kt.ACT.next(); // a new hand, your team 150 behind
    for (let t = 0; t < 200 && !(kt.pending?.seat === 0); t++) await sleep(50);
    const cards = [...document.querySelectorAll("#hand .card")];
    if (!cards.length || cards.some((c) => c.getAttribute("aria-label") !== "Face-down card")) out.push("cards not face down with blind nil open");
    if (!document.querySelector("#center [data-act=look]") || !document.querySelector('#center [data-act=bid][data-v=blind]')) out.push("no Look at my cards / Bid blind nil");
    document.querySelector("#center [data-act=look]")?.click(); await sleep(100);
    if (document.querySelector("#hand .card")?.getAttribute("aria-label") === "Face-down card" || document.querySelector('#center [data-v=blind]')) out.push("still face down after Look at my cards");
    kt.ACT.menu(); await sleep(100);
    document.querySelector("[data-dlg=quit]").click(); await sleep(100);
    if (!/End this game\?/.test(document.getElementById("dialogTitle")?.textContent || "") || !kt.G) out.push("End this game didn't ask first");
    kt.dialog.done?.(null); await sleep(100);
    kt.S.last.preset = "standard";
    return out;
  });
  await report("asks-first", asks);
  await b.close();
}
server.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log("smoke ok");
