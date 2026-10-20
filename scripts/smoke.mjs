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
const shots = arg("--shots"), LANG = arg("--lang"), TEXT = arg("--text"), SE = process.argv.includes("--se"), COMFORT = process.argv.includes("--comfort"), IPAD = process.argv.includes("--ipad");
// the fonts the app ships (build-web.mjs bundles these files), served here in place of Google Fonts, so every machine lays out the
// same text the phone does. --no-fonts: none at all, the browser's fallbacks (wider on Linux), to shake out layouts that only just fit
const NOFONTS = process.argv.includes("--no-fonts");
const FACES = [["alegreya", "Alegreya", 500, "normal"], ["alegreya", "Alegreya", 700, "normal"], ["alegreya", "Alegreya", 400, "italic"],
  ["alegreya-sans", "Alegreya Sans", 400, "normal"], ["alegreya-sans", "Alegreya Sans", 500, "normal"], ["alegreya-sans", "Alegreya Sans", 700, "normal"], ["alegreya-sans", "Alegreya Sans", 800, "normal"]];
const fonts = (page) => page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => (NOFONTS ? r.abort() : r.fulfill({ contentType: "text/css",
  body: FACES.map(([f, fam, w, s]) => `@font-face { font-family: "${fam}"; font-weight: ${w}; font-style: ${s}; font-display: block; src: url(http://localhost:${server.address().port}/node_modules/@fontsource/${f}/files/${f}-latin-${w}-${s}.woff2) format("woff2"); }`).join("\n") })));
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
  const ctl = [...document.querySelectorAll(open ? "#dialog button" : `#${id} button, #${id} select, #${id} .bar > .pill`)].filter((e, i, a) => a.indexOf(e) === i && e.offsetParent && !e.closest("#hand, #trick, .hero, #handoff, .dealbar"));
  const label = (e) => (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 20);
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++)
    if (!ctl[i].contains(ctl[j]) && !ctl[j].contains(ctl[i]) && hit(ctl[i].getBoundingClientRect(), ctl[j].getBoundingClientRect())) out.push(`overlap: ${label(ctl[i])} / ${label(ctl[j])}`);
  // at the table, nothing sits on your hand or on the cards in the middle
  if (id === "table" && !open) {
    const hand = document.getElementById("hand").getBoundingClientRect(), trick = [...document.querySelectorAll("#trick .card")].map((e) => e.getBoundingClientRect());
    for (const e of document.querySelectorAll("#seats .seat, #center > *, #say > *, #trump > *")) {
      const q = e.getBoundingClientRect();
      if (hand.height && hit(q, hand)) out.push(`covers the hand: ${label(e)}`);
      if (trick.some((t) => hit(q, t))) out.push(`covers the trick: ${label(e)}`);
    }
    out.push(...SEATS_CLEAR());
  }
  return out;
};
// passover 2: nothing in the middle (a pad, the say line, the turned card, the chip) sits on a seat, and every seat's name shows
function SEATS_CLEAR() {
  const out = [], hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
  const seats = [...document.querySelectorAll("#seats .seat")].filter((s) => getComputedStyle(s).visibility !== "hidden"); // your plate steps aside for your own panel
  for (const e of document.querySelectorAll("#center > *, #say > *, #trump > *, #scoreChip"))
    for (const s of seats) if (hit(e.getBoundingClientRect(), s.getBoundingClientRect())) out.push(`covers ${s.querySelector("b").textContent}'s seat: ${(e.getAttribute("aria-label") || e.textContent).trim().slice(0, 24)}`);
  for (const s of seats) { // a card in flight (dealt, or swept to the winner) passes over plates on purpose
    const b = s.querySelector("b"), q = b.getBoundingClientRect(), at = q.width && document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    if (at && at !== b && !at.closest("#trick .card, #hand .card")?.getAnimations().length) out.push(`${b.textContent}'s name is covered by ${at.className?.baseVal ?? at.className ?? at.tagName}`);
  }
  return out;
}
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
  await fonts(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(`window.SEATS_CLEAR = ${SEATS_CLEAR.toString()};`);
  if (COMFORT || TEXT) await page.addInitScript(([c, t]) => localStorage.setItem("kt.save", JSON.stringify({ reset: 1, opt: { comfort: c, ...(t ? { text: t, textAuto: false } : {}) } })), [COMFORT, TEXT]);
  await page.goto(`http://localhost:${server.address().port}/proto/index.html?debug&fast&cut${LANG ? "&lang=" + LANG : ""}`);
  await page.waitForFunction(() => window.kt, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  // every sentence the live region shows is logged with when it was written (kt.said.log); P0-3: none may be replaced before it
  // could be read. And nothing else may write the live region behind the queue's back.
  await page.evaluate(() => { window.writes = 0; new MutationObserver(() => writes++).observe(document.getElementById("announce"), { childList: true, characterData: true, subtree: true }); });
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
    // F1: in a game that deals by the cut, the fingerprint comes first; a tap 30% along the deck cuts there, and that's the deal
    const shown = await page.evaluate(async () => document.querySelector("#dialog:not([hidden]) [data-dlg=cut]") && { fp: document.querySelector("#dialog .fp").textContent.replace(/\s/g, ""), seed: kt.G.nextSeed, n: +document.querySelector("[data-dlg=cut]").dataset.n, focused: document.getElementById("dialog").contains(document.activeElement) });
    let cutBad = [];
    if (shown) {
      const r = await (await page.$("[data-dlg=cut]")).boundingBox();
      await page.mouse.click(r.x + r.width * 0.3, r.y + r.height / 2);
      await page.waitForFunction(() => kt.G.st && !kt.G.nextSeed, null, { timeout: 5000 });
      cutBad = await page.evaluate(async (s) => {
        const { fingerprint } = await import("./dealer.js"), cards = await import("./cards.js"), st = kt.G.st, want = Math.round(0.3 * (s.n - 2)) + 1;
        const deck = st.game === "euchre" ? (await import("./euchre.js")).DECK : cards.newDeck(), size = { euchre: 5, ohhell: st.size }[st.game] ?? 13;
        return [fingerprint(s.seed).replace(/\s/g, "") !== s.fp && "the fingerprint shown isn't the seed's", st.seed !== s.seed && "the deal used another seed", st.cut !== want && `cut ${st.cut}, tapped at ${want}`,
          // the engine's own deal for this seed, dealer and cut (the live hands may already have moved: a pickup, a lead)
          JSON.stringify(cards.dealOut(st.seed, st.dealer, deck, size, st.cut).hands) !== JSON.stringify((await import(`./${st.game}.js`)).newHand(st.rules, st.seed, st.dealer, undefined, st.handNo ?? 0, st.cut).hands) && "the hands aren't the cut deal", !s.focused && "focus not on the cut"];
      }, shown);
    }
    await report(`${game}-cut`, shown || game === "hearts" || game === "spades" ? cutBad : ["no cut offered"]); // Hearts and Spades cut once #16 lands
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
      let peeked = false, asked = false;
      for (let t = 0; t < 600 && kt.screen === "table"; t++) {
        if (!peeked && kt.G.st.hands[0].length <= 1) { peeked = true; kt.ACT.peek(); }
        // a Why? asked mid-hand: its answer covers no seat and no card, or opens on its own (and the bots wait)
        const why = !asked && t > 10 && document.getElementById("dialog").hidden && document.querySelector("#seats .seat:not([hidden]) .whytab:not([hidden])")?.closest(".seat");
        if (why) {
          asked = true; why.click(); // checked at once: under ?fast the next card (which ends a say-line answer) is only milliseconds away
          if (kt.dialogKind === "why") { const n = kt.G.st.history.length; await sleep(400); if (kt.G.st.history.length !== n) seen.add("the bots played on under a Why? answer"); kt.dialog.done(null); }
          else if (!document.querySelector("#say > *")) seen.add("Why? showed nothing");
          else for (const s of SEATS_CLEAR()) seen.add("the Why answer " + s);
        }
        if (t > 2 && !document.getElementById("dialog").hidden && !kt.peekOpen && kt.dialogKind !== "why") seen.add("overlay: dialog");
        if (document.getElementById("dialog").hidden) for (const s of SEATS_CLEAR()) seen.add(s);
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
    await report(`${game}-sheet`, [...(await page.evaluate(AUDIT, "sheet")), ...(await page.evaluate(() => { const h = kt.G.history.at(-1), t = document.getElementById("sheet").textContent; return [h.cut && !t.includes(`cut ${h.cut}`) && "the sheet doesn't print the cut", !t.replace(/\s/g, "").includes(String(h.fp).replace(/\s/g, "")) && "the sheet doesn't print the fingerprint"]; }))]);
    // reopening the app on the score sheet shows it again; it never scores the same hand twice
    await report(`${game}-reopen`, await page.evaluate(async () => { const n = kt.G.history.length, sc = JSON.stringify(kt.G.totals); kt.ACT.resume(); await new Promise((r) => setTimeout(r, 200)); return [kt.G.history.length !== n || JSON.stringify(kt.G.totals) !== sc ? "the hand was scored again" : null, kt.screen !== "sheet" ? `on ${kt.screen}, not the sheet` : null]; }));
    await page.evaluate(() => { kt.G.over = 0; kt.ACT.next(); });
    await page.waitForTimeout(300);
    await report(`${game}-results`, await page.evaluate(AUDIT, "results"));
  }
  // P0-3: over all those hands, the live region never replaced a sentence before it could be read
  await report("announce", await page.evaluate(() => {
    const log = kt.said.log, out = [];
    for (let i = 1; i < log.length; i++) { const [t0, s] = log[i - 1], dt = log[i][0] - t0; if (dt < kt.readMs(s) - 5) out.push(`"${s.slice(0, 40)}" replaced after ${dt | 0} ms`); }
    if (writes > log.length) out.push(`${writes - log.length} writes to the live region outside the queue`);
    return out.length ? out.slice(0, 3).concat(`${out.length} of ${log.length}`) : log.length < 5 ? ["almost nothing was announced"] : [];
  }));
  // P0-1: pass and play: with the cover up, the hand is gone, the cover is what's under a finger, and the table can't be reached
  const cover = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), out = [];
    kt.S.last.seats = ["you", "human", "bot", "bot"]; kt.newGame("hearts");
    document.querySelector("#dialog:not([hidden]) [data-dlg=cut]")?.click();
    for (let t = 0; t < 40 && !document.querySelectorAll("#hand .card").length; t++) await sleep(50);
    const hand = document.getElementById("hand").getBoundingClientRect();
    // whoever passes first (the first dealer comes from the seed): play your own turns until it's Player 2's and the cover is up
    for (let t = 0; t < 200 && document.getElementById("handoff").hidden; t++) { const p = kt.pending; if (p?.seat === 0) p.resolve(p.kind === "pass" ? p.legal.slice(0, 3) : p.legal[0]); await sleep(50); }
    if (document.getElementById("handoff").hidden) return ["the cover never came up"];
    let at = null; // past the screens' cross-fade: the last screen fades out over the table for a moment
    for (let t = 0; t < 40 && !at?.closest("#table"); t++) { await sleep(100); at = document.elementFromPoint(hand.left + hand.width - 20, hand.top + 20); }
    if (!at?.closest("#handoff")) out.push(`over the hand is ${at?.outerHTML.slice(0, 40)} (screen ${kt.screen}; on: ${[...document.querySelectorAll(".screen.on")].map((e) => e.id)}; visible: ${[...document.querySelectorAll(".screen")].filter((e) => getComputedStyle(e).visibility === "visible").map((e) => e.id + " " + getComputedStyle(e).opacity)})`);
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
    document.querySelector("#dialog:not([hidden]) [data-dlg=cut]")?.click(); await sleep(100);
    kt.G.totals = { score: [0, 150], bags: [0, 0] }; kt.ACT.next(); // a new hand, your team 150 behind
    await sleep(0); document.querySelector("#dialog:not([hidden]) [data-dlg=cut]")?.click();
    for (let t = 0; t < 200 && !(kt.pending?.seat === 0 && kt.G.st.totals.score[1] === 150); t++) await sleep(50); // asked in the new hand, not the last
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
  // R3: the blind nil exchange as shipped (Kitchen, 2 cards): bid blind nil face down, pick two cards, pass them, get two back
  const swap = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), out = [];
    kt.S.last.preset = "kitchen"; kt.newGame("spades");
    document.querySelector("#dialog:not([hidden]) [data-dlg=cut]")?.click(); await sleep(100);
    kt.G.totals = { score: [0, 150], bags: [0, 0] }; kt.ACT.next();
    await sleep(0); document.querySelector("#dialog:not([hidden]) [data-dlg=cut]")?.click();
    for (let t = 0; t < 200 && !(kt.pending?.seat === 0 && kt.pending.kind === "bid" && kt.G.st.totals.score[1] === 150); t++) await sleep(50);
    document.querySelector("#center [data-act=bid][data-v=blind]")?.click();
    for (let t = 0; t < 200 && !(kt.pending?.seat === 0 && kt.pending.kind === "exchange"); t++) await sleep(50);
    if (kt.pending?.kind !== "exchange") { kt.S.last.preset = "standard"; return [`no exchange after a blind nil (phase ${kt.G.st.phase})`]; }
    if (!/Pick 2 cards to pass to /.test(document.querySelector("#center .say")?.textContent || "")) out.push("no pick-2 panel");
    for (const c of [...document.querySelectorAll("#hand .card:not([disabled])")].slice(-2)) c.click();
    document.querySelector("#center [data-act=swap]")?.click();
    for (let t = 0; t < 200 && kt.G.st.phase === "exchange"; t++) await sleep(50);
    if (kt.G.st.phase === "exchange" || kt.G.st.received[0]?.length !== 2) out.push(`the exchange didn't finish (phase ${kt.G.st.phase})`);
    kt.S.last.preset = "standard";
    return out;
  });
  await report("blind-nil-swap", swap);
  // F2-F6: the Fair deal page from ledger.view(): 250 real deals from the real dealer fill every section with numbers
  const fair = await page.evaluate(async () => {
    const { newSeed } = await import("./dealer.js"), cards = await import("./cards.js"), ledger = await import("./ledger.js"), keep = kt.S.deals;
    kt.S.deals = [];
    for (let i = 0; i < 250; i++) { const h = cards.dealHands(newSeed(), 3, cards.newDeck()); kt.S.deals.push(ledger.entry({ hand: h[0], others: h.slice(1), game: i % 2 ? "spades" : "hearts", rules: { nil: 100 }, standing: ["ahead", "level", "behind"][i % 3] })); }
    await kt.go("stats"); await new Promise((r) => setTimeout(r, 300));
    const text = document.getElementById("stats").textContent, rows = document.querySelectorAll("#stats .bars .b").length;
    kt.S.deals = keep;
    return [/NaN|undefined/.test(text) && "NaN or undefined on the page", rows < 20 && `only ${rows} rows drawn`];
  });
  await report("fair-deal", [...fair, ...(await page.evaluate(AUDIT, "stats"))]);
  // P0: with VoiceOver on (the @capacitor/screen-reader plugin, stubbed here as the phone reports it), every sentence is
  // shown for its whole reading time and the bots wait for it: nothing is dropped, and the cards never outrun the words
  if (name === "webkit") {
    const vp = await b.newPage({ viewport: { width: VW, height: VH } });
    vp.on("pageerror", (e) => errors.push(e.message)); await fonts(vp);
    await vp.addInitScript(() => { window.Capacitor = { Plugins: { ScreenReader: { isEnabled: async () => ({ value: true }), addListener: () => {} } } }; });
    await vp.goto(`http://localhost:${server.address().port}/proto/index.html?debug&fast`);
    await vp.waitForFunction(() => window.kt);
    const said = await vp.evaluate(async () => {
      kt.newGame("hearts"); kt.autoplay();
      await new Promise((r) => setTimeout(r, 14000));
      const log = kt.said.log, out = [], plays = kt.G.st.history.length;
      for (let i = 1; i < log.length; i++) if (log[i][0] - log[i - 1][0] < kt.readMs(log[i - 1][1]) - 5) out.push(`"${log[i - 1][1].slice(0, 30)}" cut short`);
      if (kt.said.dropped) out.push(`${kt.said.dropped} sentences dropped`);
      if (log.length < 6) out.push(`only ${log.length} sentences in 14 s`);
      if (plays > log.length + 1) out.push(`${plays} cards played but only ${log.length} sentences shown: the bots didn't wait`);
      return out;
    });
    await vp.close();
    await report("voiceover", said);
  }
  await b.close();
}
server.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log("smoke ok");
