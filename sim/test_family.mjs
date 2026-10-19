// Oh Hell and Whist: dealing, legal play, the hook, scoring tables, game end. Run: node sim/test_family.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newSeed, deal } from "../proto/dealer.js";
import { newDeck, rulesFor, dealHands } from "../proto/cards.js";
import * as ohhell from "../proto/ohhell.js";
import * as whist from "../proto/whist.js";
import { bidPanel } from "../proto/family-ui.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
let n = 0, r = 3;
const test = (name, fn) => { fn(); n++; console.log("ok", name); };
const rng = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 2 ** 32);

test("both games are under the Everything unlock and every rule is explained", () => {
  const ev = cfg.products.find((p) => p.id === "everything");
  for (const g of ["ohhell", "whist"]) {
    assert.ok(ev.unlocks.includes(g) && cfg.games[g].free === false, `${g} is part of Everything`);
    assert.ok(cfg.rules[g].length && cfg.rules[g].every((d) => d.name && d.explain.length > 20 && cfg.presets.every((p) => p in d.presets)));
    assert.ok(cfg.leaderboards.some((b) => b.id === `${g}_wins`));
  }
  assert.equal(cfg.games.whist.teams, true); assert.equal(cfg.games.ohhell.teams, false);
});

// ---------------------------------------------------------------- dealing (only from dealer.js)

test("oh hell: hand sizes follow every preset's sequence", () => {
  const seq = (p) => ohhell.sequence(rulesFor(cfg, "ohhell", p)).join(" ");
  assert.equal(seq("tournament"), "13 12 11 10 9 8 7 6 5 4 3 2 1 2 3 4 5 6 7 8 9 10 11 12 13");
  assert.equal(seq("standard"), "7 6 5 4 3 2 1 2 3 4 5 6 7");
  assert.equal(seq("kitchen"), "1 2 3 4 5 6 7");
});

test("oh hell: the deal is the seed's shuffle, round-robin from the dealer's left; the next card is trump", () => {
  const rules = rulesFor(cfg, "ohhell", "standard"), deck = newDeck();
  for (let i = 0; i < 300; i++) {
    const seed = newSeed(), handNo = i % 13, dealer = i % 4, st = ohhell.newHand(rules, seed, dealer, undefined, handNo), p = deal(seed, 52), size = st.size;
    assert.equal(size, ohhell.handSize(rules, handNo));
    assert.deepEqual(st.hands.map((h) => h.length), [size, size, size, size]);
    assert.deepEqual(st.hands[(dealer + 1) % 4][0], deck[p[0]], "the first card goes left of the dealer");
    assert.equal(st.trumpCard, deck[p[4 * size]]);
    assert.equal(st.trump, st.trumpCard[1]);
    assert.equal(new Set(st.hands.flat().concat(st.trumpCard)).size, 4 * size + 1);
    assert.deepEqual(ohhell.newHand(rules, seed, dealer, undefined, handNo).hands, st.hands, "same seed, same deal");
  }
  const big = ohhell.newHand(rulesFor(cfg, "ohhell", "tournament"), newSeed(), 0, undefined, 0);
  assert.equal(big.size, 13); assert.equal(big.trumpCard, null, "all 52 dealt: no trump this hand"); assert.equal(big.trump, null);
});

test("whist: 13 each from dealHands; the dealer's last card is trump and stays in the dealer's hand", () => {
  const rules = rulesFor(cfg, "whist", "standard"), deck = newDeck();
  for (let i = 0; i < 300; i++) {
    const seed = newSeed(), dealer = i % 4, st = whist.newHand(rules, seed, dealer);
    assert.deepEqual(st.hands, dealHands(seed, dealer, deck));
    assert.equal(st.trumpCard, deck[deal(seed, 52)[51]], "the 52nd card dealt");
    assert.ok(st.hands[dealer].includes(st.trumpCard));
    assert.equal(st.phase, "play"); assert.equal(st.turn, (dealer + 1) % 4, "left of the dealer leads");
  }
});

test("the new engines deal only through dealer.js and read nothing else", () => {
  for (const f of ["ohhell.js", "whist.js"]) {
    const src = readFileSync(new URL(`../proto/${f}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /Math\.random|crypto|localStorage|window\.|document\.|platform|purchase|streak|human/, f);
    assert.ok([...src.matchAll(/from "([^"]+)"/g)].every((m) => ["./dealer.js", "./cards.js"].includes(m[1])), f);
  }
});

// ---------------------------------------------------------------- the hook and legal play

test("oh hell: the dealer's hook forbids exactly the bid that makes the total equal the tricks", () => {
  const rules = rulesFor(cfg, "ohhell", "standard"), st = ohhell.newHand(rules, newSeed(), 3, undefined, 2); // 5 cards
  for (const b of [2, 1, 0]) ohhell.apply(st, { bid: b });
  assert.equal(st.turn, 3);
  assert.equal(ohhell.hookBid(st), 2);
  assert.deepEqual(ohhell.legal(st).map((a) => a.bid), [0, 1, 3, 4, 5]);
  assert.throws(() => ohhell.apply(structuredClone(st), { bid: 2 }));
  const off = ohhell.newHand(rulesFor(cfg, "ohhell", "kitchen"), newSeed(), 3, undefined, 4); // hook off, 5 cards
  for (const b of [2, 1, 0]) ohhell.apply(off, { bid: b });
  assert.equal(ohhell.hookBid(off), null); assert.equal(ohhell.legal(off).length, 6);
  const over = ohhell.newHand(rules, newSeed(), 3, undefined, 6); // 1 card, bids already over
  for (const b of [1, 1, 0]) ohhell.apply(over, { bid: b });
  assert.equal(ohhell.legal(over).length, 2, "nothing to hook when the bids are already over");
  const before = ohhell.newHand(rules, newSeed(), 3, undefined, 6);
  ohhell.apply(before, { bid: 0 });
  assert.equal(ohhell.hookBid(before), null, "only the dealer is hooked");
});

test("oh hell bid stepper: the hooked number is stepped over both ways and never offered", () => {
  const st = ohhell.newHand(rulesFor(cfg, "ohhell", "standard"), newSeed(), 3, undefined, 2); // 5 cards
  for (const b of [1, 0, 1]) ohhell.apply(st, { bid: b }); // hook: 3
  const mine = { legal: ohhell.legal(st), step: 2 }, shown = () => +bidPanel(mine, st).match(/data-act="bid" data-v="(\d+)"/)[1];
  assert.equal(shown(), 2);
  mine.step = 3; mine.dir = 1; assert.equal(shown(), 4, "stepping up over the hook");
  mine.step = 3; mine.dir = -1; assert.equal(shown(), 2, "stepping down over the hook");
  mine.step = 9; assert.equal(shown(), 5, "never more than the cards in hand");
  assert.match(bidPanel(mine, st), /can't bid 3/);
  const one = ohhell.newHand(rulesFor(cfg, "ohhell", "standard"), newSeed(), 3, undefined, 6); // 1 card
  for (const b of [0, 0, 0]) ohhell.apply(one, { bid: b }); // hook: 1, so only 0
  const m1 = { legal: ohhell.legal(one), step: 1, dir: 1 };
  assert.equal(+bidPanel(m1, one).match(/data-act="bid" data-v="(\d+)"/)[1], 0);
});

function randomHand(g, rules, seed, handNo) {
  const st = g.newHand(rules, seed, handNo % 4, undefined, handNo);
  while (st.phase !== "done") {
    const legal = g.legal(st), s = st.turn;
    if (st.phase === "bid") { g.apply(st, legal[Math.floor(rng() * legal.length)]); continue; }
    const hand = [...st.hands[s]], card = legal[Math.floor(rng() * legal.length)];
    if (st.trick.length) { const led = st.trick[0].card[1]; if (hand.some((c) => c[1] === led)) assert.equal(card[1], led, `renege: ${s} played ${card} on ${led}`); }
    else if (rules.trumpBroken && st.trump && !st.broken && card[1] === st.trump) assert.ok(hand.every((c) => c[1] === st.trump), "led trump before broken");
    // the trick goes to the highest trump, else the highest card of the suit led (checked by hand, not with the engine's helper)
    const trick = [...st.trick, { seat: s, card }];
    g.apply(st, card);
    if (trick.length === 4) {
      const tr = trick.filter((t) => t.card[1] === st.trump), pool = tr.length ? tr : trick.filter((t) => t.card[1] === trick[0].card[1]);
      const best = pool.reduce((a, b) => (g.pow(b.card) > g.pow(a.card) ? b : a));
      assert.equal(st.turn, best.seat, "the right seat won the trick");
    }
  }
  if (rules.hook) assert.notEqual(st.bids.reduce((a, b) => a + b), st.size, "with the hook somebody must miss");
  return st;
}

for (const [name, g] of [["ohhell", ohhell], ["whist", whist]])
  for (const preset of cfg.presets)
    test(`${name}/${preset}: 2,000 random hands follow suit, give each trick to the right seat, play every card once`, () => {
      const rules = rulesFor(cfg, name, preset);
      for (let i = 0; i < 2000; i++) {
        const st = randomHand(g, rules, newSeed(), i), size = st.size ?? 13;
        assert.equal(st.history.length, 4 * size);
        assert.equal(new Set(st.history.map((h) => h.card)).size, 4 * size);
        assert.equal(st.tricks.reduce((a, b) => a + b), size);
        g.score(st);
      }
    });

test("oh hell: trump must be broken to lead, when that rule is on", () => {
  const rules = rulesFor(cfg, "ohhell", "standard", { trumpBroken: true });
  for (let i = 0; i < 500; i++) randomHand(ohhell, rules, newSeed(), i % 13);
});

// ---------------------------------------------------------------- scoring tables (the score sheet prints these lines)

function ohDone(preset, bids, tricks, custom = {}, totals) {
  const st = ohhell.newHand(rulesFor(cfg, "ohhell", preset, custom), newSeed(), 0, totals, 0);
  Object.assign(st, { bids, tricks, phase: "done" });
  return ohhell.score(st);
}
const ln = (sc) => sc.lines.map((l) => `${l.kind}:${l.pts}`).join(" ");

test("oh hell scoring: 10 + tricks, 1 a trick + 10, minus misses", () => {
  assert.equal(ln(ohDone("standard", [3, 0, 2, 1], [3, 0, 3, 1])), "exact:13 exact:10 miss:0 exact:11");
  assert.equal(ln(ohDone("kitchen", [3, 0, 2, 1], [3, 0, 3, 1])), "exact:13 exact:10 miss:3 exact:11");
  assert.equal(ln(ohDone("standard", [3, 0, 2, 1], [1, 1, 4, 1], { scoring: "minus misses" })), "miss:-20 miss:-10 miss:-20 exact:11");
  const sc = ohDone("standard", [1, 1, 1, 1], [1, 1, 1, 0], {}, { score: [10, 20, 30, 40], hands: 4 });
  assert.deepEqual(sc.totals, { score: [21, 31, 41, 40], hands: 5 });
});

test("oh hell game end: after the last hand the high score wins; a tie for first plays another hand", () => {
  const rules = rulesFor(cfg, "ohhell", "standard"); // 13 hands
  assert.equal(ohhell.winner({ score: [90, 80, 70, 60], hands: 12 }, rules), null);
  assert.equal(ohhell.winner({ score: [90, 80, 70, 60], hands: 13 }, rules), 0);
  assert.equal(ohhell.winner({ score: [90, 95, 70, 95], hands: 13 }, rules), null);
  assert.equal(ohhell.handSize(rules, 13), 7, "the extra hand is the last size again");
  assert.equal(ohhell.winner({ score: [90, 95, 70, 96], hands: 14 }, rules), 3);
});

function whDone(preset, tricks, { totals = { score: [0, 0] }, honours = null } = {}) {
  const st = whist.newHand(rulesFor(cfg, "whist", preset), newSeed(), 3, totals);
  if (honours) { // deal team `honours[0]` exactly `honours[1]` of the trump honours (swap cards between the hands)
    const [t, k] = honours, want = whist.HONOURS.slice(0, k).map((x) => x + st.trump), rest = whist.HONOURS.slice(k).map((x) => x + st.trump);
    const move = (c, toTeam) => { const from = st.dealt.findIndex((h) => h.includes(c)); if (from % 2 === toTeam) return;
      const to = toTeam, swap = st.dealt[to].find((x) => x[1] !== st.trump); st.dealt[from][st.dealt[from].indexOf(c)] = swap; st.dealt[to][st.dealt[to].indexOf(swap)] = c; };
    want.forEach((c) => move(c, t)); rest.forEach((c) => move(c, 1 - t));
  }
  Object.assign(st, { tricks, phase: "done" });
  return whist.score(st);
}
const wl = (sc, t) => sc.lines.filter((l) => l.team === t).map((l) => `${l.kind}:${l.pts}`).join(" ");

test("whist scoring: tricks over the book of six", () => {
  let sc = whDone("standard", [5, 2, 4, 2]);
  assert.equal(wl(sc, 0), "tricks:3"); assert.equal(wl(sc, 1), "book:0"); assert.deepEqual(sc.totals.score, [3, 0]);
  sc = whDone("standard", [3, 3, 3, 4]);
  assert.equal(wl(sc, 1), "tricks:1");
  sc = whDone("standard", [7, 0, 6, 0]);
  assert.equal(wl(sc, 0), "tricks:7");
});

test("whist honours: four score 4, three score 2, off by default, none at the point or once tricks win the game", () => {
  let sc = whDone("kitchen", [3, 3, 2, 5], { honours: [0, 4] });
  assert.equal(wl(sc, 0), "book:0 honours:4"); assert.equal(wl(sc, 1), "tricks:2"); assert.deepEqual(sc.totals.score, [4, 2]);
  sc = whDone("kitchen", [3, 3, 2, 5], { honours: [0, 3] });
  assert.equal(wl(sc, 1), "tricks:2", "the other side holds just one: no honours line");
  assert.equal(wl(sc, 0), "book:0 honours:2");
  sc = whDone("standard", [3, 3, 2, 5], { honours: [0, 4] });
  assert.equal(wl(sc, 0), "book:0", "honours are off in the standard preset");
  sc = whDone("kitchen", [3, 3, 2, 5], { honours: [0, 4], totals: { score: [4, 0] } });
  assert.equal(wl(sc, 0), "book:0 honours:0", "at the point (4 of 5): honours don't count"); assert.deepEqual(sc.totals.score, [4, 2]);
  sc = whDone("kitchen", [3, 3, 2, 5], { honours: [0, 4], totals: { score: [0, 3] } });
  assert.equal(wl(sc, 0), "book:0", "tricks took them to game first"); assert.equal(whist.winner(sc.totals, rulesFor(cfg, "whist", "kitchen")), 1);
  sc = whDone("kitchen", [3, 3, 2, 5], { honours: [0, 4], totals: { score: [2, 0] } });
  assert.deepEqual(sc.totals.score, [5, 2], "honours take a side to game, not past it");
});

test("whist game end: first side to 5 or 7", () => {
  const r7 = rulesFor(cfg, "whist", "standard"), r5 = rulesFor(cfg, "whist", "kitchen");
  assert.equal(whist.winner({ score: [6, 4] }, r7), null);
  assert.equal(whist.winner({ score: [6, 8] }, r7), 1);
  assert.equal(whist.winner({ score: [5, 1] }, r5), 0);
});

test("views carry the turned trump card; oh hell's never shows what wasn't dealt", () => {
  const st = ohhell.newHand(rulesFor(cfg, "ohhell", "standard"), newSeed(), 0, undefined, 3);
  const v = ohhell.view(st, 1);
  assert.equal(v.trumpCard, st.trumpCard); assert.equal(v.size, 4); assert.deepEqual(v.hand, st.hands[1]);
  const w = whist.view(whist.newHand(rulesFor(cfg, "whist", "standard"), newSeed(), 2), 0);
  assert.ok(w.trumpCard && w.trump === w.trumpCard[1]);
});

console.log(`${n} family checks passed`);
