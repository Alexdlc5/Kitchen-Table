// Game-design review (docs/REVIEW_RULES.md): bot plays a strong player would call out, each as a scenario that FAILS
// today. Not part of `npm run check` or CI on purpose; move a scenario into sim/test_ai.mjs once its fix lands.
// Run: node sim/test_ai_review.mjs   (prints every finding, exits 1 while any still fails)
//
// Unlike sim/test_ai.mjs, every position here is a real table: four 13-card hands and the plays so far, replayed through
// the game's own apply() with a legality check. So the hidden cards a bot must guess at add up, and Expert/Extreme
// really run their look-ahead (review finding T1: most test_ai.mjs positions can't be sampled, so those levels fall
// back to the Standard heuristic there).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rulesFor, newDeck, next } from "../proto/cards.js";
import * as spades from "../proto/spades.js";
import * as hearts from "../proto/hearts.js";
import { decide, sins, know } from "../proto/ai.js";
import { deal } from "../proto/dealer.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
const GAMES = { spades, hearts };
const H = (s) => (s ? s.split(" ") : []);
let r = 7;
const rng = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 2 ** 32);

// hands: { seat: "cards it must hold" }; voids: { seat: "suits it must not be dealt" }; the rest of each 13 is filled
// from the leftover deck in a fixed shuffled order (FILL), so a position never changes and still looks like a real deal.
// plays: "seat:card ..." in order, each checked legal.
const FILL = "3TRV-1EVW-2A9C-6H3D-PQ7M-XN4B-Y5";
function table(game, { preset = "standard", custom, hands = {}, voids = {}, bids, blind, plays = "", totals, dealer = 3 }) {
  const rules = rulesFor(cfg, game, preset, custom), g = GAMES[game];
  const st = g.newHand(rules, "0000-0000-0000-0000-0000-0000-01", dealer, totals, 3); // hand 3: Hearts holds, no pass
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
  if (game === "spades") { st.bids = bids; if (blind) st.blind = blind; st.phase = "play"; st.turn = next(dealer); }
  else st.turn = want.findIndex((h) => h.includes("2C"));
  for (const p of H(plays)) {
    const seat = +p[0], card = p.slice(2);
    assert.equal(st.turn, seat, `${p}: it is seat ${st.turn}'s turn`);
    assert.ok(g.legal(st).includes(card), `${p} is not a legal play`);
    g.apply(st, card);
  }
  const v = g.view(st, st.turn), K = know(v);
  assert.equal(K.unseen.length, v.sizes.reduce((a, n, s) => a + (s === v.seat ? 0 : n), 0), "hidden cards add up");
  return v;
}

const LV = { all: ["easy", "standard", "expert", "extreme"], skilled: ["standard", "expert", "extreme"] };
const results = [];
function sc(id, what, view, check, levels = LV.all) {
  const bad = [], seen = [];
  for (const level of levels) {
    let line;
    for (let k = 0; k < (level === "easy" ? 8 : 1); k++) { // Easy is random: try it several times
      const d = decide(structuredClone(view), level, rng, cfg.ai), ok = check(d.action); // shipped sample counts
      line = `${level.padEnd(8)} ${JSON.stringify(d.action)} (${d.reason})${ok ? "" : "  <- wrong"}`;
      if (!ok) { bad.push(level); break; }
    }
    seen.push(line);
  }
  results.push({ id, what, bad });
  const at = `seat ${view.seat} holds ${view.hand.join(" ")}; trick ${view.trick.map((t) => t.seat + ":" + t.card).join(" ") || "(on lead)"}`;
  console.log(bad.length ? "FAIL" : "ok  ", id, what, "\n       " + [at, ...seen].join("\n       "));
}

// ---------------------------------------------------------------- Spades

// AI-S1. Blind nil (Kitchen table), and the cards turn up a bare K♠. Hearts are led, I'm void, and an opponent has
// already ruffed with the A♠: the one free chance to shed the king that sets most nils. The bot throws a club and
// keeps the king (ai.js nil_discard_danger prefers any side card to a spade, even a spade that can no longer win).
sc("AI-S1", "own nil: dump the K♠ under an ace of spades that already won the trick",
  table("spades", { preset: "kitchen", custom: { jokers: false }, dealer: 0, bids: [0, 3, 4, 4], blind: [true, false, false, false],
    hands: { 0: "KS 2D 3D 4D 6D 8D 9D 3C 4C 5C 6C 7C 9C", 1: "5H", 2: "7H", 3: "AS" }, voids: { 3: "H" },
    totals: { score: [40, 260], bags: [0, 0] }, plays: "1:5H 2:7H 3:AS" }),
  (c) => c === "KS");

// AI-S2. Their nil plays after me, but the nil's partner is already winning with the K♦. Playing my 3♦ under it can't
// make the nil take anything (the nil ducks under the king just as easily as under my ace); it only hands the
// opponents a trick we need. Take it with the A♦ and keep the 3♦ for a later lead under the nil.
sc("AI-S2", "their nil's partner is covering: take the trick we need instead of playing low for nothing",
  table("spades", { dealer: 2, bids: [4, 0, 4, 3], hands: { 0: "AD 3D 5C 6C", 3: "KD" },
    plays: "3:KD" }),
  (c) => c === "AD", LV.skilled);

// ---------------------------------------------------------------- Hearts

// AI-H1. One player has taken all nine hearts played so far and holds the other four; they lead the A♠. Giving them the
// Q♠ hands them the moon. The bot's own discard rule refuses to feed the queen to a runner (discard_queen), but
// dump_queen_under, which runs first, has no such guard.
sc("AI-H1", "never give the Q♠ to a player who is running every heart",
  table("hearts", {
    hands: { 0: "2C QS 5S 2H 3H 4H", 1: "AC KC AH KH QH JH TH 9H AS", 2: "3C 5C 5H 6H 3S", 3: "4C 6C 7H 8H 4S" }, voids: { 0: "C" },
    plays: "0:2C 1:AC 2:3C 3:4C 1:KC 2:5C 3:6C 0:2H 1:AH 2:5H 3:7H 0:3H 1:KH 2:6H 3:8H 0:4H 1:AS 2:3S 3:4S",
  }),
  (c) => c !== "QS");

// AI-H2. Scores 60 / 95 / 50 / 70 and I'm void in the led suit. The Q♠ on the 95 player's trick ends the game with the
// 50 player winning and me losing. Hearts bots never look at the scoreboard during play (only for the moon choice).
sc("AI-H2", "don't end the game with the Q♠ when someone else is lowest",
  table("hearts", {
    totals: { score: [60, 95, 50, 70] },
    hands: { 0: "2C QS 5H 9S", 1: "AC AD", 2: "3C 3D", 3: "4C 4D" }, voids: { 0: "D" },
    plays: "0:2C 1:AC 2:3C 3:4C 1:AD 2:3D 3:4D",
  }),
  (c) => c !== "QS", LV.skilled);

// AI-H3. Jack of diamonds is -10 (Kitchen table preset). Following under the K♦ with the J♦ gives the opponent ten
// points for free; the 4♦ does the same job. ai.js heartsPlay has no idea the J♦ is worth anything.
sc("AI-H3", "J♦ preset: don't throw the J♦ under someone else's winner",
  table("hearts", { preset: "kitchen",
    hands: { 0: "2C JD 4D", 1: "AC KD", 2: "3C 5D", 3: "4C 6D" },
    plays: "0:2C 1:AC 2:3C 3:4C 1:KD 2:5D 3:6D",
  }),
  (c) => c === "4D", LV.skilled);

// AI-H4. J♦ preset, last to play on a clean diamond trick holding the J♦'s master: take the -10.
sc("AI-H4", "J♦ preset: last to play, win the J♦ when the trick has no points",
  table("hearts", { preset: "kitchen",
    hands: { 0: "2C AD 3D", 1: "AC 5D", 2: "3C JD", 3: "4C 7D" },
    plays: "0:2C 1:AC 2:3C 3:4C 1:5D 2:JD 3:7D",
  }),
  (c) => c === "AD", LV.skilled);

// AI-H5. The sin detector itself: H06 ("don't lead A♠/K♠ into the queen you passed") fires even when A♠ K♠ are the only
// cards left, so a forced lead counts as a shipped sin and can fail `sim.mjs --check` (it did once in 20,000 Standard
// hands, seed 1 with 8 workers).
{
  const v = table("hearts", {}); // any real table, then the shipped position on top
  Object.assign(v, { hand: ["AS", "KS"], trick: [], passed: ["QS", "2H", "3H"], received: [], dir: 1,
    history: Array.from({ length: 44 }, (_, i) => ({ seat: i % 4, card: newDeck().filter((c) => !["AS", "KS", "QS"].includes(c))[i], n: i >> 2 })) });
  const bad = sins(v, "AS").length ? [`sins() = ${JSON.stringify(sins(v, "AS"))} for a forced lead`] : [];
  results.push({ id: "AI-H5", what: "a forced play is never a sin", bad });
  console.log(bad.length ? "FAIL" : "ok  ", "AI-H5", "a forced play is never a sin", "\n       " + (bad[0] || "sins() = []"));
}

const failing = results.filter((x) => x.bad.length);
console.log(`\n${results.length - failing.length} of ${results.length} review scenarios pass; failing: ${failing.map((x) => x.id).join(", ") || "none"}`);
process.exit(failing.length ? 1 : 0);
