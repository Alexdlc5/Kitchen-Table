// Every Oh Hell and Whist sin from docs/AI_SPEC.md §6-§7 as a scenario the bots must pass at every level, plus the
// honesty checks (views show nothing hidden; the bot modules read nothing but the view). Run: node sim/test_ai_family.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rulesFor } from "../proto/cards.js";
import { newSeed } from "../proto/dealer.js";
import * as ohhell from "../proto/ohhell.js";
import * as whist from "../proto/whist.js";
import { decide, sins, LEVELS } from "../proto/ai.js";
import { count } from "../proto/ai-ohhell.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
let n = 0, r = 11;
const rng = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 2 ** 32);
const H = (s) => (s ? s.split(" ") : []);
const parse = (t) => (t ? t.split(" ").map((x) => ({ seat: +x[0], card: x.slice(2) })) : []);

// a table position as seat 0 sees it. trick: "1:9H 2:AH" (seat:card in play order); history: earlier tricks the same way
function table(game, { preset = "standard", custom, hand, trick = "", history = [], dealer = 3, ...rest }) {
  const hist = history.flatMap((t, i) => parse(t).map((p) => ({ ...p, n: i })));
  const tr = parse(trick), left = H(hand).length;
  const sizes = [0, 1, 2, 3].map((s) => (s === 0 ? left : left - (tr.some((t) => t.seat === s) ? 1 : 0)));
  return { game, rules: rulesFor(cfg, game, preset, custom), seat: 0, dealer, phase: "play", turn: 0, hand: H(hand), sizes, trick: tr, history: hist, ...rest };
}
const oh = ({ size, trumpCard = "2D", bids = [1, 1, 1, 1], tricks = [0, 0, 0, 0], totals = { score: [0, 0, 0, 0], hands: 0 }, ...o }) =>
  table("ohhell", { size, handNo: 0, trump: trumpCard && trumpCard[1], trumpCard, bids, tricks, broken: false, totals, ...o });
const wh = ({ trumpCard = "2D", tricks = [0, 0, 0, 0], totals = { score: [0, 0] }, ...o }) => table("whist", { trump: trumpCard[1], trumpCard, tricks, totals, ...o });

function sc(id, what, view, check, levels = LEVELS) {
  for (const level of levels) {
    for (let k = 0; k < (level === "easy" ? 12 : 1); k++) { // Easy is random: try it many times
      const d = decide(structuredClone(view), level, rng, { ...cfg.ai, expertSamples: 12, extremeSamples: 16 });
      assert.deepEqual(sins(view, d.action), [], `${id} ${level}: ${JSON.stringify(d)} commits a sin`);
      assert.ok(check(d.action), `${id} ${level}: ${what}; played ${JSON.stringify(d.action)} (${d.reason})`);
    }
  }
  n++; console.log("ok", id, what);
}

// ---------------------------------------------------------------- Oh Hell (§6)

sc("O01", "exactly on my bid and last: never take the trick", oh({ size: 4, bids: [1, 0, 2, 1], tricks: [1, 0, 1, 0], hand: "KH 3H 9C", trick: "1:5H 2:TH 3:2C", history: ["0:AS 1:3S 2:4S 3:5S"] }), (c) => c === "3H");
sc("O01", "don't overtake an opponent sitting on their bid: they bust, I stay exact",
  oh({ size: 4, bids: [1, 0, 2, 0], tricks: [1, 0, 1, 0], hand: "AC 4C 9S", trick: "1:QC 2:2C 3:3C", history: ["0:AH 1:3H 2:4H 3:5H"] }), (c) => c === "4C");
sc("O01", "on my bid and void: throw a card that loses, never trump in", oh({ size: 3, trumpCard: "2S", bids: [0, 1, 1, 0], hand: "5S QD 4D", trick: "1:KH 2:3H 3:7H", }), (c) => c !== "5S");
sc("O02", "count the hand: ace, king of trump and an outside ace bid about three",
  oh({ size: 7, phase: "bid", trumpCard: "2H", bids: [null, null, null, null], hand: "AH KH AS 4C 5C 6D 7D" }), (a) => a.bid >= 2 && a.bid <= 4);
sc("O02", "hooked dealer moves one trick off its count, never two", oh({ size: 5, phase: "bid", dealer: 0, trumpCard: "2S", bids: [null, 1, 1, 0], hand: "AS KS AH 3D 4C" }),
  (a) => a.bid !== 3 && Math.abs(a.bid - Math.round(count(oh({ size: 5, phase: "bid", dealer: 0, trumpCard: "2S", bids: [null, 1, 1, 0], hand: "AS KS AH 3D 4C" })))) <= 1);
sc("O02", "a hand of nothing bids nothing", oh({ size: 5, phase: "bid", trumpCard: "2S", bids: [null, null, 2, 1], hand: "2H 3H 4D 5C 6C" }), (a) => a.bid <= 1);
sc("O03", "need a trick, last to play and can win it: take it", oh({ size: 4, bids: [2, 1, 0, 1], tricks: [1, 0, 0, 1], hand: "KH 3H 3C", trick: "1:4H 2:JH 3:2H", history: ["0:AS 1:3S 2:4S 3:5S"] }), (c) => c === "KH");
sc("O03", "need a trick and void in the suit led: trump it when last", oh({ size: 3, trumpCard: "2S", bids: [1, 0, 1, 1], hand: "4S 9D 3D", trick: "1:KH 2:5H 3:6H" }), (c) => c === "4S");
sc("O04", "need tricks but can't win this one: keep the high cards", oh({ size: 4, bids: [2, 1, 1, 0], hand: "QD JD 3D 8C", trick: "1:AD 2:4D 3:5D" }), (c) => c === "3D");
// review 2 (AI-O1): on my bid and void, a trump that loses this trick goes first; it is the card that busts me later
sc("O01", "on my bid and void: throw the 8 of trump under the king of trump, keep the side king",
  oh({ size: 7, trumpCard: "5D", bids: [2, 1, 1, 2], tricks: [2, 1, 1, 0], hand: "KS 8S 8D", trick: "2:8H 3:KD",
    history: ["0:AD 1:6H 2:TD 3:2D", "0:KH 1:7H 2:2H 3:QH", "0:2C 1:AC 2:4C 3:6C", "1:8C 2:KC 3:QC 0:7C"] }), (c) => c === "8D");
sc("O01", "on my bid and void: throw a small trump under the 9 of trump, not the 7 of diamonds",
  oh({ size: 7, trumpCard: "5H", dealer: 0, bids: [1, 2, 1, 2], tricks: [1, 1, 1, 1], hand: "6H 2H 7D", trick: "2:2C 3:9H",
    history: ["1:AS 2:9S 3:4S 0:3S", "1:9D 2:4D 3:JD 0:AD", "0:3C 1:5C 2:JC 3:8H", "3:KS 0:JS 1:3H 2:4H"] }), (c) => c[1] === "H");

// ---------------------------------------------------------------- Whist (§7)

sc("W01", "partner is winning and I'm last: never overtake", wh({ hand: "KH 2H 5C 7D", trick: "1:9H 2:QH 3:4H" }), (c) => c === "2H");
sc("W01", "partner is winning and I'm last: never trump it", wh({ trumpCard: "2S", hand: "5S 9S 2C 3D", trick: "1:9H 2:AH 3:4H" }), (c) => c[1] !== "S");
sc("W02", "return partner's lead", wh({ trumpCard: "JC", hand: "9D 4D 8C 7C 3H 2H TS 9S 8S 6S", history: ["2:KD 3:5D 0:2D 1:7D", "2:QS 3:AS 0:3S 1:4S", "3:5H 0:AH 1:6H 2:7H"] }), (c) => c[1] === "D");
sc("W02", "not into a ruff: an opponent is out of partner's suit", wh({ hand: "9D 4D 8C 7C 6C 2H 3H 4H 9H TH", history: ["2:KD 3:5D 0:2D 1:7D", "2:QD 3:3S 0:3D 1:8D", "3:5H 0:AH 1:6H 2:7H"], trumpCard: "2S" }), (c) => c[1] !== "D");
sc("W03", "second hand: cover an honour with an honour", wh({ hand: "KC 5C 9H 3D", trick: "3:QC" }), (c) => c === "KC");
sc("W03", "second hand: cover the jack, never duck under it", wh({ hand: "AC QC 5C 9H", trick: "3:JC" }), (c) => c !== "5C");
sc("W04", "can't beat the opponents' card: keep the high one", wh({ hand: "QD 3D 9H 9C", trick: "1:AD 2:4D 3:5D" }), (c) => c === "3D");
sc("W05", "partner's ace is good and the last opponent can follow: don't trump it", wh({ trumpCard: "2S", hand: "4S 9C 8C", trick: "2:AH 3:4H" }), (c) => c[1] !== "S");
// review 2 (AI-W1, AI-W2): partner's card is safe only if it's boss, I'm last, or the last player can't beat it
sc("W04", "third hand: partner led the 4 of hearts and I hold the boss queen: play it, not the 5",
  wh({ trumpCard: "4S", dealer: 1, tricks: [0, 2, 2, 2], hand: "5H 9H TD 7H JC QH KD", trick: "2:4H 3:2D",
    history: ["2:2S 3:5S 0:9S 1:JS", "1:AH 2:2H 3:KH 0:3H", "1:5C 2:AC 3:2C 0:8C", "2:3S 3:AS 0:8S 1:4S", "3:AD 0:6D 1:4D 2:9D", "3:KC 0:9C 1:7C 2:6S"] }),
  (c) => c === "QH", ["standard", "expert", "extreme"]); // Easy may slip to another heart
sc("W05", "partner's 9 of clubs can still be beaten by the last player: ruff it low",
  wh({ trumpCard: "8D", tricks: [2, 1, 3, 2], hand: "6D 8S 6S JS 9H", trick: "2:9C 3:9S",
    history: ["0:AH 1:QH 2:5H 3:3H", "0:2H 1:3D 2:8H 3:4H", "1:6C 2:4C 3:QC 0:2C", "3:AC 0:2D 1:3C 2:5C", "0:5S 1:2S 2:AS 3:4S",
      "2:AD 3:8D 0:4D 1:TD", "2:KC 3:9D 0:6H 1:7C", "3:KH 0:7H 1:3S 2:5D"] }), (c) => c === "6D");

// ---------------------------------------------------------------- honesty: what a bot can see (AI_SPEC §1)

{
  const allowed = { ohhell: "game rules seat dealer phase turn handNo size trump trumpCard hand sizes bids trick tricks history broken totals", whist: "game rules seat dealer phase turn trump trumpCard hand sizes trick tricks history totals" };
  for (const [name, g] of [["ohhell", ohhell], ["whist", whist]]) {
    const rules = rulesFor(cfg, name, "standard");
    for (let i = 0; i < 300; i++) {
      const st = g.newHand(rules, newSeed(), i % 4, undefined, i % 13);
      let steps = Math.floor(rng() * 40);
      while (st.phase !== "done" && steps--) g.apply(st, decide(g.view(st, st.turn), "standard", rng).action);
      for (let seat = 0; seat < 4; seat++) {
        const v = g.view(st, seat);
        assert.deepEqual(Object.keys(v).sort(), allowed[name].split(" ").sort(), `${name}: a view has exactly the public fields`);
        const open = new Set([...v.hand, ...v.history.map((h) => h.card), ...v.trick.map((t) => t.card), v.trumpCard]);
        const text = JSON.stringify({ ...v, rules: null });
        for (let o = 0; o < 4; o++) if (o !== seat) for (const c of st.hands[o]) if (!open.has(c)) assert.ok(!text.includes(`"${c}"`), `${name}: seat ${seat} can see ${c} in seat ${o}'s hand`);
        assert.ok(!text.includes(st.seed), "no seed in a view");
      }
    }
  }
  n++; console.log("ok", "views never show another hand, the undealt cards, the seed, or who is human");
  for (const f of ["ai-ohhell.js", "ai-whist.js"]) {
    const src = readFileSync(new URL(`../proto/${f}`, import.meta.url), "utf8");
    assert.ok([...src.matchAll(/from "([^"]+)"/g)].every((m) => ["./ai.js", "./ohhell.js", "./whist.js", "./ai-ohhell.js"].includes(m[1])), f);
    assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /seed|human|purchase|streak|platform|localStorage/i, f);
  }
  n++; console.log("ok", "ai-ohhell.js and ai-whist.js read nothing but the view");
}

// seat-blind: the same position from a different chair gives the same decision
{
  const base = wh({ hand: "KC 5C 9H 3D 7S", trick: "2:4C 3:JC" });
  const rot = (s) => (s + 2) % 4;
  const turned = { ...structuredClone(base), seat: 2, turn: 2, dealer: 1, trick: base.trick.map((t) => ({ ...t, seat: rot(t.seat) })), sizes: [base.sizes[2], base.sizes[3], base.sizes[0], base.sizes[1]] };
  for (const level of ["standard", "expert", "extreme"]) {
    r = 99; const a = decide(structuredClone(base), level, rng).action;
    r = 99; const b = decide(turned, level, rng).action;
    assert.equal(a, b, `${level}: the decision changed when the table was rotated`);
  }
  n++; console.log("ok", "decisions don't depend on which chair (or who) is watching");
}

// whole hands at every level: never an illegal play, never a sin
for (const [name, g] of [["ohhell", ohhell], ["whist", whist]]) {
  const rules = rulesFor(cfg, name, "standard");
  for (const level of LEVELS) {
    for (let i = 0; i < (level === "standard" || level === "easy" ? 60 : 3); i++) {
      const st = g.newHand(rules, newSeed(), i % 4, undefined, i % 13);
      while (st.phase !== "done") {
        const v = g.view(st, st.turn), d = decide(v, level, rng, { ...cfg.ai, expertSamples: 8, extremeSamples: 10 });
        assert.ok(g.legal(st).some((a) => JSON.stringify(a) === JSON.stringify(d.action)), `${name} ${level}: illegal ${JSON.stringify(d.action)}`);
        assert.deepEqual(sins(v, d.action), [], `${name} ${level}: ${JSON.stringify(d)}`);
        g.apply(st, d.action);
      }
    }
  }
  n++; console.log("ok", `${name}: whole hands at every level, every play legal and clean`);
}

console.log(`\n${n} family AI checks passed`);
