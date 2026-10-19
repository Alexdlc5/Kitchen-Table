// Euchre rules, legality and scoring (AI_SPEC E09, S19/S20 for Euchre). Run: node sim/test_euchre.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newSeed } from "../proto/dealer.js";
import { rulesFor, partner, team } from "../proto/cards.js";
import * as E from "../proto/euchre.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
let n = 0, r = 3;
const rng = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 2 ** 32);
const test = (name, fn) => { fn(); n++; console.log("ok", name); };
const pick = (a) => a[Math.floor(rng() * a.length)];

// an independent idea of "plays as trump": the jack of the same colour is trump, nothing else changes suit
const SAME = { S: "C", C: "S", H: "D", D: "H" };
const suitOf = (c, t) => (t && c[0] === "J" && c[1] === SAME[t] ? t : c[1]);

test("the deck: 24 cards, nine to ace; 5 each and a kitty of 4 with the upcard on top", () => {
  assert.equal(new Set(E.DECK).size, 24);
  for (let i = 0; i < 200; i++) {
    const seed = newSeed(), st = E.newHand(rulesFor(cfg, "euchre", "standard"), seed, i % 4);
    assert.deepEqual(st.hands.map((h) => h.length), [5, 5, 5, 5]);
    assert.equal(st.kitty.length, 4); assert.equal(st.up, st.kitty[0]);
    assert.equal(new Set([...st.hands.flat(), ...st.kitty]).size, 24);
    assert.deepEqual(E.newHand(st.rules, seed, i % 4).hands, st.hands, "same seed, same deal");
  }
});

test("bowers: the right is the top trump, the left is second and follows as trump", () => {
  assert.equal(E.eff("JD", "H"), "H"); assert.equal(E.eff("JD", "D"), "D"); assert.equal(E.eff("JD", "S"), "D");
  assert.ok(E.pow("JH", "H") > E.pow("JD", "H") && E.pow("JD", "H") > E.pow("AH", "H"));
  const st = E.newHand(rulesFor(cfg, "euchre", "standard"), newSeed(), 0);
  Object.assign(st, { phase: "play", trump: "H", turn: 1, trick: [{ seat: 0, card: "9H" }] });
  st.hands[1] = ["JD", "AD", "KC"];
  assert.deepEqual(E.legal(st), ["JD"], "the left bower must follow a trump lead");
  st.trick = [{ seat: 0, card: "AD" }];
  assert.deepEqual(E.legal(st), ["JD", "AD", "KC"].filter((c) => c === "AD"), "the left bower is not a diamond any more");
});

// a whole hand with random legal choices, every play checked against an independent follow-suit rule
function randomHand(rules, seed, dealer, totals) {
  const st = E.newHand(rules, seed, dealer, totals);
  while (st.phase !== "done") {
    const legal = E.legal(st), s = st.turn;
    assert.ok(legal.length, `no legal action in ${st.phase}`);
    if (st.phase !== "play") {
      if (st.phase === "bid2" && s === st.dealer) assert.equal(legal.some((a) => a.call === "pass"), !rules.stickDealer, "stick the dealer");
      if (st.phase === "bid2") assert.ok(legal.every((a) => a.call !== st.up[1]), "the turned-down suit can't be named");
      if (st.phase === "bid1" && rules.canadianLoner && s === partner(st.dealer)) assert.ok(legal.every((a) => a.call === "pass" || a.alone), "Canadian loner");
      const pass = legal.find((a) => a.call === "pass");
      E.apply(st, pass && rng() < 0.75 ? pass : pick(legal)); // pass often, so thrown-in hands get tested too
      if (st.phase === "discard") assert.equal(st.hands[st.dealer].length, 6, "the dealer picked up");
      continue;
    }
    assert.ok(!st.out.includes(s), "a seat sitting out never plays");
    const hand = [...st.hands[s]], card = pick(legal);
    if (st.trick.length) {
      const led = suitOf(st.trick[0].card, st.trump);
      if (hand.some((c) => suitOf(c, st.trump) === led)) assert.equal(suitOf(card, st.trump), led, `renege: ${s} played ${card} on ${led}`);
    }
    E.apply(st, card);
  }
  return st;
}

for (const preset of [...cfg.presets, "custom"]) {
  const custom = preset === "custom" ? { canadianLoner: true, defendAlone: true, farmersHand: true, lonerLeft: true, stickDealer: true, aloneScore: 5, target: 11 } : {};
  test(`${preset}: 5,000 random hands never break a rule, every card in play once, 5 tricks`, () => {
    const rules = rulesFor(cfg, "euchre", preset === "custom" ? "standard" : preset, custom);
    let thrown = 0, alone = 0;
    for (let i = 0; i < 5000; i++) {
      const st = randomHand(rules, newSeed(), i % 4);
      if (st.maker === null) { thrown++; assert.ok(!rules.stickDealer, "with stick the dealer, someone always calls"); assert.equal(st.history.length, 0); continue; }
      const active = 4 - st.out.length;
      if (st.alone) alone++;
      assert.equal(st.history.length, 5 * active);
      assert.equal(new Set(st.history.map((h) => h.card)).size, 5 * active);
      assert.equal(st.tricks.reduce((a, b) => a + b), 5);
      assert.equal(new Set([...st.hands.flat(), ...st.kitty, ...st.history.map((h) => h.card)]).size, 24, "no card lost or doubled");
      assert.equal(st.kitty.length, 4);
      const sc = E.score(st);
      assert.equal(sc.lines.length, 1); assert.equal(sc.totals.score[0] + sc.totals.score[1], sc.lines[0].pts);
    }
    assert.ok(rules.stickDealer || thrown > 0); assert.ok(alone > 0);
  });
}

// ---------------------------------------------------------------- scoring tables (every preset)

function done(preset, { maker, alone = false, defender = null, took, custom = {} }) {
  const st = E.newHand(rulesFor(cfg, "euchre", preset, custom), newSeed(), 3);
  const t = team(maker), tricks = [0, 0, 0, 0];
  tricks[maker] = took; tricks[(maker + 1) % 4] = 5 - took;
  Object.assign(st, { maker, alone, defender, trump: "S", tricks, phase: "done" });
  const sc = E.score(st), l = sc.lines[0];
  assert.equal(l.took, took);
  return `${l.team === t ? "makers" : "defenders"} ${l.kind} ${l.pts}`;
}
for (const preset of cfg.presets)
  test(`${preset}: scoring table (made 1, march 2, loner 1 / ${rulesFor(cfg, "euchre", preset).aloneScore}, euchre 2, lone defender 4)`, () => {
    const A = rulesFor(cfg, "euchre", preset).aloneScore;
    for (const maker of [0, 1, 2, 3]) {
      assert.equal(done(preset, { maker, took: 3 }), "makers made 1");
      assert.equal(done(preset, { maker, took: 4 }), "makers made 1");
      assert.equal(done(preset, { maker, took: 5 }), "makers march 2");
      assert.equal(done(preset, { maker, took: 2 }), "defenders euchre 2");
      assert.equal(done(preset, { maker, took: 0 }), "defenders euchre 2");
      assert.equal(done(preset, { maker, alone: true, took: 3 }), "makers loner 1");
      assert.equal(done(preset, { maker, alone: true, took: 5 }), `makers lonerMarch ${A}`);
      assert.equal(done(preset, { maker, alone: true, took: 1 }), "defenders euchre 2");
      assert.equal(done(preset, { maker, alone: true, defender: (maker + 1) % 4, took: 2 }), "defenders loneEuchre 4");
      assert.equal(done(preset, { maker, alone: true, defender: (maker + 1) % 4, took: 5 }), `makers lonerMarch ${A}`);
    }
    assert.equal(done(preset, { maker: 0, alone: true, took: 5, custom: { aloneScore: 5 } }), "makers lonerMarch 5");
  });

test("thrown in: no maker, nobody scores", () => {
  const st = E.newHand(rulesFor(cfg, "euchre", "standard"), newSeed(), 0);
  for (let i = 0; i < 8; i++) E.apply(st, { call: "pass" });
  assert.equal(st.phase, "done");
  assert.deepEqual(E.score(st), { lines: [{ team: null, kind: "thrown", pts: 0 }], totals: { score: [0, 0] } });
});

test("game end: first to 10 (or 11)", () => {
  const r10 = rulesFor(cfg, "euchre", "standard"), r11 = rulesFor(cfg, "euchre", "standard", { target: 11 });
  assert.equal(E.winner({ score: [10, 7] }, r10), 0); assert.equal(E.winner({ score: [8, 12] }, r10), 1);
  assert.equal(E.winner({ score: [10, 7] }, r11), null); assert.equal(E.winner({ score: [9, 9] }, r10), null);
});

// ---------------------------------------------------------------- the house rules, one by one (E09)

const fresh = (preset, custom = {}, dealer = 3) => E.newHand(rulesFor(cfg, "euchre", preset, custom), newSeed(), dealer);

test("stick the dealer: on in Kitchen and Tournament, the dealer must name trump on the second round", () => {
  for (const [preset, stuck] of [["standard", false], ["kitchen", true], ["tournament", true]]) {
    const st = fresh(preset, { farmersHand: false });
    for (let i = 0; i < 7; i++) E.apply(st, { call: "pass" });
    assert.equal(st.turn, st.dealer); assert.equal(st.phase, "bid2");
    assert.equal(E.legal(st).some((a) => a.call === "pass"), !stuck, preset);
  }
});

test("ordering up: the dealer picks up and discards; the leader is left of the dealer", () => {
  const st = fresh("standard"), up = st.up;
  E.apply(st, { call: "order" });
  assert.equal(st.trump, up[1]); assert.equal(st.maker, 0); assert.equal(st.phase, "discard"); assert.equal(st.turn, 3);
  assert.ok(st.hands[3].includes(up));
  const d = st.hands[3][0];
  E.apply(st, d);
  assert.equal(st.discard, d); assert.equal(st.hands[3].length, 5); assert.ok(st.kitty.includes(d));
  assert.equal(st.phase, "play"); assert.equal(st.turn, 0);
  assert.equal(E.view(st, 3).discard, d); assert.equal(E.view(st, 0).discard, null, "only the dealer knows the discard");
});

test("going alone: partner sits out; the dealer's partner going alone means the dealer doesn't pick up", () => {
  let st = fresh("standard");
  E.apply(st, { call: "pass" }); E.apply(st, { call: "order", alone: true }); // seat 1 (dealer's partner) alone
  assert.deepEqual(st.out, [3]); assert.equal(st.phase, "play"); assert.equal(st.hands[3].length, 5); assert.equal(st.turn, 0);
  st = fresh("standard");
  E.apply(st, { call: "order", alone: true }); // seat 0 alone: partner 2 out, dealer 3 still picks up
  assert.deepEqual(st.out, [2]); assert.equal(st.phase, "discard");
});

test("Canadian loner: the dealer's partner may order up only alone", () => {
  const st = fresh("standard", { canadianLoner: true });
  E.apply(st, { call: "pass" });
  assert.equal(st.turn, 1);
  assert.deepEqual(E.legal(st), [{ call: "pass" }, { call: "order", alone: true }]);
  E.apply(st, { call: "pass" });
  assert.ok(E.legal(st).some((a) => a.call === "order" && !a.alone), "others may still assist");
});

test("defend alone: a defender may go alone against a loner; a euchre then scores 4", () => {
  const st = fresh("standard", { defendAlone: true });
  E.apply(st, { call: "pass" }); E.apply(st, { call: "order", alone: true }); // seat 1 alone, dealer 3 out
  assert.equal(st.phase, "defend"); assert.equal(st.turn, 2);
  E.apply(st, { defend: false });
  assert.equal(st.turn, 0);
  E.apply(st, { defend: true });
  assert.equal(st.defender, 0); assert.deepEqual(st.out.sort(), [2, 3]); assert.equal(st.phase, "play");
  assert.equal(st.turn, 0, "dealer's left leads; seats 2 and 3 sit out");
});

test("loner's left leads (Tournament): the opponent on the loner's left leads", () => {
  const st = fresh("tournament", { farmersHand: false });
  E.apply(st, { call: "pass" }); E.apply(st, { call: "pass" }); E.apply(st, { call: "order", alone: true }); // seat 2, dealer 3 picks up
  E.apply(st, st.hands[3][0]);
  assert.equal(st.turn, 3, "left of seat 2");
  const s2 = fresh("standard");
  E.apply(s2, { call: "pass" }); E.apply(s2, { call: "pass" }); E.apply(s2, { call: "order", alone: true });
  E.apply(s2, s2.hands[3][0]);
  assert.equal(s2.turn, 1, "otherwise dealer's left (seat 0) is out, so seat 1 leads");
});

test("farmer's hand: all nines and tens may swap three with the kitty (Kitchen only)", () => {
  let found = 0;
  for (let i = 0; i < 40000 && found < 5; i++) {
    const seed = newSeed(), k = E.newHand(rulesFor(cfg, "euchre", "kitchen"), seed, 3), s = E.newHand(rulesFor(cfg, "euchre", "standard"), seed, 3);
    const farmer = k.hands.findIndex(E.isFarmer);
    assert.equal(s.phase, "bid1", "no farmer's hand in Standard");
    if (farmer < 0) { assert.equal(k.phase, "bid1"); continue; }
    found++;
    assert.equal(k.phase, "farmer"); assert.equal(k.turn, farmer);
    assert.equal(E.legal(k).length, 11, "keep, or any 3 of 5");
    const give = k.hands[farmer].slice(0, 3), under = k.kitty.slice(1), up = k.up;
    E.apply(k, { swap: give });
    assert.deepEqual(k.hands[farmer].slice(2).sort(), [...under].sort());
    assert.deepEqual(k.kitty.slice(1).sort(), [...give].sort()); assert.equal(k.kitty[0], up);
    if (k.phase === "farmer") E.apply(k, { swap: null });
    assert.equal(k.phase, "bid1"); assert.equal(k.turn, 0);
  }
  assert.ok(found >= 1, "no farmer's hand in 40,000 deals");
});

test("a view shows the upcard and every call, never another hand or the kitty", () => {
  for (let i = 0; i < 300; i++) {
    const st = randomHand(rulesFor(cfg, "euchre", "kitchen"), newSeed(), i % 4);
    for (let seat = 0; seat < 4; seat++) {
      const v = E.view(st, seat), text = JSON.stringify({ ...v, rules: null, up: null });
      for (const c of st.kitty) if (c !== v.discard && !st.history.some((h) => h.card === c)) assert.ok(!text.includes(`"${c}"`), `kitty card ${c} visible`);
    }
  }
});

console.log(`${n} Euchre rule checks passed`);
