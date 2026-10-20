// Every partner/opponent sin from docs/AI_SPEC.md as a scenario the bots must pass at every level. Run: node sim/test_ai.mjs
//
// Every position is a real table (review finding T1): four 13-card hands and the bids, passes and plays so far, replayed
// through the game's own apply() with a legality check. So the hidden cards a bot must guess at add up, and Expert and
// Extreme really run their look-ahead; a look-ahead decision that never sampled a world fails the test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rulesFor, newDeck, next } from "../proto/cards.js";
import { newSeed, deal } from "../proto/dealer.js";
import * as spades from "../proto/spades.js";
import * as hearts from "../proto/hearts.js";
import { decide, sins, know, trickInfo, legalFor, LEVELS, estimateTricks, DEFAULT_TUNE } from "../proto/ai.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
const GAMES = { spades, hearts };
let n = 0, looked = 0, r = 7;
const rng = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 2 ** 32);
const H = (s) => (s ? s.split(" ") : []);

// hands: { seat: "cards it was dealt" }; voids: { seat: "suits it must not be dealt" }; the rest of each 13 is filled
// from the leftover deck in a fixed shuffled order (FILL), so a position never changes and still looks like a real deal.
// Spades: bids[seat] (null = still to bid) are made from the dealer's left; swaps: the blind nil exchange, in turn.
// Hearts: without passes the hand is a hold hand; passes: { seat: "3 cards" } for all four, passed left.
// plays: "seat:card ..." in order, each checked legal. Returns the view of the seat whose turn it is.
const FILL = "3TRV-1EVW-2A9C-6H3D-PQ7M-XN4B-Y5";
function table(game, { preset = "standard", custom, hands = {}, voids = {}, bids, blind, swaps = [], passes, plays = "", totals, dealer = 3 }) {
  const rules = rulesFor(cfg, game, preset, custom), g = GAMES[game];
  const st = g.newHand(rules, "0000-0000-0000-0000-0000-0000-01", dealer, totals, passes ? 0 : 3);
  const want = [0, 1, 2, 3].map((s) => H(hands[s]));
  const used = new Set(want.flat());
  assert.equal(used.size, want.flat().length, "a card is in two hands");
  const rest = deal(FILL, 52).map((i) => newDeck(game === "spades" && rules.jokers)[i]).filter((c) => !used.has(c));
  const suit = (c) => (game === "spades" ? spades.eff(c, rules.jokers) : c[1]);
  for (const s of [0, 1, 2, 3].sort((a, b) => (voids[b] || "").length - (voids[a] || "").length))
    while (want[s].length < 13) {
      const i = rest.findIndex((c) => !(voids[s] || "").includes(suit(c)));
      assert.ok(i >= 0, `no card left for seat ${s}`);
      want[s].push(rest.splice(i, 1)[0]);
    }
  st.hands = want;
  if (game === "spades") {
    while (st.phase === "bid" && bids[st.turn] !== null) g.apply(st, { bid: bids[st.turn], blind: !!blind?.[st.turn] });
    for (const a of swaps) g.apply(st, H(a));
  } else if (passes) for (let k = 0; k < 4; k++) g.apply(st, H(passes[st.turn]));
  else st.turn = want.findIndex((h) => h.includes("2C"));
  for (const p of H(plays)) {
    const seat = +p[0], card = p.slice(2);
    assert.equal(st.turn, seat, `${p}: it is seat ${st.turn}'s turn`);
    assert.ok(g.legal(st).includes(card), `${p} is not a legal play`);
    g.apply(st, card);
  }
  const v = g.view(st, st.turn), K = know(v);
  assert.equal(K.unseen.length, v.sizes.reduce((a, x, s) => a + (s === v.seat ? 0 : x), 0), "hidden cards add up");
  return v;
}

const beats = (v, c) => trickInfo(v, know(v)).beats(c);
const suitOf = (v, s) => v.hand.filter((c) => know(v).eff(c) === s);
const low = (v, cs) => cs.reduce((a, b) => (know(v).pow(b) < know(v).pow(a) ? b : a));
const high = (v, cs) => cs.reduce((a, b) => (know(v).pow(b) > know(v).pow(a) ? b : a));

// every level (Easy many times: it is random) must pass check(action, view) without a sin; a look-ahead level that had a
// real choice must have sampled
function sc(id, what, view, check, levels = LEVELS) {
  for (const level of levels) {
    for (let k = 0; k < (level === "easy" ? 12 : 1); k++) {
      const d = decide(structuredClone(view), level, rng, { ...cfg.ai, expertSamples: 12, extremeSamples: 16 });
      assert.deepEqual(sins(view, d.action), [], `${id} ${level}: ${JSON.stringify(d)} commits a sin`);
      assert.ok(check(d.action, view), `${id} ${level}: ${what}; played ${JSON.stringify(d.action)} (${d.reason})`);
      const looks = view.phase === "play" || (view.game === "spades" && view.phase === "bid") || (view.phase === "pass" && level === "extreme");
      if ((level === "expert" || level === "extreme") && looks && legalFor(view).filter((a) => !sins(view, a).length).length > 1) {
        assert.ok(d.samples > 0, `${id} ${level}: the look-ahead never sampled a world (${d.reason})`);
        looked++;
      }
    }
  }
  n++; console.log("ok", id, what);
}
const LV_SKILLED = ["standard", "expert", "extreme"];

// ---------------------------------------------------------------- Spades: bidding

const open = [null, null, null, null];
sc("S01", "never nil holding the ace of spades", table("spades", { bids: open, hands: { 0: "AS 2H 3H 4H 5D 6D 7D 2C 3C 4C 5C 6C 7C" } }), (a) => a.bid > 0);
sc("S01", "never nil holding a joker", table("spades", { preset: "kitchen", bids: open, hands: { 0: "BJ 3H 4H 5H 5D 6D 7D 3C 4C 5C 6C 7C 8C" } }), (a) => a.bid > 0);
sc("S01", "never nil with the king of spades and only one other spade", table("spades", { bids: open, hands: { 0: "KS 2S 2H 3H 4H 5D 6D 7D 2C 3C 4C 5C 6C" } }), (a) => a.bid > 0);
sc("S02", "never nil after partner's nil", table("spades", { dealer: 1, bids: [null, null, 0, 4], hands: { 0: "2S 3S 2H 3H 4H 5H 2D 3D 4D 5D 2C 3C 4C" } }), (a) => a.bid >= 1);
sc("S15", "six high spades bid at least six", table("spades", { bids: open, hands: { 0: "AS KS QS JS TS 9S 2H 3H 4D 5D 2C 3C 4C" } }), (a) => a.bid >= 6);
sc("S16", "beside partner's nil, a weak hand may bid 1", table("spades", { dealer: 1, bids: [null, null, 0, 4], hands: { 0: "AH 2S 3H 4H 5H 2D 3D 4D 5D 2C 3C 4C 6C" } }), (a) => a.bid >= 1 && a.bid <= 2);

// R3: the blind nil exchange. The nil sends its most dangerous cards (spades first), the partner its lowest
{
  const ex = { preset: "kitchen", custom: { jokers: false }, bids: [0, 3, 4, 4], blind: [true, false, false, false], totals: { score: [40, 260], bags: [0, 0] },
    hands: { 0: "AS KS 2D 3D 4D 6D 8D 9D 3C 4C 5C 6C 7C", 2: "2H 3H AH KH QH 5S 6S" } };
  sc("R3", "blind nil exchange: the nil passes its top spades", table("spades", ex), (a) => [...a].sort().join() === "AS,KS");
  sc("R3", "blind nil exchange: the partner passes back its lowest cards", table("spades", { ...ex, swaps: ["AS KS"] }),
    (a, v) => a.length === 2 && a.every((c) => v.hand.filter((x) => !a.includes(x) && !["AS", "KS"].includes(x)).every((x) => spades.pow(x) >= spades.pow(c))));
}

// ---------------------------------------------------------------- Spades: play

const std = (o) => table("spades", { bids: [3, 3, 3, 3], ...o });
sc("S03", "never trump a trick partner is winning when last",
  std({ dealer: 0, hands: { 0: "5S 9S 2C 3C 4D", 1: "9H", 2: "AH", 3: "4H" }, voids: { 0: "H" }, plays: "1:9H 2:AH 3:4H" }), (c) => c[1] !== "S");
sc("S03", "never overtake partner when last",
  std({ dealer: 0, hands: { 0: "KH 2H 5C 7D", 1: "9H", 2: "QH", 3: "4H" }, plays: "1:9H 2:QH 3:4H" }), (c, v) => c[1] === "H" && !beats(v, c));
sc("S04", "never overtrump partner's spade when nobody left can beat it",
  std({ custom: { spadesBroken: false }, dealer: 1, hands: { 0: "KS 3S 4S 5C 6D", 1: "2C", 2: "AS QS", 3: "2S 5S" }, voids: { 1: "S" },
    plays: "2:AS 3:2S 0:4S 1:2C 2:QS 3:5S" }), (c, v) => c[1] === "S" && !beats(v, c));
const nilP = (o) => table("spades", { dealer: 0, bids: [4, 3, 0, 4], plays: "1:5H 2:QH 3:3H", ...o });
sc("S05", "cover partner's nil: beat partner's card", nilP({ hands: { 0: "KH 2H 8C 9D", 1: "5H", 2: "QH", 3: "3H" } }), (c) => c === "KH");
sc("S06", "cover partner's nil: trump rather than throw off", nilP({ hands: { 0: "3S 9S 4C 5C", 1: "5H", 2: "QH", 3: "3H" }, voids: { 0: "H" } }),
  (c, v) => c === low(v, suitOf(v, "S")));
sc("S07", "cover with the lowest winner, keep the big one", nilP({ hands: { 0: "AH KH 2H 8C", 1: "5H", 2: "QH", 3: "3H" } }), (c) => c === "KH");
sc("S08", "partner's nil plays after me: play high to give partner room",
  table("spades", { dealer: 2, bids: [4, 3, 0, 4], hands: { 0: "KC 4C 7D 8H", 3: "9C" }, plays: "3:9C" }), (c, v) => c === high(v, suitOf(v, "C")));
sc("S08", "both nils alive and theirs is winning: keep theirs trapped; partner can still duck",
  table("spades", { dealer: 2, bids: [3, 4, 0, 0], hands: { 0: "KC 4C 7D 8H", 3: "9C" }, plays: "3:9C" }),
  (c, v) => c[1] === "C" && !beats(v, c));
const ownNil = (o) => table("spades", { dealer: 0, bids: [0, 3, 5, 4], plays: "1:9D 2:3D 3:5D", ...o });
sc("S09", "own nil: never trump when I can throw off", ownNil({ hands: { 0: "QS 4H 6H 7C", 1: "9D", 2: "3D", 3: "5D" }, voids: { 0: "D" } }), (c) => c[1] !== "S");
sc("S09", "own nil: duck with the highest card that still loses", ownNil({ hands: { 0: "TD 8D 4H", 1: "9D", 2: "3D", 3: "5D" } }), (c) => c === "8D");
// AI-S1 (review): blind nil, and the cards turn up a bare K♠. Hearts are led, I'm void, and an opponent has already ruffed
// with the A♠: the one free chance to shed the king that sets most nils.
sc("S09", "own nil: dump the K♠ under an ace of spades that already won the trick (AI-S1)",
  table("spades", { preset: "kitchen", custom: { jokers: false, blindSwap: 0 }, dealer: 0, bids: [0, 3, 4, 4], blind: [true, false, false, false],
    hands: { 0: "KS 2D 3D 4D 6D 8D 9D 3C 4C 5C 6C 7C 9C", 1: "5H", 2: "7H", 3: "AS" }, voids: { 3: "H" },
    totals: { score: [40, 260], bags: [0, 0] }, plays: "1:5H 2:7H 3:AS" }), (c) => c === "KS");
sc("S10", "keep an opponent's nil trapped",
  table("spades", { dealer: 0, bids: [4, 0, 3, 4], hands: { 0: "9H 3H 5C 6D", 1: "6H", 2: "4H", 3: "2H" }, plays: "1:6H 2:4H 3:2H" }),
  (c, v) => c[1] === "H" && !beats(v, c));
sc("S11", "bid made: don't take a bag when last",
  table("spades", { bids: [1, 4, 1, 4], hands: { 0: "AD 5H 4C KC 3C 7H", 1: "2D 6H AC 9C", 2: "3D AH 2C 5C", 3: "4D 8H 7C 6C" },
    plays: "0:AD 1:2D 2:3D 3:4D 0:5H 1:6H 2:AH 3:8H 2:2C 3:7C 0:4C 1:AC 1:9C 2:5C 3:6C" }), (c, v) => !beats(v, c));
sc("S12", "set the opponents when they need every trick",
  table("spades", { dealer: 0, bids: [2, 7, 2, 6], hands: { 0: "KC 5D 6D", 1: "QC", 2: "2C", 3: "4C" }, plays: "1:QC 2:2C 3:4C" }), (c, v) => beats(v, c));
sc("S13", "can't win: keep the high card",
  table("spades", { dealer: 0, bids: [4, 3, 4, 3], hands: { 0: "QD 3D 9H 9C", 1: "AD", 2: "4D", 3: "5D" }, plays: "1:AD 2:4D 3:5D" }),
  (c, v) => c === low(v, suitOf(v, "D")));
sc("S14", "no spade lead early without a long strong suit",
  std({ custom: { spadesBroken: false }, hands: { 0: "6S 4S 3S 9H 8H 5D 4D 3C 7C 8C TC JC QC" } }), (c) => c[1] !== "S");
sc("S18", "partner's nil, my lead: lead a winner, never low into partner",
  table("spades", { bids: [4, 3, 0, 4], hands: { 0: "AH 4H 7D 8D 3C 9C" } }), (c, v) => know(v).boss(c));
// AI-S2 (review): their nil plays after me, but the nil's partner is already winning with the K♦: playing low can't
// set the nil, it only gives away a trick we need
sc("AI-S2", "their nil's partner is covering: take the trick we need instead of playing low for nothing",
  table("spades", { dealer: 2, bids: [4, 0, 4, 3], hands: { 0: "AD 3D 5C 6C", 3: "KD" }, plays: "3:KD" }), (c) => c === "AD", LV_SKILLED);

// ---------------------------------------------------------------- Hearts

// seat 1 runs the table: the Q♠ and eight hearts in five tricks; then seat 2 leads a heart
const RUN = "0:2C 1:AC 2:3C 3:4C 1:KC 2:5C 3:6C 0:7C 1:AS 2:QS 3:2S 0:3S 1:AH 2:2H 3:3H 0:4H 1:QH 2:6H 3:8H 0:9H";
sc("H01", "take a point trick to stop a moon",
  table("hearts", { hands: { 0: "2C 7C 3S 4H 9H 4D KH", 1: "AC KC AS AH QH 2D", 2: "3C 5C QS 2H 6H AD 5H", 3: "4C 6C 2S 3H 8H 3D 7H" },
    plays: `${RUN} 1:2D 2:AD 3:3D 0:4D 2:5H 3:7H` }), (c, v) => beats(v, c));
// AI-H1 (review): seat 1 has taken all nine hearts played so far, holds the other four and leads the A♠
sc("H01", "never give the Q♠ to a player who is running every heart (AI-H1)",
  table("hearts", { hands: { 0: "2C QS 5S 2H 3H 4H", 1: "AC KC AH KH QH JH TH 9H AS", 2: "3C 5C 5H 6H 3S", 3: "4C 6C 7H 8H 4S" }, voids: { 0: "C" },
    plays: "0:2C 1:AC 2:3C 3:4C 1:KC 2:5C 3:6C 0:2H 1:AH 2:5H 3:7H 0:3H 1:KH 2:6H 3:8H 0:4H 1:AS 2:3S 3:4S" }), (c) => c !== "QS");
sc("H02", "near the end, win the shooter's trick when I can",
  table("hearts", { hands: { 0: "2C 7C TC 3S 4H 7H TH 6S 9S 4D AD 7D 8D", 1: "AC KC QC AS AH KH QH KS JS QD KD", 2: "3C 5C 8C QS 2H 5H 8H 4S 7S 2D 5D", 3: "4C 6C 9C 2S 3H 6H 9H 5S 8S 3D 6D" },
    plays: "0:2C 1:AC 2:3C 3:4C 1:KC 2:5C 3:6C 0:7C 1:QC 2:8C 3:9C 0:TC 1:AS 2:QS 3:2S 0:3S 1:AH 2:2H 3:3H 0:4H 1:KH 2:5H 3:6H 0:7H " +
      "1:QH 2:8H 3:9H 0:TH 1:KS 2:4S 3:5S 0:6S 1:JS 2:7S 3:8S 0:9S 1:QD 2:2D 3:3D 0:4D 1:KD 2:5D 3:6D" }), (c) => c === "AD");

// seat 0 shoots the moon (twelve clubs and the Q♠; everyone else throws hearts on the clubs), then chooses
function moon(totals) {
  const C = "AC KC QC JC TC 9C 8C 7C 6C 5C 4C 3C".split(" "), Hs = "KH QH JH TH 9H 8H 7H 6H 5H 4H 3H 2H".split(" ");
  const Ds = "3D 4D 5D 6D 7D 8D 9D TD JD QD KD".split(" "), Ss = "AS KS JS TS 9S 8S 7S 6S 5S 4S 3S".split(" ");
  const plays = ["1:2C 2:2D 3:AD 0:AC"];
  for (let i = 1; i < 12; i++) plays.push(`0:${C[i]} 1:${Hs[i - 1]} 2:${i === 1 ? "AH" : Ds[i - 2]} 3:${Ss[i - 1]}`);
  plays.push("0:QS 1:2H 2:KD 3:2S");
  return table("hearts", { preset: "kitchen", dealer: 0, totals: { score: totals }, plays: plays.join(" "),
    hands: { 0: [...C, "QS"].join(" "), 1: ["2C", ...Hs].join(" "), 2: ["AH", "2D", ...Ds].join(" "), 3: [...Ss, "2S", "AD"].join(" ") } });
}
sc("H03", "moon: add 26 when that ends the game with me lowest", moon([70, 80, 85, 90]), (a) => a === "add");
sc("H03", "moon: subtract when adding would end the game with me losing", moon([90, 10, 80, 85]), (a) => a === "sub");
sc("H06", "I passed the queen: don't lead my ace or king of spades into it",
  table("hearts", { hands: { 0: "QS 2H 3H AS KS AC 5D 6D 7C 8C", 1: "2C 9D TD JD", 2: "3C 9S TS JS", 3: "4C 4D 3D 2D" },
    passes: { 0: "QS 2H 3H", 1: "9D TD JD", 2: "9S TS JS", 3: "4D 3D 2D" }, plays: "1:2C 2:3C 3:4C 0:AC" }), (c) => c !== "AS" && c !== "KS");
// AI-H2 (review): scores 60 / 95 / 50 / 70, void in diamonds. The Q♠ on the 95 player's trick ends the game with the
// 50 player winning
sc("H10", "don't end the game with the Q♠ when someone else is lowest (AI-H2)",
  table("hearts", { totals: { score: [60, 95, 50, 70] }, hands: { 0: "2C QS 5H 9S", 1: "AC AD", 2: "3C 3D", 3: "4C 4D" }, voids: { 0: "D" },
    plays: "0:2C 1:AC 2:3C 3:4C 1:AD 2:3D 3:4D" }), (c) => c !== "QS");
// AI-H3, AI-H4 (review): the J♦ is -10 (Kitchen, "Omnibus")
sc("H09", "Omnibus: don't throw the J♦ under someone else's winner (AI-H3)",
  table("hearts", { preset: "kitchen", hands: { 0: "2C JD 4D", 1: "AC KD", 2: "3C 5D", 3: "4C 6D" }, plays: "0:2C 1:AC 2:3C 3:4C 1:KD 2:5D 3:6D" }),
  (c) => c !== "JD");
sc("H09", "Omnibus: last to play, win the J♦ when the trick has no points (AI-H4)",
  table("hearts", { preset: "kitchen", hands: { 0: "2C AD 3D", 1: "AC 5D", 2: "3C JD", 3: "4C 7D" }, plays: "0:2C 1:AC 2:3C 3:4C 1:5D 2:JD 3:7D" }),
  (c) => c === "AD", LV_SKILLED);

// AI-H5: the sin detector never calls a forced play a sin (H06 used to fire when A♠ K♠ were the only cards left)
{
  const v = table("hearts", {});
  Object.assign(v, { hand: ["AS", "KS"], trick: [], passed: ["QS", "2H", "3H"], received: [], dir: 1,
    history: Array.from({ length: 44 }, (_, i) => ({ seat: i % 4, card: newDeck().filter((c) => !["AS", "KS", "QS"].includes(c))[i], n: i >> 2 })) });
  assert.deepEqual(sins(v, "AS"), [], "a forced lead is never a sin");
  n++; console.log("ok", "H06 a forced play is never a sin (AI-H5)");
}

// ---------------------------------------------------------------- honesty: what a bot can see (AI_SPEC §1)

{
  const allowed = { spades: "game rules seat dealer phase turn hand sizes bids blind passed received trick tricks history broken totals", hearts: "game rules seat dealer phase turn dir hand sizes passed received trick tricks taken history broken moon totals" };
  for (const [name, g] of [["spades", spades], ["hearts", hearts]]) {
    for (const preset of ["standard", "kitchen"]) {
      const rules = rulesFor(cfg, name, preset);
      for (let i = 0; i < 150; i++) {
        const st = g.newHand(rules, newSeed(), i % 4, name === "spades" && i % 3 === 0 ? { score: [0, 250], bags: [0, 0] } : undefined, i);
        let steps = Math.floor(rng() * 50);
        while (st.phase !== "done" && steps--) g.apply(st, decide(g.view(st, st.turn), "standard", rng).action);
        for (let seat = 0; seat < 4; seat++) {
          const v = g.view(st, seat);
          assert.deepEqual(Object.keys(v).sort(), allowed[name].split(" ").sort(), "a view has exactly the public fields");
          const open = new Set([...v.hand, ...v.history.map((h) => h.card), ...v.trick.map((t) => t.card), ...(v.passed || []), ...(v.received || [])]);
          const text = JSON.stringify({ ...v, rules: null });
          for (let o = 0; o < 4; o++) if (o !== seat) for (const c of st.hands[o]) if (!open.has(c)) assert.ok(!text.includes(`"${c}"`), `${name}: seat ${seat} can see ${c} in seat ${o}'s hand`);
        }
      }
    }
  }
  n++; console.log("ok", "views never show another hand, the seed, or who is human");
  const src = readFileSync(new URL("../proto/ai.js", import.meta.url), "utf8");
  assert.deepEqual([...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./ai-euchre.js", "./ai-ohhell.js", "./ai-whist.js", "./cards.js", "./hearts.js", "./ohhell.js", "./spades.js", "./whist.js"]);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /seed|human|purchase|streak|platform|localStorage/i);
  n++; console.log("ok", "ai.js reads nothing but the view (no seed, no human flag, no purchases)");
  assert.deepEqual(DEFAULT_TUNE, cfg.ai, "the app's bots (no tune passed) play with the same numbers the sim measures");
  n++; console.log("ok", "the shipped tune equals generator.json's ai section");
}

// seat-blind: the same position from a different chair gives the same decision (H04), look-ahead levels included
{
  const spec = { plays: RUN, hands: { 0: "2C 7C 3S 4H 9H 4D KH 8C 4S 5S TH 5D 6D", 1: "AC KC AS AH QH 2D 9C TC 6S 7S JH 7D 8D",
    2: "3C 5C QS 2H 6H AD 5H JC 8S 9S 9D TD JD", 3: "4C 6C 2S 3H 8H 3D 7H QC TS JS KS QD KD" } }; // all 52 dealt: no fill to rotate
  const turn = (o, k) => ({ hands: Object.fromEntries(Object.entries(o.hands).map(([s, h]) => [(+s + k) % 4, h])),
    plays: o.plays.replace(/(\d):/g, (_, s) => `${(+s + k) % 4}:`) });
  const base = table("hearts", spec), turned = table("hearts", turn(spec, 2));
  assert.equal(turned.seat, (base.seat + 2) % 4);
  for (const level of ["standard", "expert", "extreme"]) {
    r = 99; const a = decide(structuredClone(base), level, rng).action;
    r = 99; const b = decide(structuredClone(turned), level, rng).action;
    assert.equal(a, b, `H04 ${level}: the decision changed when the table was rotated`);
  }
  n++; console.log("ok", "H04 decisions don't depend on which chair (or who) is watching");
}

assert.ok(estimateTricks(H("AS KS QS JS TS 9S 2H 3H 4D 5D 2C 3C 4C"), rulesFor(cfg, "spades", "standard")) >= 5.5);
console.log(`\n${n} AI checks passed; ${looked} look-ahead decisions, every one sampled real worlds`);
