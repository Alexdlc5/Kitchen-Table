// The fair deal ledger (DESIGN.md §7): entry() keeps one small record per deal (your hand as dealt, before any pass),
// view() turns the last deals into what the Fair deal screen draws. Every "expected" number below is a constant
// measured with dealer.js over 200,000 deals, all four seats (`node sim/test_fair.mjs --measure 200000` prints them;
// the test re-measures 50,000 other deals against them). Bands are where a fair deck lands 95% of the time.
import { eff, pow } from "./spades.js";
import { nilRisk, nilForbidden } from "./ai.js";

export const EXPECT = {
  // high cards (A K Q J) per hand by hand size, Euchre's five as "e5": [yours: mean, sd, the other three's average: mean, sd]
  high: {"1":[0.308,0.462,0.308,0.262],"2":[0.617,0.647,0.617,0.358],"3":[0.924,0.784,0.924,0.423],"4":[1.232,0.896,1.232,0.472],"5":[1.539,0.991,1.539,0.508],"6":[1.847,1.074,1.847,0.533],"7":[2.155,1.147,2.155,0.55],"8":[2.462,1.212,2.462,0.558],"9":[2.77,1.271,2.77,0.56],"10":[3.078,1.325,3.078,0.553],"11":[3.385,1.373,3.385,0.54],"12":[3.693,1.415,3.693,0.517],"13":[4,1.455,4,0.485],"e5":[3.335,0.958,3.334,0.381]},
  // % of 13-card hands by shape (suit lengths, longest first), the ten most common and then the rest; the Jokers deck
  // counts its 16 trumps as spades
  shapes: {
    plain: [["4432",21.67],["5332",15.44],["5431",12.87],["5422",10.62],["4333",10.52],["6322",5.67],["6421",4.7],["6331",3.46],["5521",3.21],["4441",2.97],["other",8.88]],
    jokers: [["4432",19.71],["5332",14.85],["5431",12.76],["5422",10.37],["4333",9.37],["6322",6.18],["6421",5.34],["6331",3.84],["5521",3.36],["4441",2.81],["other",11.4]],
  },
  // % of 13-card hands holding 0-1, 2, 3, 4, 5, 6, 7+ spades (trumps, in the Jokers deck)
  spades: { plain: [9.22,20.67,28.62,23.88,12.47,4.15,0.99], jokers: [3.49,11.37,22.42,27.01,20.82,10.54,4.36] },
  // % of Spades hands that are nil-able: [the plain rule, the bots' rule]
  nil: { plain: [4.55,1.12], jokers: [1.12,0.2] },
  queen: 25.00, // % of Hearts hands dealt the queen of spades
  jacks: [0.834,0.758], // jacks in a Euchre hand: mean, sd
};

const HIGH = "AKQJ", NIL_RISK = 0.22; // NIL_RISK: Standard's nil threshold in ai.js
const BUCKETS = ["0 or 1", "2", "3", "4", "5", "6", "7 or more"];
const r2 = (x) => Math.round(x * 100) / 100;
const highs = (h) => h.filter((c) => HIGH.includes(c[0])).length;

// the plain rule players use: at most 2 spades, none above the 9, no ace in another suit
export function plainNil(hand, jokers) {
  const tr = hand.filter((c) => eff(c, jokers) === "S");
  return tr.length <= 2 && tr.every((c) => pow(c, jokers) <= 9) && !hand.some((c) => c[0] === "A" && eff(c, jokers) !== "S");
}

// hand: your cards as dealt; others: the other three hands; standing: "ahead" | "level" | "behind" when the cards were dealt
export function entry({ hand, others = [], game, rules = {}, standing }) {
  const d = game === "euchre" ? "euchre" : game === "spades" && rules.jokers ? "jokers" : "plain", j = d === "jokers";
  const e = { g: game, d, n: hand.length, hc: highs(hand), st: { ahead: "a", level: "l", behind: "b" }[standing] ?? null };
  if (others.length) e.o = r2(others.reduce((a, h) => a + highs(h), 0) / others.length);
  if (d !== "euchre" && hand.length === 13) {
    const len = [..."SHDC"].map((s) => hand.filter((c) => eff(c, j) === s).length);
    e.sh = [...len].sort((a, b) => b - a).join(""); e.sp = len[0];
  }
  if (game === "hearts") e.qs = hand.includes("QS") ? 1 : 0;
  if (game === "spades") { e.nil = plainNil(hand, j) ? 1 : 0; e.nb = !nilForbidden(hand, rules) && nilRisk(hand, rules) <= NIL_RISK ? 1 : 0; }
  if (game === "euchre") e.jk = hand.filter((c) => c[0] === "J").length;
  return e;
}

// a share: k of n hands against p% expected
function share(label, k, n, p) {
  const half = 196 * Math.sqrt(((p / 100) * (1 - p / 100)) / n);
  return { label, mine: r2((100 * k) / n), expected: p, lo: r2(Math.max(0, p - half)), hi: r2(Math.min(100, p + half)), n };
}
// an average: xs = [[yours, expected mean, sd], ...], one per hand (hand sizes may differ)
function average(label, xs) {
  const n = xs.length, sum = (f) => xs.reduce((a, x) => a + f(x), 0);
  if (!n) return { label, mine: null, expected: null, lo: null, hi: null, n };
  const exp = sum((x) => x[1]) / n, half = (1.96 * Math.sqrt(sum((x) => x[2] * x[2]))) / n;
  return { label, mine: r2(sum((x) => x[0]) / n), expected: r2(exp), lo: r2(exp - half), hi: r2(exp + half), n };
}

const MIN = 200, EMPTY = 20;
export function view(entries) {
  const all = (entries || []).filter((e) => e && e.d && typeof e.hc === "number"), n = all.length;
  if (n < EMPTY) return { n, empty: true, sections: [] };
  const hi = (e) => EXPECT.high[e.d === "euchre" ? "e" + e.n : e.n], sections = [];
  const add = (id, title, unit, note, of, rows) => {
    if (!of.length) return; // a game you haven't played
    const ready = of.length >= MIN;
    sections.push({ id, title, unit, n: of.length, hidden: !ready, rows: ready ? rows().filter((r) => r.n) : [],
      note: ready ? note : `Shows after ${MIN} hands (${of.length} so far). Fewer than that, and luck alone moves these numbers too much to tell anything.` });
  };

  const rated = all.filter(hi);
  add("high", "High cards", "cards", "Aces, kings, queens and jacks per hand: yours, and the average of the other three seats. A fair deck gives every seat the same: 4.00 in a 13-card hand.", rated, () => [
    average("You", rated.map((e) => [e.hc, hi(e)[0], hi(e)[1]])),
    average("The other three", rated.filter((e) => e.o != null).map((e) => [e.o, hi(e)[2], hi(e)[3]])),
  ]);
  const placed = rated.filter((e) => e.st);
  add("standing", "When you're ahead or behind", "cards", "Your high cards, by where the score stood when the cards were dealt. The shuffle never sees the score, so all three should land in their bands.", placed, () =>
    [["a", "Ahead"], ["l", "Level"], ["b", "Behind"]].map(([k, label]) => average(label, placed.filter((e) => e.st === k).map((e) => [e.hc, hi(e)[0], hi(e)[1]]))));

  for (const d of ["plain", "jokers"]) {
    const of = all.filter((e) => e.d === d && e.sh), x = d === "jokers" ? ", Jokers deck" : "", top = EXPECT.shapes[d].slice(0, -1);
    add(d === "plain" ? "shapes" : "shapes-jokers", "Hand shapes" + x, "%", `How your 13 cards split across the four suits.${x ? " The Jokers deck has 16 trumps, so its shapes differ from a regular deck's." : ""}`, of, () => [
      ...top.map(([s, p]) => share(s.split("").join("-"), of.filter((e) => e.sh === s).length, of.length, p)),
      share("Other shapes", of.filter((e) => !top.some(([s]) => s === e.sh)).length, of.length, EXPECT.shapes[d].at(-1)[1]),
    ]);
    add(d === "plain" ? "spades" : "trumps-jokers", d === "plain" ? "Spades in your hand" : "Trumps in your hand, Jokers deck", "%",
      d === "plain" ? "Every game with a regular deck, 13 cards each." : "Spades, both jokers and the 2 of diamonds.", of, () =>
        BUCKETS.map((label, i) => share(label, of.filter((e) => Math.min(6, Math.max(0, e.sp - 1)) === i).length, of.length, EXPECT.spades[d][i])));
  }

  const hearts = all.filter((e) => e.g === "hearts" && e.qs != null);
  add("queen", "The queen of spades", "%", "Hearts: how often she's dealt to you. Fair is one hand in four.", hearts, () => [share("Dealt to you", hearts.filter((e) => e.qs).length, hearts.length, EXPECT.queen)]);
  const nils = all.filter((e) => e.g === "spades" && e.nil != null);
  add("nil", "Hands you could bid nil on", "%", "Spades. The plain rule: at most 2 spades, none above the 9, and no ace in another suit. The bots weigh every card.", nils, () =>
    ["plain", "jokers"].flatMap((d) => {
      const of = nils.filter((e) => e.d === d), x = d === "jokers" ? "Jokers deck" : "Regular deck";
      return of.length ? [share(`${x}, plain rule`, of.filter((e) => e.nil).length, of.length, EXPECT.nil[d][0]), share(`${x}, the bots' rule`, of.filter((e) => e.nb).length, of.length, EXPECT.nil[d][1])] : [];
    }));
  const euchre = all.filter((e) => e.g === "euchre" && e.jk != null);
  add("jacks", "Jacks in Euchre", "cards", "Jacks dealt to you in five cards from the 24-card deck, before trump is named.", euchre, () => [average("Jacks per hand", euchre.map((e) => [e.jk, EXPECT.jacks[0], EXPECT.jacks[1]]))]);
  return { n, empty: false, sections };
}
