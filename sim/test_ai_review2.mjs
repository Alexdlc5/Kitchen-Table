// Second rules passover (docs/REVIEW_RULES_2.md): scenarios that FAIL on purpose until each finding is fixed. Not in
// `npm run check` or CI. Run: node sim/test_ai_review2.mjs   (each fix flips one line to "ok"; exit 1 while any fail)
// Bot positions are real positions from Standard self-play (seats rotated so the bot is seat 0); the better card was
// measured over 400 sampled deals, each played out with Standard's own policy (REVIEW_RULES_2.md, "How measured").
import { readFileSync } from "node:fs";
import { rulesFor, dealHands, newDeck } from "../proto/cards.js";
import { encode, fingerprint } from "../proto/dealer.js";
import { entry, view as ledgerView } from "../proto/ledger.js";
import * as euchre from "../proto/euchre.js";
import * as ohhell from "../proto/ohhell.js";
import * as whist from "../proto/whist.js";
import { decide, sins } from "../proto/ai.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
let r = 11;
const rng = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 2 ** 32);
const H = (s) => (s ? s.split(" ") : []);
const parse = (t) => H(t).map((x) => ({ seat: +x[0], card: x.slice(2) }));
const LV = ["standard", "expert", "extreme"]; // Easy is allowed its slips
const results = [];
function check(id, what, fn) {
  let ok = false, note = "";
  try { const x = fn(); ok = x === true; note = x === true ? "" : String(x); } catch (e) { note = e.message; }
  results.push({ id, ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${id} ${what}${note ? `\n       ${note}` : ""}`);
}
// each level's move in a position; true when every level passes, else what each played
function levels(v, good) {
  const got = LV.map((lv) => { const d = decide(structuredClone(v), lv, rng, { ...cfg.ai, expertSamples: 24, extremeSamples: 40 }); return [lv, d]; });
  return got.every(([, d]) => good(d.action)) || got.map(([lv, d]) => `${lv} ${JSON.stringify(d.action)} (${d.reason})`).join("; ");
}
const hist = (tricks) => tricks.flatMap((t, i) => parse(t).map((p) => ({ ...p, n: i })));
const sizesFor = (hand, trick, out = []) => [0, 1, 2, 3].map((s) => (out.includes(s) ? 5 : s === 0 ? H(hand).length : H(hand).length - (parse(trick).some((t) => t.seat === s) ? 1 : 0)));

// ---------------------------------------------------------------- the fair deal

check("F1", "the cut changes the deal, not just whose seat gets which of the same four hands", () => {
  const seed = encode([1, 2, 3, 4]), key = new Set();
  for (let c = 0; c < 52; c++) key.add([...dealHands(seed, 0, newDeck(), c)[0]].sort().join(""));
  return key.size > 4 || `52 cuts give only ${key.size} different hands for seat 0: every cut deals the same four hands, rotated round the table`;
});
check("F2", "Euchre, Oh Hell and Whist deal by the player's cut", () => {
  const seed = encode([5, 6, 7, 8]), bad = [];
  for (const [g, m, rules] of [["euchre", euchre, rulesFor(cfg, "euchre")], ["ohhell", ohhell, rulesFor(cfg, "ohhell")], ["whist", whist, rulesFor(cfg, "whist")]])
    if (JSON.stringify(m.newHand(rules, seed, 0, undefined, 0, 17).hands) === JSON.stringify(m.newHand(rules, seed, 0, undefined, 0, 0).hands)) bad.push(g);
  return !bad.length || `newHand(..., cut 17) deals exactly what cut 0 deals in: ${bad.join(", ")}`;
});
check("F3", "the fingerprint shown before the cut is at least 64 bits (16 hex characters)", () => {
  const fp = fingerprint(encode([9, 9, 9, 9])).replace(/\s/g, "");
  return fp.length >= 16 || `fingerprint is ${fp.length * 4} bits ("${fp}"): a seed with any chosen fingerprint takes ~2^32 hashes, seconds on a GPU`;
});
check("F4", "the Fair deal screen: fewer than 1 fair player in 7 sees a bar outside its band", () => {
  let a = 77, any = 0;
  const rnd = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0));
  const players = 150;
  for (let p = 0; p < players; p++) {
    const es = [];
    for (let h = 0; h < 300; h++) {
      const game = h % 2 ? "hearts" : "spades", d = dealHands(encode([rnd(), rnd(), rnd(), rnd()]), h % 4, newDeck());
      es.push(entry({ hand: d[0], others: d.slice(1), game, rules: { jokers: false, minBid: 0 }, standing: ["ahead", "level", "behind"][h % 3] }));
    }
    if (ledgerView(es).sections.some((s) => s.rows.some((x) => x.mine != null && (x.mine < x.lo || x.mine > x.hi)))) any++;
  }
  return any / players < 1 / 7 || `${((100 * any) / players).toFixed(0)}% of fair players (300 hands each) see at least one bar outside its 95% band`;
});

// ---------------------------------------------------------------- rules and presets

check("R1", "Kitchen ships the 2-card blind nil exchange (blind nil made 30% without it, 73% with it)", () => {
  const k = rulesFor(cfg, "spades", "kitchen");
  return k.blindSwap === 2 || `kitchen blindSwap = ${k.blindSwap}`;
});

// ---------------------------------------------------------------- Euchre

const ev = ({ hand, trick = "", history = [], dealer = 3, maker = 3, trump = "C", up = "AC", out = [], totals = { score: [0, 0] }, phase = "play", calls }) => ({
  game: "euchre", rules: rulesFor(cfg, "euchre"), seat: 0, dealer, phase, turn: 0, hand: H(hand), sizes: sizesFor(hand, trick, out), up,
  trump: phase === "play" ? trump : null, maker: phase === "play" ? maker : null, alone: false, defender: null, out, discard: null,
  calls: calls ?? [{ seat: maker, round: 1, call: "order", alone: false }], trick: parse(trick), tricks: [0, 0, 0, 0], history: hist(history), totals });

check("AI-E1", "Euchre: trumping in, use the 9 of trump and keep the right bower (+0.83 points a hand)", () =>
  levels(ev({ hand: "JC TD QD 9C", trick: "2:TH 3:AH", history: ["0:9S 1:KS 2:QC 3:AS"] }), (c) => c === "9C"));
check("AI-E2", "Euchre: J♠ A♠ K♠ Q♠ A♥ in round two goes alone (alone +3.31, with partner +1.77 a hand)", () => {
  // everyone passed the 9♦ in round one; seat 0, left of the dealer, speaks first in round two
  const v = ev({ phase: "bid2", hand: "JS AS KS QS AH", up: "9D", calls: [0, 1, 2, 3].map((s) => ({ seat: s, round: 1, call: "pass", alone: false })) });
  const s = sins(v, { call: "S", alone: true });
  if (s.length) return `sins() calls the loner ${s.join(", ")} (E07 wants 4 sure tricks), so no level may go alone`;
  return levels(v, (a) => a.call === "S" && a.alone === true);
});

// ---------------------------------------------------------------- Oh Hell

const oh = ({ hand, trick = "", history = [], dealer = 3, bids, tricks, trumpCard, size = 7, totals = { score: [0, 0, 0, 0], hands: 3 } }) => ({
  game: "ohhell", rules: rulesFor(cfg, "ohhell"), seat: 0, dealer, phase: "play", turn: 0, handNo: 3, size, trump: trumpCard[1], trumpCard,
  hand: H(hand), sizes: sizesFor(hand, trick), bids, trick: parse(trick), tricks, history: hist(history), broken: true, totals });

check("AI-O1", "Oh Hell, on my bid and void: throw the 8 of trump under the king of trump, keep the side king for later (+7.6 points)", () =>
  levels(oh({ hand: "KS 8S 8D", trumpCard: "5D", bids: [2, 1, 1, 2], tricks: [2, 1, 1, 0], trick: "2:8H 3:KD",
    history: ["0:AD 1:6H 2:TD 3:2D", "0:KH 1:7H 2:2H 3:QH", "0:2C 1:AC 2:4C 3:6C", "1:8C 2:KC 3:QC 0:7C"] }), (c) => c === "8D"));
check("AI-O2", "Oh Hell, on my bid and void: throw a small trump under the 9 of trump, not the 7 of diamonds (+4.7 points)", () =>
  levels(oh({ hand: "6H 2H 7D", trumpCard: "5H", dealer: 0, bids: [1, 2, 1, 2], tricks: [1, 1, 1, 1], trick: "2:2C 3:9H",
    history: ["1:AS 2:9S 3:4S 0:3S", "1:9D 2:4D 3:JD 0:AD", "0:3C 1:5C 2:JC 3:8H", "3:KS 0:JS 1:3H 2:4H"] }), (c) => c[1] === "H"));

// ---------------------------------------------------------------- Whist

const wh = ({ hand, trick = "", history = [], dealer = 3, trumpCard, tricks = [0, 0, 0, 0], totals = { score: [0, 0] } }) => ({
  game: "whist", rules: rulesFor(cfg, "whist"), seat: 0, dealer, phase: "play", turn: 0, trump: trumpCard[1], trumpCard,
  hand: H(hand), sizes: sizesFor(hand, trick), trick: parse(trick), tricks, history: hist(history), totals });

check("AI-W1", "Whist, third hand: partner led the 4♥ and I hold the boss Q♥: play it, not the 5♥ (+1.5 tricks)", () =>
  levels(wh({ hand: "5H 9H TD 7H JC QH KD", trumpCard: "4S", dealer: 1, tricks: [0, 2, 2, 2], trick: "2:4H 3:2D",
    history: ["2:2S 3:5S 0:9S 1:JS", "1:AH 2:2H 3:KH 0:3H", "1:5C 2:AC 3:2C 0:8C", "2:3S 3:AS 0:8S 1:4S", "3:AD 0:6D 1:4D 2:9D", "3:KC 0:9C 1:7C 2:6S"] }), (c) => c === "QH"));
check("AI-W2", "Whist: partner's 9♣ is winning but the last player can still beat it: ruff with the 6♦ (+1.7 tricks)", () =>
  levels(wh({ hand: "6D 8S 6S JS 9H", trumpCard: "8D", tricks: [2, 1, 3, 2], trick: "2:9C 3:9S",
    history: ["0:AH 1:QH 2:5H 3:3H", "0:2H 1:3D 2:8H 3:4H", "1:6C 2:4C 3:QC 0:2C", "3:AC 0:2D 1:3C 2:5C", "0:5S 1:2S 2:AS 3:4S",
      "2:AD 3:8D 0:4D 1:TD", "2:KC 3:9D 0:6H 1:7C", "3:KH 0:7H 1:3S 2:5D"] }), (c) => c === "6D"));

const failed = results.filter((x) => !x.ok).map((x) => x.id);
console.log(`\n${results.length - failed.length} of ${results.length} review-2 scenarios pass; failing: ${failed.join(", ") || "none"}`);
process.exit(failed.length ? 1 : 0);
