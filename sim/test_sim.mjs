// Rules, dealer and scoring checks. Run: node sim/test_sim.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newSeed, encode, decode, deal } from "../proto/dealer.js";
import { newDeck, dealHands, rulesFor, next } from "../proto/cards.js";
import * as spades from "../proto/spades.js";
import * as hearts from "../proto/hearts.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
let n = 0;
// computed once and cross-checked against an independent Python implementation of the same algorithm (2026-10-19)
const GOLDEN_10 = [9, 4, 1, 2, 5, 6, 3, 0, 7, 8], GOLDEN_52 = [47, 51, 14, 35, 0, 19, 21, 39];
const test = (name, fn) => { fn(); n++; console.log("ok", name); };

// ---------------------------------------------------------------- fair deal (DESIGN R1)

test("dealer.js imports nothing and reads only its arguments", () => {
  const src = readFileSync(new URL("../proto/dealer.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /\bimport\b|\brequire\(|\bfetch\(|localStorage|window\.|document\.|platform|purchase|score|streak|human/);
  assert.equal(deal.length, 2, "deal(seed, n) takes exactly two arguments");
});

test("same seed, same deal; different seed, different deal", () => {
  for (let i = 0; i < 200; i++) {
    const s = newSeed();
    assert.deepEqual(deal(s, 52), deal(s, 52));
    assert.deepEqual(dealHands(s, 2, newDeck()), dealHands(s, 2, newDeck()));
    assert.notDeepEqual(deal(s, 52), deal(newSeed(), 52));
  }
});

test("seed text round-trips and tolerates dashes, case and look-alike letters", () => {
  const w = [0xdeadbeef, 0, 0xffffffff, 12345];
  const s = encode(w);
  assert.match(s, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}-[0-9A-Z]{2}$/);
  assert.deepEqual(decode(s), w);
  assert.deepEqual(decode(s.toLowerCase().replace(/-/g, " ")), w);
  assert.throws(() => decode("ABC"));
});

test("golden deal: the algorithm on verify.html must never change", () => {
  assert.deepEqual(deal("0000-0000-0000-0000-0000-0000-01", 10), GOLDEN_10);
  assert.deepEqual(deal("37QF-2MZ9-XB4C-1RTD-8HJN-PQ6V-W3", 52).slice(0, 8), GOLDEN_52);
});

test("every card is equally likely in every seat (40,000 deals, within 1%)", () => {
  const N = 40000, hits = new Map();
  for (let i = 0; i < N; i++) {
    const h = dealHands(newSeed(), 3, newDeck());
    for (const c of h[0]) hits.set(c, (hits.get(c) || 0) + 1);
  }
  for (const c of newDeck()) assert.ok(Math.abs(hits.get(c) / N - 0.25) < 0.01, `${c} in seat 0: ${hits.get(c) / N}`);
});

test("decks: 52 cards, Jokers deck swaps 2C 2H for the jokers", () => {
  assert.equal(new Set(newDeck()).size, 52);
  const j = newDeck(true);
  assert.equal(new Set(j).size, 52);
  assert.ok(j.includes("BJ") && j.includes("LJ") && !j.includes("2C") && !j.includes("2H"));
  const h = dealHands(newSeed(), 0, j);
  assert.deepEqual(h.map((x) => x.length), [13, 13, 13, 13]);
});

// ---------------------------------------------------------------- house rules (DESIGN R4)

test("every rule has a name, an explanation and a value for every preset", () => {
  for (const [game, rules] of Object.entries(cfg.rules))
    for (const r of rules) {
      assert.ok(r.name && r.explain && r.explain.length > 10, `${game}.${r.id} needs a name and an explanation`);
      for (const p of cfg.presets) assert.ok(p in r.presets, `${game}.${r.id} has no ${p} value`);
    }
  assert.ok(cfg.products.every((p) => p.type === "non-consumable" && p.familyShareable), "purchases are permanent and shareable");
});

// ---------------------------------------------------------------- legal play, checked independently (renege, AI_SPEC S19)

function randomHand(g, rules, seed, rng, totals, handNo = 0) {
  const st = g.newHand(rules, seed, handNo % 4, totals, handNo);
  while (st.phase !== "done") {
    const legal = g.legal(st), s = st.turn;
    if (st.phase === "pass") { g.apply(st, [...st.hands[s]].sort(() => rng() - 0.5).slice(0, 3)); continue; }
    if (st.phase === "bid" || st.phase === "moon") { g.apply(st, legal[Math.floor(rng() * legal.length)]); continue; }
    const hand = [...st.hands[s]], card = legal[Math.floor(rng() * legal.length)], eff = (c) => g.eff(c, rules.jokers);
    if (st.trick.length) { // follow suit if you can
      const led = eff(st.trick[0].card);
      if (hand.some((c) => eff(c) === led)) assert.equal(eff(card), led, `renege: ${s} played ${card} on ${led}`);
    }
    if (g === hearts && !st.history.length) assert.equal(card, "2C");
    if (g === hearts && st.history.length < 4 && !rules.firstTrickPoints && (card[1] === "H" || card === "QS"))
      { const f = hand.some((c) => eff(c) === eff(st.trick[0].card)) ? hand.filter((c) => eff(c) === eff(st.trick[0].card)) : hand;
        assert.ok(f.every((c) => c[1] === "H" || c === "QS"), `points on the first trick: ${card}`); }
    if (!st.trick.length && g === hearts && rules.heartsBroken && !st.broken && card[1] === "H") assert.ok(hand.every((c) => c[1] === "H"), "led hearts before broken");
    if (!st.trick.length && g === spades && rules.spadesBroken && !st.broken && eff(card) === "S") assert.ok(hand.every((c) => eff(c) === "S"), "led spades before broken");
    g.apply(st, card);
  }
  return st;
}

let r = 1;
const rng = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 2 ** 32);
for (const [name, g] of [["spades", spades], ["hearts", hearts]])
  for (const preset of cfg.presets)
    test(`${name}/${preset}: 3,000 random hands never break a rule and every card is played once`, () => {
      const rules = rulesFor(cfg, name, preset);
      for (let i = 0; i < 3000; i++) {
        const st = randomHand(g, rules, newSeed(), rng, undefined, i);
        assert.equal(st.history.length, 52);
        assert.equal(new Set(st.history.map((h) => h.card)).size, 52);
        assert.equal(st.tricks.reduce((a, b) => a + b), 13);
        const sc = g.score(st);
        if (name === "hearts" && st.moon === null) assert.equal(sc.totals.score.reduce((a, b) => a + b), 26 - (rules.jackDiamonds ? 10 : 0));
      }
    });

// ---------------------------------------------------------------- scoring tables (AI_SPEC S20, H08)

function spadesDone(preset, bids, tricks, { blind = [false, false, false, false], totals = { score: [0, 0], bags: [0, 0] }, custom = {} } = {}) {
  const st = spades.newHand(rulesFor(cfg, "spades", preset, custom), newSeed(), 0, totals);
  Object.assign(st, { bids, tricks, blind, phase: "done" });
  return spades.score(st);
}
const kinds = (sc, t) => sc.lines.filter((l) => l.team === t).map((l) => `${l.kind}:${l.pts}`).join(" ");

test("spades scoring: made, set, bags, nil, blind nil, 10-for-200, Boston, penalty", () => {
  let sc = spadesDone("standard", [4, 3, 3, 2], [5, 3, 3, 2]);
  assert.equal(kinds(sc, 0), "made:71"); assert.deepEqual(sc.totals.bags, [1, 0]);
  assert.equal(kinds(sc, 1), "made:50");
  sc = spadesDone("standard", [4, 3, 3, 2], [3, 5, 3, 2]);
  assert.equal(kinds(sc, 0), "set:-70");
  sc = spadesDone("standard", [0, 4, 5, 4], [0, 4, 5, 4]);
  assert.equal(kinds(sc, 0), "nil:100 made:50"); assert.equal(sc.totals.score[0], 150);
  // a broken nil: the reviewer case "set a nil and a 5 bid ... -50 instead of -150"
  sc = spadesDone("standard", [0, 4, 5, 4], [1, 4, 4, 4]); // nil tricks count toward partner: made 5
  assert.equal(sc.totals.score[0], -100 + 50);
  sc = spadesDone("tournament", [0, 4, 5, 4], [1, 4, 4, 4]); // they don't: set 5
  assert.equal(sc.totals.score[0], -150);
  // the opponents' nil is theirs, never ours
  sc = spadesDone("standard", [4, 0, 4, 5], [4, 0, 4, 5]);
  assert.equal(kinds(sc, 1), "nil:100 made:50"); assert.equal(kinds(sc, 0), "made:80");
  sc = spadesDone("standard", [3, 3, 3, 3], [4, 2, 4, 3], { totals: { score: [200, 200], bags: [8, 0] } });
  assert.equal(kinds(sc, 0), "made:62 bagPenalty:-100"); assert.deepEqual(sc.totals.bags, [0, 0]); assert.equal(sc.totals.score[0], 162);
  sc = spadesDone("kitchen", [0, 3, 4, 4], [0, 4, 5, 4], { blind: [true, false, false, false], totals: { score: [0, 200], bags: [0, 0] } });
  assert.equal(kinds(sc, 0), "blindNil:200 made:41");
  sc = spadesDone("kitchen", [5, 1, 5, 1], [6, 0, 5, 2]);
  assert.equal(kinds(sc, 0), "made:201");
  sc = spadesDone("kitchen", [6, 0, 5, 0], [7, 0, 6, 0]);
  assert.match(kinds(sc, 0), /made:222 boston:250/);
});

test("spades game end: first to the target, ties play on", () => {
  const r = rulesFor(cfg, "spades", "standard");
  assert.equal(spades.winner({ score: [510, 300] }, r), 0);
  assert.equal(spades.winner({ score: [510, 510] }, r), null);
  assert.equal(spades.winner({ score: [490, 300] }, r), null);
});

function heartsDone(preset, taken, { totals = { score: [0, 0, 0, 0] }, choice } = {}) {
  const st = hearts.newHand(rulesFor(cfg, "hearts", preset), newSeed(), 0, totals, 3);
  st.taken = taken; st.phase = "done";
  const shooter = taken.findIndex((t) => t.filter((c) => c[1] === "H" || c === "QS").length === 14);
  if (shooter >= 0 && st.rules.moon !== "off") { st.moon = shooter; st.moonChoice = choice || "add"; }
  return hearts.score(st);
}
const ALL_H = newDeck().filter((c) => c[1] === "H");

test("hearts scoring: hearts, queen, jack of diamonds, the moon both ways", () => {
  let sc = heartsDone("standard", [["QS", "2H"], ALL_H.slice(1, 6), ALL_H.slice(6), ["JD"]]);
  assert.deepEqual(sc.totals.score, [14, 5, 7, 0]);
  sc = heartsDone("kitchen", [["QS", "2H"], ALL_H.slice(1, 6), ALL_H.slice(6), ["JD"]]);
  assert.deepEqual(sc.totals.score, [14, 5, 7, -10]);
  sc = heartsDone("standard", [["QS", ...ALL_H], [], [], []]);
  assert.deepEqual(sc.totals.score, [0, 26, 26, 26]);
  sc = heartsDone("kitchen", [["QS", ...ALL_H], [], ["JD"], []], { choice: "sub" });
  assert.deepEqual(sc.totals.score, [-26, 0, -10, 0]);
});

test("hearts game end: lowest wins once someone reaches the end score; a tie for lowest plays on", () => {
  const r = rulesFor(cfg, "hearts", "standard");
  assert.equal(hearts.winner({ score: [40, 101, 60, 70] }, r), 0);
  assert.equal(hearts.winner({ score: [40, 101, 40, 70] }, r), null);
  assert.equal(hearts.winner({ score: [40, 99, 60, 70] }, r), null);
});

test("hearts passing follows the preset's rotation", () => {
  const r = rulesFor(cfg, "hearts", "standard");
  assert.deepEqual([0, 1, 2, 3, 4].map((h) => hearts.passDir(r, h)), [1, 3, 2, 0, 1]);
});

test("spades bidding: minimum team bid, nil exempt; a nil bidder's partner may bid 1 (S16)", () => {
  const st = spades.newHand(rulesFor(cfg, "spades", "kitchen"), newSeed(), 3);
  spades.apply(st, { bid: 2 }); spades.apply(st, { bid: 3 });
  assert.equal(Math.min(...spades.legal(st).filter((a) => a.bid > 0).map((a) => a.bid)), 2, "partner bid 2, team minimum 4");
  const st2 = spades.newHand(rulesFor(cfg, "spades", "kitchen"), newSeed(), 3);
  spades.apply(st2, { bid: 0 }); spades.apply(st2, { bid: 3 });
  assert.ok(spades.legal(st2).some((a) => a.bid === 1));
});

console.log(`\n${n} checks passed`);
