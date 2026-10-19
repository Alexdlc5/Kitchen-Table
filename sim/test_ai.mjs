// Every partner/opponent sin from docs/AI_SPEC.md as a scenario the bots must pass at every level. Run: node sim/test_ai.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rulesFor, newDeck } from "../proto/cards.js";
import { newSeed } from "../proto/dealer.js";
import * as spades from "../proto/spades.js";
import * as hearts from "../proto/hearts.js";
import { decide, sins, LEVELS, estimateTricks } from "../proto/ai.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
let n = 0, r = 7;
const rng = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 2 ** 32);
const H = (s) => s.split(" ");

// a table position as seat 0 sees it. trick: "1:9H 2:AH" (seat:card in play order); history: earlier tricks the same way
function sv({ preset = "standard", custom, hand, bids = [3, 3, 3, 3], tricks = [0, 0, 0, 0], trick = "", history = [], broken = true, phase = "play", totals = { score: [0, 0], bags: [0, 0] }, blind = [false, false, false, false] }) {
  const parse = (t) => (t ? t.split(" ").map((x) => ({ seat: +x[0], card: x.slice(2) })) : []);
  const hist = history.flatMap((t, i) => parse(t).map((p) => ({ ...p, n: i })));
  const tr = parse(trick), left = H(hand).length;
  const sizes = [0, 1, 2, 3].map((s) => (s === 0 ? left : left - (tr.some((t) => t.seat === s) ? 1 : 0)));
  return { game: "spades", rules: rulesFor(cfg, "spades", preset, custom), seat: 0, dealer: 3, phase, turn: 0, hand: H(hand), sizes, bids, blind, trick: tr, tricks, history: hist, broken, totals };
}
function hv({ preset = "standard", hand, taken = [[], [], [], []], trick = "", history = [], broken = true, phase = "play", totals = { score: [0, 0, 0, 0] }, passed = null, dir = 1 }) {
  const parse = (t) => (t ? t.split(" ").map((x) => ({ seat: +x[0], card: x.slice(2) })) : []);
  const hist = history.flatMap((t, i) => parse(t).map((p) => ({ ...p, n: i })));
  const tr = parse(trick), left = H(hand).length;
  const sizes = [0, 1, 2, 3].map((s) => (s === 0 ? left : left - (tr.some((t) => t.seat === s) ? 1 : 0)));
  return { game: "hearts", rules: rulesFor(cfg, "hearts", preset), seat: 0, dealer: 3, phase, turn: 0, dir, hand: H(hand), sizes, passed, received: passed ? [] : null, trick: tr, tricks: [0, 0, 0, 0], taken, history: hist, broken, moon: null, totals };
}

function sc(id, what, view, check) {
  for (const level of LEVELS) {
    for (let k = 0; k < (level === "easy" ? 12 : 1); k++) { // Easy is random: try it many times
      const d = decide(structuredClone(view), level, rng, { ...cfg.ai, expertSamples: 12, extremeSamples: 16 });
      assert.deepEqual(sins(view, d.action), [], `${id} ${level}: ${JSON.stringify(d)} commits a sin`);
      assert.ok(check(d.action), `${id} ${level}: ${what}; played ${JSON.stringify(d.action)} (${d.reason})`);
    }
  }
  n++; console.log("ok", id, what);
}

// ---------------------------------------------------------------- Spades

sc("S01", "never nil holding the ace of spades", sv({ phase: "bid", bids: [null, null, null, null], hand: "AS 2H 3H 4H 5D 6D 7D 2C 3C 4C 5C 6C 7C" }), (a) => a.bid > 0);
sc("S01", "never nil holding a joker", sv({ preset: "kitchen", phase: "bid", bids: [null, null, null, null], hand: "BJ 3H 4H 5H 5D 6D 7D 3C 4C 5C 6C 7C 8C" }), (a) => a.bid > 0);
sc("S01", "never nil with the king of spades and only one other spade", sv({ phase: "bid", bids: [null, null, null, null], hand: "KS 2S 2H 3H 4H 5D 6D 7D 2C 3C 4C 5C 6C" }), (a) => a.bid > 0);
sc("S02", "never nil after partner's nil", sv({ phase: "bid", bids: [null, null, 0, 4], hand: "2S 3S 2H 3H 4H 5H 2D 3D 4D 5D 2C 3C 4C" }), (a) => a.bid >= 1);
sc("S03", "never trump a trick partner is winning when last", sv({ hand: "5S 9S 2C 3C 4D", trick: "1:9H 2:AH 3:4H" }), (c) => c[1] !== "S");
sc("S03", "never overtake partner when last", sv({ hand: "KH 2H 5C 7D", trick: "1:9H 2:QH 3:4H" }), (c) => c === "2H");
sc("S04", "never overtrump partner's spade when nobody left can beat it",
  sv({ hand: "KS 3S 5C 6D", trick: "2:QS 3:4S", history: ["2:AS 3:2S 0:4S 1:2C"] }), (c) => c === "3S");
sc("S05", "cover partner's nil: beat partner's card", sv({ bids: [4, 3, 0, 4], hand: "KH 2H 8C 9D", trick: "1:5H 2:QH 3:3H" }), (c) => c === "KH");
sc("S06", "cover partner's nil: trump rather than throw off", sv({ bids: [4, 3, 0, 4], hand: "3S 9S 4C 5C", trick: "1:5H 2:QH 3:3H" }), (c) => c === "3S");
sc("S07", "cover with the lowest winner, keep the big one", sv({ bids: [4, 3, 0, 4], hand: "AH KH 2H 8C", trick: "1:5H 2:QH 3:3H" }), (c) => c === "KH");
sc("S08", "partner's nil plays after me: play high to give partner room", sv({ bids: [4, 3, 0, 4], hand: "KC 4C 7D 8H", trick: "3:9C" }), (c) => c === "KC");
sc("S08", "both nils alive and theirs is winning: keep theirs trapped; partner can still duck", sv({ bids: [3, 4, 0, 0], hand: "KC 4C 7D 8H", trick: "3:9C" }), (c) => c === "4C");
sc("S09", "own nil: never trump when I can throw off", sv({ bids: [0, 3, 5, 4], hand: "QS 4H 6H 7C", trick: "1:9D 2:3D 3:5D" }), (c) => c[1] !== "S");
sc("S09", "own nil: duck with the highest card that still loses", sv({ bids: [0, 3, 5, 4], hand: "TD 8D 4H", trick: "1:9D 2:3D 3:5D" }), (c) => c === "8D");
sc("S10", "keep an opponent's nil trapped", sv({ bids: [4, 0, 3, 4], tricks: [2, 0, 3, 4], hand: "9H 3H 5C 6D", trick: "1:6H 2:4H 3:2H" }), (c) => c === "3H");
sc("S11", "bid made: don't take a bag when last", sv({ bids: [3, 4, 2, 4], tricks: [3, 1, 2, 1], hand: "KC 3C 7H", trick: "1:9C 2:4C 3:5C" }), (c) => c === "3C");
sc("S12", "set the opponents when they need every trick", sv({ bids: [2, 5, 2, 4], tricks: [1, 4, 2, 2], hand: "KC 5D 6D", trick: "1:QC 2:2C 3:4C" }), (c) => c === "KC");
sc("S13", "can't win: keep the high card", sv({ bids: [4, 3, 4, 3], hand: "QD 3D 9H 9C", trick: "1:AD 2:4D 3:5D" }), (c) => c === "3D");
sc("S14", "no spade lead early without a long strong suit", sv({ custom: { spadesBroken: false }, broken: false, hand: "6S 4S 3S 9H 8H 5D 4D 3C 7C 8C TC JC QC" }), (c) => c[1] !== "S");
sc("S15", "six high spades bid at least six", sv({ phase: "bid", bids: [null, null, null, null], hand: "AS KS QS JS TS 9S 2H 3H 4D 5D 2C 3C 4C" }), (a) => a.bid >= 6);
sc("S16", "beside partner's nil, a weak hand may bid 1", sv({ phase: "bid", bids: [null, null, 0, 4], hand: "AH 2S 3H 4H 5H 2D 3D 4D 5D 2C 3C 4C 6C" }), (a) => a.bid >= 1 && a.bid <= 2);
sc("S18", "partner's nil, my lead: lead a winner, never low into partner", sv({ bids: [4, 3, 0, 4], hand: "AH 4H 7D 8D 3C 9C" }), (c) => c === "AH");

// ---------------------------------------------------------------- Hearts

const hrun = (h) => H(h);
sc("H01", "take a point trick to stop a moon", hv({
  hand: "KH 3H 2C 9D",
  taken: [[], [...hrun("QS 4H 5H 6H 8H 9H TH JH"), "2D", "3D"], [], []],
  trick: "2:5H 3:7H",
}), (c) => c === "KH");
sc("H02", "near the end, win the shooter's trick when I can", hv({
  hand: "AD 2C 5S",
  taken: [[], [...hrun("QS 2H 3H 4H 5H 6H 7H 8H 9H TH")], [], []],
  trick: "1:KD 2:3D 3:4D",
}), (c) => c === "AD");
sc("H03", "moon: add 26 when that ends the game with me lowest", hv({ phase: "moon", hand: "", totals: { score: [70, 80, 85, 90] }, taken: [["QS", ...newDeck().filter((c) => c[1] === "H")], [], [], []] }), (a) => a === "add");
sc("H03", "moon: subtract when adding would end the game with me losing", hv({ phase: "moon", hand: "", totals: { score: [90, 10, 80, 85] }, taken: [["QS", ...newDeck().filter((c) => c[1] === "H")], [], [], []] }), (a) => a === "sub");
sc("H06", "I passed the queen: don't lead my ace or king of spades into it", hv({ hand: "AS KS 5D 6D 7C 8C", passed: ["QS", "2H", "3H"], history: ["0:2C 1:3C 2:4C 3:5C"] }), (c) => c !== "AS" && c !== "KS");

// ---------------------------------------------------------------- honesty: what a bot can see (AI_SPEC §1)

{
  const allowed = { spades: "game rules seat dealer phase turn hand sizes bids blind trick tricks history broken totals", hearts: "game rules seat dealer phase turn dir hand sizes passed received trick tricks taken history broken moon totals" };
  for (const [name, g] of [["spades", spades], ["hearts", hearts]]) {
    const rules = rulesFor(cfg, name, "standard");
    for (let i = 0; i < 300; i++) {
      const st = g.newHand(rules, newSeed(), i % 4, undefined, i);
      let steps = Math.floor(rng() * 50);
      while (st.phase !== "done" && steps--) {
        const v = g.view(st, st.turn);
        g.apply(st, decide(v, "standard", rng).action);
      }
      for (let seat = 0; seat < 4; seat++) {
        const v = g.view(st, seat);
        assert.deepEqual(Object.keys(v).sort(), allowed[name].split(" ").sort(), "a view has exactly the public fields");
        const open = new Set([...v.hand, ...v.history.map((h) => h.card), ...v.trick.map((t) => t.card), ...(v.passed || []), ...(v.received || [])]);
        const text = JSON.stringify({ ...v, rules: null });
        for (let o = 0; o < 4; o++) if (o !== seat) for (const c of st.hands[o]) if (!open.has(c)) assert.ok(!text.includes(`"${c}"`), `${name}: seat ${seat} can see ${c} in seat ${o}'s hand`);
      }
    }
  }
  n++; console.log("ok", "views never show another hand, the seed, or who is human");
  const src = readFileSync(new URL("../proto/ai.js", import.meta.url), "utf8");
  assert.deepEqual([...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./ai-euchre.js", "./ai-ohhell.js", "./ai-whist.js", "./cards.js", "./hearts.js", "./ohhell.js", "./spades.js", "./whist.js"]);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /seed|human|purchase|streak|platform|localStorage/i);
  n++; console.log("ok", "ai.js reads nothing but the view (no seed, no human flag, no purchases)");
}

// seat-blind: the same position from a different chair gives the same decision (H04)
{
  const base = hv({ hand: "KS AS 4D 9C 2H", taken: [[], ["3H"], [], []], trick: "1:5S 2:9S 3:JS" });
  const rot = (s) => (s + 2) % 4;
  const turned = { ...structuredClone(base), seat: 2, turn: 2, trick: base.trick.map((t) => ({ ...t, seat: rot(t.seat) })), taken: [[], [], [], ["3H"]] };
  for (const level of ["standard", "expert", "extreme"]) {
    r = 99; const a = decide(structuredClone(base), level, rng).action;
    r = 99; const b = decide(turned, level, rng).action;
    assert.equal(a, b, `H04 ${level}: the decision changed when the table was rotated`);
  }
  n++; console.log("ok", "H04 decisions don't depend on which chair (or who) is watching");
}

assert.ok(estimateTricks(H("AS KS QS JS TS 9S 2H 3H 4D 5D 2C 3C 4C"), rulesFor(cfg, "spades", "standard")) >= 5.5);
console.log(`\n${n} AI checks passed`);
