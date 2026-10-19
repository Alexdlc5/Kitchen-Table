// Every Euchre sin from docs/AI_SPEC.md §5 as a scenario the bots must pass at every level. Run: node sim/test_ai_euchre.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rulesFor } from "../proto/cards.js";
import { newSeed } from "../proto/dealer.js";
import * as E from "../proto/euchre.js";
import { decide, sins, LEVELS } from "../proto/ai.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
let n = 0, r = 11;
const rng = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 2 ** 32);
const H = (s) => (s ? s.split(" ") : []);
const parse = (t) => H(t).map((x) => ({ seat: +x[0], card: x.slice(2) }));

// a table position as seat 0 sees it. trick: "1:9H 2:AH" (seat:card in play order); history: earlier tricks the same way
function ev({ preset = "standard", custom, hand, phase = "play", dealer = 3, up = "9S", trump = "S", maker = 0, alone = false, out = [], calls, trick = "", history = [], totals = { score: [0, 0] } }) {
  const hist = history.flatMap((t, i) => parse(t).map((p) => ({ ...p, n: i }))), tr = parse(trick), left = H(hand).length;
  const sizes = [0, 1, 2, 3].map((s) => (out.includes(s) ? 5 : s === 0 ? left : left - (tr.some((t) => t.seat === s) ? 1 : 0)));
  const tricks = [0, 0, 0, 0]; // who took the earlier tricks doesn't matter to these scenarios
  const bidding = phase === "bid1" || phase === "bid2";
  return { game: "euchre", rules: rulesFor(cfg, "euchre", preset, custom), seat: 0, dealer, phase, turn: 0, hand: H(hand), sizes, up,
    trump: bidding ? null : trump, maker: bidding ? null : maker, alone, defender: null, out, discard: null,
    calls: calls ?? (bidding ? [] : [{ seat: maker, round: 1, call: "order", alone }]), trick: tr, tricks, history: hist, totals };
}

function sc(id, what, view, check) {
  for (const level of LEVELS) {
    for (let k = 0; k < (level === "easy" ? 12 : 1); k++) {
      const d = decide(structuredClone(view), level, rng, { ...cfg.ai, expertSamples: 12, extremeSamples: 16 });
      assert.deepEqual(sins(view, d.action), [], `${id} ${level}: ${JSON.stringify(d)} commits a sin`);
      assert.ok(check(d.action), `${id} ${level}: ${what}; played ${JSON.stringify(d.action)} (${d.reason})`);
    }
  }
  n++; console.log("ok", id, what);
}
const trumpS = (c) => E.eff(c, "S") === "S";

sc("E01", "defending on lead: no trump lead without both bowers and a third", ev({ maker: 1, dealer: 3, hand: "JS AH 9D KC TC" }), (c) => !trumpS(c));
sc("E01", "defending, both bowers and a third trump: the right may lead", ev({ maker: 1, dealer: 3, hand: "JS JC AS 9D KC" }), () => true);
sc("E02", "last, partner winning: never trump it", ev({ maker: 1, hand: "9S KD QC", trick: "1:9H 2:AH 3:TH" }), (c) => c !== "9S");
sc("E02", "last, partner winning: never overtake, play the lowest", ev({ maker: 1, hand: "AH 9H 9C", trick: "1:TH 2:KH 3:QH" }), (c) => c === "9H");
sc("E03", "partner called it: lead the off ace, never a little trump", ev({ maker: 2, dealer: 3, hand: "TS 9S AH KD QC" }), (c) => c === "AH");
sc("E03", "partner called it and I hold the right: lead it or an ace", ev({ maker: 2, dealer: 3, hand: "JS 9S TS KD QC" }), (c) => c === "JS");
sc("E04", "round one: never order up with one trump and no bower", ev({ phase: "bid1", up: "9S", hand: "QS AH AD KH KD" }), (a) => a.call === "pass");
sc("E04", "round two: never name a suit with one trump and no bower", ev({ phase: "bid2", up: "9S", hand: "AS KS QS 9H TD", calls: [0, 1, 2, 3].map((s) => ({ seat: s, round: 1, call: "pass", alone: false })) }), (a) => a.call === "pass");
sc("E04", "stuck dealer: must call, and names a suit (never alone)", ev({ preset: "kitchen", phase: "bid2", dealer: 0, up: "9S", hand: "AS KS QS 9H TD",
  calls: [1, 2, 3, 0, 1, 2, 3].map((s, i) => ({ seat: s, round: i < 4 ? 1 : 2, call: "pass", alone: false })) }), (a) => a.call !== "pass" && a.call !== "S" && !a.alone);
sc("E05", "partner and both opponents out of trump: keep my last trump, lead the side card", ev({ maker: 0, hand: "9S 9H KD QC", history: ["0:JS 1:9C 2:9D 3:TC"] }), (c) => c !== "9S");
sc("E05", "defending: no trump lead to bleed them", ev({ maker: 3, dealer: 2, hand: "9S TS QH KD 9C" }), (c) => !trumpS(c));
sc("E06", "partner's trump wins and the last opponent is out of trump: no overtrump", ev({ maker: 2, dealer: 3, hand: "AS TS 9H KC", history: ["2:JS 3:KS 0:JC 1:9D"], trick: "2:QS 3:9S" }), (c) => c === "TS");
sc("E07", "never alone without four sure tricks", ev({ phase: "bid1", up: "QS", hand: "JS AS KS 9H 9D" }), (a) => !a.alone);
sc("E07", "both bowers, the ace and king of trump and an off ace: go alone (never 'never alone')", ev({ phase: "bid1", up: "9S", hand: "JS JC AS KS AH" }), (a) => a.call === "order" && a.alone);
sc("E07", "Canadian loner: the dealer's partner with an assist hand passes rather than a reckless loner", ev({ phase: "bid1", custom: { canadianLoner: true }, dealer: 2, up: "9S", hand: "QS KS AH 9D TC", calls: [{ seat: 3, round: 1, call: "pass", alone: false }] }), (a) => a.call === "pass");
sc("E09", "farmer's hand: swap three, keep the upcard's suit", ev({ preset: "kitchen", phase: "farmer", up: "QH", hand: "9H TH 9C TC 9S" }), (a) => a.swap && !a.swap.includes("9H") && !a.swap.includes("TH"));

// ---------------------------------------------------------------- honesty: what a bot can see (AI_SPEC §1, E08)

const ALLOWED = "game rules seat dealer phase turn hand sizes up trump maker alone defender out calls discard trick tricks history totals";
{
  for (const preset of cfg.presets) {
    const rules = rulesFor(cfg, "euchre", preset);
    for (let i = 0; i < 200; i++) {
      const st = E.newHand(rules, newSeed(), i % 4);
      let steps = Math.floor(rng() * 25);
      while (st.phase !== "done" && steps--) E.apply(st, decide(E.view(st, st.turn), "standard", rng).action);
      for (let seat = 0; seat < 4; seat++) {
        const v = E.view(st, seat);
        assert.deepEqual(Object.keys(v).sort(), ALLOWED.split(" ").sort(), "a view has exactly the public fields");
        const open = new Set([...v.hand, v.up, ...v.history.map((h) => h.card), ...v.trick.map((t) => t.card), ...(v.discard ? [v.discard] : [])]);
        const text = JSON.stringify({ ...v, rules: null });
        for (let o = 0; o < 4; o++) if (o !== seat) for (const c of st.hands[o]) if (!open.has(c)) assert.ok(!text.includes(`"${c}"`), `seat ${seat} can see ${c} in seat ${o}'s hand`);
        for (const c of st.kitty) if (!open.has(c)) assert.ok(!text.includes(`"${c}"`), `seat ${seat} can see ${c} in the kitty`);
      }
    }
  }
  n++; console.log("ok", "E08 views never show another hand, the kitty, the seed, or who is human");
  const src = readFileSync(new URL("../proto/ai-euchre.js", import.meta.url), "utf8");
  assert.deepEqual([...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./cards.js", "./euchre.js"]);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /seed|human|purchase|streak|platform|localStorage/i);
  n++; console.log("ok", "ai-euchre.js reads nothing but the view (no seed, no human flag, no purchases)");
}

// seat-blind: the same position from the other side of the table gives the same decision
{
  const base = ev({ maker: 1, dealer: 3, hand: "AS TH 9D KC", history: ["1:JS 2:9S 3:QS 0:KS"], trick: "1:AH 2:9H 3:QH" });
  const rot = (s) => (s + 2) % 4, rp = (t) => ({ ...t, seat: rot(t.seat) });
  const turned = { ...structuredClone(base), seat: 2, turn: 2, dealer: rot(base.dealer), maker: rot(base.maker), trick: base.trick.map(rp), history: base.history.map(rp),
    calls: base.calls.map(rp), sizes: [2, 3, 0, 1].map((s) => base.sizes[s]) };
  for (const level of LEVELS) {
    r = 99; const a = decide(structuredClone(base), level, rng).action;
    r = 99; const b = decide(turned, level, rng).action;
    assert.equal(a, b, `E08 ${level}: the decision changed when the table was turned`);
  }
  n++; console.log("ok", "E08 decisions don't depend on which chair (or who) is watching");
}

console.log(`\n${n} Euchre AI checks passed`);
