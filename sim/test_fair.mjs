// The fair deal: the fingerprint, the cut, the ledger's constants, and verify.html dealing exactly what the app deals.
// Run: node sim/test_fair.mjs
//      node sim/test_fair.mjs --measure 200000   prints ledger.js's EXPECT, measured with dealer.js (random seeds)
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { newSeed, encode, deal, fingerprint, seedBytes, sha256 } from "../proto/dealer.js";
import { newDeck, dealHands, dealOut, cutSeed, rulesFor } from "../proto/cards.js";
import { entry, view, EXPECT, NOTE } from "../proto/ledger.js";
import * as hearts from "../proto/hearts.js";
import * as spades from "../proto/spades.js";
import * as euchre from "../proto/euchre.js";
import * as ohhell from "../proto/ohhell.js";
import * as whist from "../proto/whist.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const R = { plain: rulesFor(cfg, "spades", "standard"), jokers: rulesFor(cfg, "spades", "kitchen") };
assert.ok(!R.plain.jokers && R.jokers.jokers, "standard deals a regular deck, kitchen the Jokers deck");

// ---------------------------------------------------------------- the ledger's expectations, measured

// every seat of `deals` deals: a regular and a Jokers deck (13 each), Euchre's 24 (5 each), Oh Hell at 1-12 cards
// (dealt round-robin, an Oh Hell hand of k is the first k cards of the full deal's hand). Each statistic is summed per
// deal (four hands), so its standard error counts the deal as the unit: the four hands of one deal aren't independent.
function measure(deals, seedAt) {
  const S = {}, Q = {}, listed = Object.fromEntries(["plain", "jokers"].map((d) => [d, new Set(EXPECT.shapes[d].slice(0, -1).map(([s]) => s))]));
  let cur;
  const put = (k, x) => (cur[k] = (cur[k] || 0) + x);
  const each = (hands, game, rules, fn) => hands.forEach((hand, s) => fn(entry({ hand, others: hands.filter((_, t) => t !== s), game, rules, standing: "level" }), hand));
  const stat = (key, e) => { put("hc" + key, e.hc); put("hq" + key, e.hc * e.hc); put("o" + key, e.o); put("oq" + key, e.o * e.o); };
  for (let i = 0; i < deals; i++) {
    const seed = seedAt(i), full = dealHands(seed, 0, newDeck());
    cur = {};
    for (const d of ["plain", "jokers"]) each(d === "plain" ? full : dealHands(seed, 0, newDeck(true)), "spades", R[d], (e, hand) => {
      if (d === "plain") { stat("13", e); put("queen", entry({ hand, game: "hearts" }).qs); } // the Jokers deck has the same 16 high cards
      put(`sh.${d}.${e.sh}`, 1); put(`sho.${d}`, listed[d].has(e.sh) ? 0 : 1);
      put(`sp.${d}.${Math.min(6, Math.max(0, e.sp - 1))}`, 1);
      put(`nil.${d}`, e.nil); put(`nb.${d}`, e.nb);
    });
    each(dealOut(seed, 0, euchre.DECK, 5).hands, "euchre", {}, (e) => { stat("e5", e); put("jk", e.jk); put("jkq", e.jk * e.jk); });
    for (let k = 1; k <= 12; k++) each(full.map((h) => h.slice(0, k)), "ohhell", {}, (e) => stat(String(k), e));
    for (const k in cur) { S[k] = (S[k] || 0) + cur[k]; Q[k] = (Q[k] || 0) + cur[k] ** 2; }
  }
  // [value, standard error]: the mean of one hand's statistic (x scale), or its standard deviation
  const get = (k, scale = 1) => [(scale * (S[k] || 0)) / (4 * deals), (scale * Math.sqrt(Math.max(0, (Q[k] || 0) / deals - ((S[k] || 0) / deals) ** 2) / deals)) / 4];
  const sd = (k, q) => { const v = Math.sqrt(get(q)[0] - get(k)[0] ** 2); return [v, v / Math.sqrt(2 * deals)]; };
  const f = (x, d) => +x.toFixed(d), pct = (k) => f(get(k, 100)[0], 2);
  const top = (d) => {
    const best = Object.keys(S).filter((k) => k.startsWith(`sh.${d}.`)).sort((a, b) => S[b] - S[a]).slice(0, 10);
    return [...best.map((k) => [k.split(".")[2], pct(k)]), ["other", f(100 - best.reduce((a, k) => a + get(k, 100)[0], 0), 2)]];
  };
  const expect = {
    high: Object.fromEntries(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "e5"].map((k) => [k, [get("hc" + k)[0], sd("hc" + k, "hq" + k)[0], get("o" + k)[0], sd("o" + k, "oq" + k)[0]].map((x) => f(x, 3))])),
    shapes: { plain: top("plain"), jokers: top("jokers") },
    spades: Object.fromEntries(["plain", "jokers"].map((d) => [d, [0, 1, 2, 3, 4, 5, 6].map((b) => pct(`sp.${d}.${b}`))])),
    nil: Object.fromEntries(["plain", "jokers"].map((d) => [d, [pct(`nil.${d}`), pct(`nb.${d}`)]])),
    queen: pct("queen"),
    jacks: [f(get("jk")[0], 3), f(sd("jk", "jkq")[0], 3)],
  };
  return { expect, get, sd };
}

const at = process.argv.indexOf("--measure");
if (at > 0) {
  const N = +process.argv[at + 1] || 200000, m = measure(N, () => newSeed()).expect, J = JSON.stringify;
  console.log(`  high: ${J(m.high)},\n  shapes: {\n    plain: ${J(m.shapes.plain)},\n    jokers: ${J(m.shapes.jokers)},\n  },`);
  console.log(`  spades: { plain: ${J(m.spades.plain)}, jokers: ${J(m.spades.jokers)} },\n  nil: { plain: ${J(m.nil.plain)}, jokers: ${J(m.nil.jokers)} },`);
  console.log(`  queen: ${m.queen.toFixed(2)},\n  jacks: ${J(m.jacks)},\n(${N} deals, all four seats)`);
  process.exit(0);
}

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log("ok", name); };
const GOLDEN_SEED = "37QF-2MZ9-XB4C-1RTD-8HJN-PQ6V-W3"; // sim/test_sim.mjs's golden deal (cross-checked in Python)

// ---------------------------------------------------------------- the fingerprint (F1)

await test("dealer.js still imports nothing", () => {
  assert.doesNotMatch(read("../proto/dealer.js").replace(/\/\/.*$/gm, ""), /\bimport\b|\brequire\(/);
});

await test("fingerprint: the first 16 hex digits of SHA-256 of the seed's 16 bytes, in fours (goldens and node's crypto)", () => {
  assert.equal(fingerprint("0000-0000-0000-0000-0000-0000-00"), "3747 08FF F771 9DD5"); // SHA-256 of 16 zero bytes
  assert.equal(fingerprint(GOLDEN_SEED), "0529 6D3E 3488 C222"); // cross-checked with Python hashlib
  assert.equal(fingerprint(encode([0xdeadbeef, 0, 0xffffffff, 12345])), "8327 98A8 79C5 1A1D");
  assert.equal(fingerprint(GOLDEN_SEED.toLowerCase().replace(/-/g, " ")), fingerprint(GOLDEN_SEED), "same seed text rules as deal()");
  assert.equal(sha256(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); // FIPS 180-4 example
  for (let i = 0; i < 500; i++) {
    const s = newSeed(), h = createHash("sha256").update(seedBytes(s)).digest("hex");
    assert.equal(fingerprint(s), h.slice(0, 16).toUpperCase().match(/.{4}/g).join(" "));
    assert.equal(sha256(seedBytes(s)), h);
  }
  for (let len = 0; len < 200; len++) { // every padding case, one and several blocks
    const b = Uint8Array.from({ length: len }, (_, k) => (k * 151 + len) & 255);
    assert.equal(sha256(b), createHash("sha256").update(b).digest("hex"), `length ${len}`);
  }
  assert.match(fingerprint(newSeed()), /^[0-9A-F]{4}( [0-9A-F]{4}){3}$/, "64 bits: a seed with a chosen fingerprint is out of reach");
});

// ---------------------------------------------------------------- the cut (F1)

await test("cut 0 deals exactly what every game dealt before the cut existed", () => {
  const old = (seed, dealer, deck) => { const h = [[], [], [], []]; deal(seed, deck.length).forEach((ci, k) => h[(dealer + 1 + k) % 4].push(deck[ci])); return h; };
  for (let i = 0; i < 400; i++) {
    const seed = newSeed(), dealer = i % 4;
    for (const deck of [newDeck(), newDeck(true)]) {
      assert.deepEqual(dealHands(seed, dealer, deck), old(seed, dealer, deck));
      assert.deepEqual(dealHands(seed, dealer, deck, 0), old(seed, dealer, deck));
    }
  }
});

await test("the cut is mixed into the shuffle: cut c deals from SHA-256(seed bytes, c) (goldens, node's crypto)", () => {
  const deck = newDeck(), mixed = (seed, c) => { const h = createHash("sha256").update(Uint8Array.of(...seedBytes(seed), c)).digest(); return encode([0, 4, 8, 12].map((i) => h.readUInt32BE(i))); };
  assert.equal(cutSeed(GOLDEN_SEED, 0), GOLDEN_SEED, "no cut: the seed itself");
  for (let i = 0; i < 200; i++) {
    const seed = newSeed(), c = 1 + (i % 51);
    assert.equal(cutSeed(seed, c), mixed(seed, c));
    const want = [[], [], [], []];
    deal(mixed(seed, c), 52).forEach((ci, k) => want[(2 + 1 + k) % 4].push(deck[ci]));
    assert.deepEqual(dealHands(seed, 2, deck, c), want);
  }
  // cross-checked in Python (hashlib and the shuffle)
  assert.equal(cutSeed(GOLDEN_SEED, 17), "26S7-PZW5-QQBX-Z81B-EE02-ZX70-FQ");
  assert.deepEqual(dealHands(GOLDEN_SEED, 3, deck, 17)[0].slice(0, 4), ["AH", "5S", "8C", "QH"]);
  assert.deepEqual(dealHands(GOLDEN_SEED, 3, deck, 0)[0].slice(0, 2), [deck[47], deck[0]]);
  const mine = new Set(Array.from({ length: 52 }, (_, c) => [...dealHands(GOLDEN_SEED, 0, deck, c)[0]].sort().join("")));
  assert.equal(mine.size, 52, "every cut gives you a different hand, not the same four hands passed round");
  for (const bad of [-1, 52, 1.5, "3", NaN]) assert.throws(() => dealHands(GOLDEN_SEED, 0, deck, bad), /A cut is 0 to 51/);
  assert.throws(() => dealOut(GOLDEN_SEED, 0, euchre.DECK, 5, 24), /A cut is 0 to 23/);
});

await test("dealOut matches every engine's own deal at cut 0 (hands, Euchre's kitty, the trump cards)", () => {
  for (let i = 0; i < 300; i++) {
    const seed = newSeed(), dealer = i % 4;
    assert.deepEqual(hearts.newHand(rulesFor(cfg, "hearts", "standard"), seed, dealer).hands, dealHands(seed, dealer, newDeck()));
    for (const p of ["standard", "kitchen"]) { const r = rulesFor(cfg, "spades", p); assert.deepEqual(spades.newHand(r, seed, dealer).hands, dealHands(seed, dealer, newDeck(r.jokers))); }
    const w = whist.newHand(rulesFor(cfg, "whist", "standard"), seed, dealer);
    assert.deepEqual(w.hands, dealHands(seed, dealer, newDeck()));
    const e = euchre.newHand(rulesFor(cfg, "euchre", "standard"), seed, dealer), ed = dealOut(seed, dealer, euchre.DECK, 5);
    assert.deepEqual(e.hands, ed.hands); assert.deepEqual(e.kitty, ed.rest);
    const r = rulesFor(cfg, "ohhell", "tournament"), handNo = i % 25, o = ohhell.newHand(r, seed, dealer, undefined, handNo), od = dealOut(seed, dealer, newDeck(), o.size);
    assert.deepEqual(o.hands, od.hands); assert.equal(o.trumpCard, od.rest[0] ?? null);
  }
});

// ---------------------------------------------------------------- site/ serves the app's own code (F7)

await test("site/dealer.js and site/cards.js are the app's own files", () => {
  assert.equal(read("../site/dealer.js"), read("../proto/dealer.js"));
  assert.equal(read("../site/cards.js"), read("../proto/cards.js"));
  assert.deepEqual([...read("../proto/cards.js").matchAll(/from "([^"]+)"/g)].map((m) => m[1]), ["./dealer.js"], "cards.js needs only dealer.js beside it");
});

// run verify.html's own script against site/dealer.js and site/cards.js, with a stand-in page
async function verifyPage(query, k) {
  const src = read("../site/verify.html").match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(`"./dealer.js"`, JSON.stringify(new URL("../site/dealer.js", import.meta.url).href))
    .replace(`"./cards.js"`, JSON.stringify(new URL("../site/cards.js", import.meta.url).href));
  const els = {};
  globalThis.document = { getElementById: (id) => (els[id] ??= { value: id === "dealer" ? "3" : id === "game" ? "hearts" : id === "size" ? "1" : "", dataset: {}, hidden: false, textContent: "", innerHTML: "" }) };
  globalThis.location = { search: "?" + new URLSearchParams(query) };
  globalThis.fetch = async () => ({ text: async () => "" });
  const file = join(dir, `verify-${k}.mjs`);
  writeFileSync(file, src);
  await import(pathToFileURL(file).href);
  const $ = document.getElementById;
  return { deal: $("hands").dataset.deal && JSON.parse($("hands").dataset.deal), error: $("out").textContent, check: $("check").textContent, more: $("more").innerHTML };
}
const dir = mkdtempSync(join(tmpdir(), "kt-verify-"));

await test("verify.html deals what the app deals for a seed and cut, in every game", async () => {
  let k = 0;
  for (let i = 0; i < 24; i++) {
    const seed = newSeed(), dealer = i % 4, cut = i < 6 ? 0 : (i * 7) % 24;
    const page = (game, extra = {}) => verifyPage({ seed, cut, dealer, game, fp: fingerprint(seed), ...extra }, k++);
    const app = {
      hearts: dealHands(seed, dealer, newDeck(), cut), spades: dealHands(seed, dealer, newDeck(), cut), whist: dealHands(seed, dealer, newDeck(), cut),
      jokers: dealHands(seed, dealer, newDeck(true), cut), euchre: dealOut(seed, dealer, euchre.DECK, 5, cut), ohhell: dealOut(seed, dealer, newDeck(), 1 + (i % 13), cut),
    };
    if (cut === 0) { // the engines themselves (they take no cut yet)
      assert.deepEqual(app.hearts, hearts.newHand(rulesFor(cfg, "hearts", "standard"), seed, dealer).hands);
      assert.deepEqual(app.jokers, spades.newHand(R.jokers, seed, dealer).hands);
      const e = euchre.newHand(rulesFor(cfg, "euchre", "standard"), seed, dealer); assert.deepEqual(app.euchre, { hands: e.hands, rest: e.kitty });
    }
    for (const game of ["hearts", "spades", "jokers", "whist"]) {
      const v = await page(game);
      assert.equal(v.error, "", `${game}: ${v.error}`);
      assert.deepEqual(v.deal.hands, app[game], game);
      assert.match(v.check, /Fingerprint matches/);
    }
    const e = await page("euchre");
    assert.deepEqual(e.deal, app.euchre, "euchre: hands and kitty");
    const o = await page("ohhell", { size: 1 + (i % 13) });
    assert.deepEqual(o.deal, app.ohhell, "oh hell: hands and the trump card");
  }
  const seed = newSeed(), wrong = fingerprint(newSeed());
  const bad = await verifyPage({ seed, cut: 5, dealer: 0, game: "hearts", fp: wrong }, k++);
  assert.match(bad.error, /not the seed that was fixed before the cut/); assert.equal(bad.deal, undefined, "a wrong fingerprint deals nothing");
  const legacy = await verifyPage({ seed, deck: "jokers", dealer: 1 }, k++); // links from before the cut
  assert.deepEqual(legacy.deal.hands, dealHands(seed, 1, newDeck(true)));
  assert.match((await verifyPage({ seed, cut: 30, game: "euchre" }, k++)).error, /A cut is 0 to 23/);
});
rmSync(dir, { recursive: true, force: true });

// ---------------------------------------------------------------- the ledger (F2-F6)

await test("ledger constants are within 4 standard errors of a fresh measurement over 50,000 other deals", () => {
  const m = measure(50000, (i) => encode([i, 0x2026, 0x1019, 0xfa1]));
  let worst = [0, ""];
  const near = (a, [b, se], what) => { // 0.006: the constants are rounded to 2 decimals
    const tol = Math.max(4 * se, 0.006);
    assert.ok(Math.abs(a - b) <= tol, `${what}: ledger ${a}, measured ${b.toFixed(3)} ± ${se.toFixed(3)}`);
    if (Math.abs(a - b) / tol > worst[0]) worst = [Math.abs(a - b) / tol, `${what}: ${a} vs ${b.toFixed(3)} ± ${se.toFixed(3)}`];
  };
  for (const [k, v] of Object.entries(EXPECT.high)) {
    near(v[0], m.get("hc" + k), `high ${k}, yours`); near(v[1], m.sd("hc" + k, "hq" + k), `high ${k}, yours (sd)`);
    near(v[2], m.get("o" + k), `high ${k}, the other three`); near(v[3], m.sd("o" + k, "oq" + k), `high ${k}, the other three (sd)`);
  }
  for (const d of ["plain", "jokers"]) {
    const E = EXPECT.shapes[d];
    assert.equal(E.at(-1)[0], "other");
    for (const [s, p] of E.slice(0, -1)) near(p, m.get(`sh.${d}.${s}`, 100), `${d} shape ${s}`);
    near(E.at(-1)[1], m.get(`sho.${d}`, 100), `${d} other shapes`);
    assert.ok(Math.abs(E.reduce((a, [, p]) => a + p, 0) - 100) < 0.02, `${d} shapes add up`);
    for (let i = 2; i < E.length - 1; i++) assert.ok(E[i][1] <= E[i - 1][1], `${d} shapes, most common first`);
    EXPECT.spades[d].forEach((x, i) => near(x, m.get(`sp.${d}.${i}`, 100), `${d} spades bucket ${i}`));
    near(EXPECT.nil[d][0], m.get(`nil.${d}`, 100), `${d} nil, plain rule`); near(EXPECT.nil[d][1], m.get(`nb.${d}`, 100), `${d} nil, Standard bots' rule`);
  }
  near(EXPECT.queen, m.get("queen", 100), "queen of spades"); near(EXPECT.jacks[0], m.get("jk"), "euchre jacks"); near(EXPECT.jacks[1], m.sd("jk", "jkq"), "euchre jacks (sd)");
  // and the first review's figures (REVIEW_RULES F2/F3): the bots' rule nil-able 1.12% regular, 0.20% Jokers
  assert.ok(Math.abs(EXPECT.nil.plain[1] - 1.12) < 0.03 && Math.abs(EXPECT.nil.jokers[1] - 0.2) < 0.02);
  console.log(`   closest: ${(100 * worst[0]).toFixed(0)}% of its tolerance (${worst[1]})`);
});

await test("ledger.js never shuffles: no Math.random, no sort(random)", () => {
  const src = read("../proto/ledger.js").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /Math\.random|crypto|sort\(\s*\(\)/);
});

// a fair stream of entries, as the app would record them
const entries = (count, seedOf = (i) => encode([i, 7, 7, 7])) => Array.from({ length: count }, (_, i) => {
  const seed = seedOf(i), game = ["hearts", "spades", "spades", "euchre", "ohhell", "whist"][i % 6], rules = game === "spades" && i % 12 === 2 ? R.jokers : R.plain;
  const { hands } = game === "euchre" ? dealOut(seed, 3, euchre.DECK, 5) : dealOut(seed, 3, newDeck(rules.jokers), game === "ohhell" ? 1 + (i % 13) : 13);
  return entry({ hand: hands[0], others: hands.slice(1), game, rules: game === "spades" ? rules : {}, standing: ["ahead", "level", "behind"][i % 3] });
});

await test("ledger entry: one small record per deal (high cards, the other three, standing, shape, nil, queen, jacks)", () => {
  const seed = GOLDEN_SEED, h = dealHands(seed, 3, newDeck());
  const e = entry({ hand: h[0], others: h.slice(1), game: "spades", rules: R.plain, standing: "behind" });
  const hc = (x) => x.filter((c) => "AKQJ".includes(c[0])).length;
  assert.equal(e.hc, hc(h[0])); assert.equal(e.o, Math.round(((16 - hc(h[0])) / 3) * 100) / 100); assert.equal(e.st, "b");
  assert.equal(e.d, "plain"); assert.equal(e.n, 13); assert.equal(e.sh.length, 4); assert.equal(e.sp, h[0].filter((c) => c[1] === "S").length);
  assert.ok(e.nil === 0 || e.nil === 1); assert.ok(e.nb === 0 || e.nb === 1);
  assert.equal(entry({ hand: ["2S", "3S", "4H", "5H", "6H", "7H", "8D", "9D", "TD", "JC", "QC", "KC", "3C"], game: "spades", rules: R.plain }).nil, 1, "plain rule: 2 low spades, no side ace");
  assert.equal(entry({ hand: ["2S", "TS", "4H", "5H", "6H", "7H", "8D", "9D", "TD", "JC", "QC", "KC", "3C"], game: "spades", rules: R.plain }).nil, 0, "the 10 of spades is above the 9");
  assert.equal(entry({ hand: ["2S", "3S", "AH", "5H", "6H", "7H", "8D", "9D", "TD", "JC", "QC", "KC", "3C"], game: "spades", rules: R.plain }).nil, 0, "a side ace");
  assert.equal(entry({ hand: ["3S", "4S", "2D", "5H", "6H", "7H", "8D", "9D", "TD", "JC", "QC", "KC", "3C"], game: "spades", rules: R.jokers }).nil, 0, "Jokers deck: the 2 of diamonds is a top trump");
  const j = entry({ hand: ["BJ", "LJ", "2D", "AS", "KH", "QH", "JH", "TD", "9D", "8C", "7C", "6C", "5C"], game: "spades", rules: R.jokers });
  assert.equal(j.d, "jokers"); assert.equal(j.sp, 4, "Jokers deck: both jokers and the 2 of diamonds count as spades"); assert.equal(j.sh, "4432");
  assert.equal(entry({ hand: h[0], game: "hearts" }).qs, h[0].includes("QS") ? 1 : 0);
  const eu = entry({ hand: ["JS", "JC", "9H", "AD", "TD"], game: "euchre" });
  assert.equal(eu.d, "euchre"); assert.equal(eu.jk, 2); assert.equal(eu.sh, undefined, "no shapes for five cards");
  assert.equal(entry({ hand: h[0], game: "whist", standing: "sideways" }).st, null);
  assert.ok(JSON.stringify(entry({ hand: h[0], others: h.slice(1), game: "spades", rules: R.jokers })).length < 140, "a thousand of them fit easily in the save");
});

await test("ledger view: empty under 20 hands; sections hidden under 200 with the reason; every row has a 3-standard-error band", () => {
  assert.deepEqual(view([]), { n: 0, empty: true, sections: [] });
  assert.equal(view(entries(19)).empty, true);
  const few = view(entries(150));
  assert.equal(few.empty, false); assert.equal(few.n, 150); assert.equal(few.note, NOTE);
  assert.ok(few.sections.length >= 5 && !few.sections.some((s) => s.id === "shapes-jokers" && s.n === 0));
  for (const s of few.sections) { assert.equal(s.hidden, true); assert.deepEqual(s.rows, []); assert.match(s.note, /Shows after 200 hands \(\d+ so far\)/); }
  assert.equal(view([...entries(30), null, { g: "h", j: 0, hc: 4, sh: "4432" }]).n, 30, "records from before the ledger rewrite are skipped");
  const v = view(entries(3000));
  assert.deepEqual(v.sections.map((s) => s.id), ["high", "standing", "shapes", "spades", "shapes-jokers", "trumps-jokers", "queen", "nil", "jacks"]);
  for (const s of v.sections) {
    assert.ok(s.title && s.note && (s.unit === "%" || s.unit === "cards"), s.id);
    assert.equal(s.hidden, false, s.id);
    for (const r of s.rows) {
      for (const k of ["label", "mine", "expected", "lo", "hi"]) assert.ok(k in r, `${s.id} ${r.label}: ${k}`);
      assert.ok(r.lo <= r.expected && r.expected <= r.hi, `${s.id} ${r.label}: band around expected`);
      if (s.unit === "%" && r.lo > 0 && r.hi < 100) assert.ok(Math.abs(r.hi - r.expected - 300 * Math.sqrt((r.expected / 100) * (1 - r.expected / 100) / r.n)) < 0.01, `${s.id} ${r.label}: 3 standard errors`);
    }
  }
  const sec = (id) => v.sections.find((s) => s.id === id);
  assert.deepEqual(sec("standing").rows.map((r) => r.label), ["Ahead", "Level", "Behind"]);
  assert.equal(sec("shapes").rows.at(-1).label, "Other shapes");
  assert.ok(Math.abs(sec("shapes").rows.reduce((a, r) => a + r.mine, 0) - 100) < 0.1, "shape rows add up to 100%");
  assert.equal(sec("high").rows[0].label, "You"); assert.equal(sec("high").rows[1].label, "The other three");
  assert.equal(sec("nil").rows.length, 4, "regular and Jokers, plain rule and the bots' rule");
  // a fair stream lands in its bands: allow 1 row in 20 outside, as 95% bands should
  const rows = v.sections.flatMap((s) => s.rows), out = rows.filter((r) => r.mine < r.lo || r.mine > r.hi);
  assert.ok(out.length <= Math.ceil(rows.length / 20), `rows outside their band: ${out.map((r) => r.label).join(", ")}`);
  // only 13-card hands from a full deck go against 4.00
  const thirteen = view(entries(1200).filter((e) => e.n === 13 && e.d !== "euchre"));
  assert.equal(thirteen.sections.find((s) => s.id === "standing").rows[0].expected, 4);
});

await test("ledger view: a deck that favours you shows outside the band", () => {
  const rigged = entries(1000).map((e) => (e.n === 13 && e.d !== "euchre" ? { ...e, hc: e.hc + (e.st === "b" ? 1 : 0) } : e)); // a better hand when behind
  const behind = view(rigged).sections.find((s) => s.id === "standing").rows.find((r) => r.label === "Behind");
  assert.ok(behind.mine > behind.hi, `behind: ${behind.mine} vs band ${behind.lo}-${behind.hi}`);
});

console.log(`${n} checks passed`);
